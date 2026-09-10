"""Talk to Principal Agents across the A2A protocol.

This is where the privacy boundary stops being a design claim and becomes an
observable fact. Everything a sibling's agent says to the circle crosses this
wire, and every payload that crosses it is captured, so the adversarial privacy
eval in Tier 7 can assert that no private fact ever appears in one.

Structured output is not available across A2A, so the principal agents are asked
to answer in strict JSON and the reply is parsed back into a Critique here.

Privacy is enforced on the other side of the wire, inside each principal's own
process (`shoulder.hooks.privacy`, and the held reply in `shoulder.a2a.serve`).
Nothing here screens for private facts, because by the time a reply reaches
this file it has already left the principal. The Convener should never be the
one holding a secret long enough to redact it.
"""

from __future__ import annotations

import asyncio
import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from strands_tools.a2a_client import A2AClientToolProvider

from shoulder.a2a.serve import agent_url
from shoulder.models.core import Critique, Principal
from shoulder.resilience import with_retry
from shoulder.text import clean

# Every message that crossed the wire this run. The privacy eval reads this.
WIRE_LOG: list[dict[str, Any]] = []


def reset_wire_log() -> None:
    WIRE_LOG.clear()


def _extract_json(text: str) -> dict | None:
    """Pull the first JSON object out of a model reply."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fenced:
        candidate = fenced.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return None
        candidate = text[start : end + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _reply_text(response: Any) -> str:
    """Flatten whatever the A2A client returned into plain text."""
    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        chunks: list[str] = []

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                if node.get("kind") == "text" and isinstance(node.get("text"), str):
                    chunks.append(node["text"])
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        walk(response)
        if chunks:
            return "\n".join(chunks)
    return str(response)


class A2ATransport:
    """Sends critique requests to principals over A2A and parses what comes back."""

    def __init__(
        self,
        principal_ids: list[str],
        host: str = "127.0.0.1",
        urls: dict[str, str] | None = None,
    ) -> None:
        self.urls = urls or {pid: agent_url(pid, host) for pid in principal_ids}
        self.provider = A2AClientToolProvider(
            known_agent_urls=list(self.urls.values()), timeout=180
        )

    def send(self, url: str, text: str) -> str:
        """Send one message and return the raw text of everything that came back."""
        return self._send(url, text)

    def _send(self, url: str, text: str) -> str:
        # a2a_send_message is a coroutine, and the graph node calling us is
        # already inside a running event loop, so asyncio.run would refuse.
        # Hand the coroutine to a worker thread that owns its own loop.
        coro = self.provider.a2a_send_message(
            message_text=text, target_agent_url=url
        )
        with ThreadPoolExecutor(max_workers=1) as pool:
            raw = pool.submit(asyncio.run, coro).result()
        return _reply_text(raw)

    def critique(self, principal: Principal, prompt: str, round_number: int) -> Critique:
        url = self.urls[principal.id]

        def _ask() -> Critique:
            reply = self._send(url, prompt)
            WIRE_LOG.append(
                {
                    "round": round_number,
                    "principal_id": principal.id,
                    "direction": "inbound_to_circle",
                    "url": url,
                    "payload": reply,
                }
            )
            data = _extract_json(reply)
            if data is None:
                raise ValueError("principal agent did not return usable JSON")
            data["principal_id"] = principal.id
            return Critique(**data)

        def _silent() -> Critique:
            return Critique(
                principal_id=principal.id,
                verdict="counter",
                reason_class="none",
                message="No response from this agent in time for this round.",
            )

        result = with_retry(
            _ask, label=f"{principal.name} critique over A2A", fallback=_silent
        )
        result.principal_id = principal.id
        result.message = clean(result.message)
        return result
