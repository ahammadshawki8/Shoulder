"""A Strands model that plays back a script instead of calling Bedrock.

Used by the guard demos and the tests, so that the hooks can be exercised through
the real Strands machinery (agent loop, hook registry, tool executor, A2A server)
with no network and no AWS account.

It is not a mock of the agents' judgement and is never used in a negotiation.
Its job is to produce a specific output on demand, including outputs a
well-behaved model would refuse to produce, like a leaked secret. That is what a
guard has to be tested against.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Callable

from strands.models.model import Model


@dataclass
class ToolCall:
    """A scripted turn in which the model calls a tool."""

    name: str
    input: dict[str, Any] = field(default_factory=dict)


Turn = str | ToolCall
Script = list[Turn] | Callable[[list[dict[str, Any]]], Turn]


class ScriptedModel(Model):
    """Plays back turns in order. Text is streamed in small chunks, like a real model.

    Streaming in chunks matters: it reproduces the way a real reply reaches an
    A2A server, which is the path the privacy guard has to cover.
    """

    def __init__(
        self,
        script: Script,
        chunk_size: int = 12,
        structured: Callable[[type, list[dict[str, Any]]], dict[str, Any]] | None = None,
    ) -> None:
        """`structured` answers the deprecated structured_output path, which the
        Convener's revise and escalation calls still use: given the output model
        and the prompt messages, return the fields."""
        self._script = script if callable(script) else list(script)
        self.chunk_size = chunk_size
        self._structured = structured
        self.calls = 0

    def update_config(self, **model_config: Any) -> None:
        return None

    def get_config(self) -> dict[str, Any]:
        return {"model_id": "scripted"}

    def _next(self, messages: list[dict[str, Any]]) -> Turn:
        self.calls += 1
        if callable(self._script):
            return self._script(messages)
        if not self._script:
            return "Nothing further."
        return self._script.pop(0)

    async def stream(self, messages, tool_specs=None, system_prompt=None, **kwargs):  # type: ignore[override]
        turn = self._next(messages)
        yield {"messageStart": {"role": "assistant"}}
        if isinstance(turn, ToolCall):
            yield {
                "contentBlockStart": {
                    "start": {"toolUse": {"toolUseId": f"scripted-{self.calls}", "name": turn.name}}
                }
            }
            yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(turn.input)}}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "tool_use"}}
        else:
            yield {"contentBlockStart": {"start": {}}}
            for i in range(0, len(turn), self.chunk_size):
                yield {"contentBlockDelta": {"delta": {"text": turn[i : i + self.chunk_size]}}}
            yield {"contentBlockStop": {}}
            yield {"messageStop": {"stopReason": "end_turn"}}
        yield {
            "metadata": {
                "usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                "metrics": {"latencyMs": 0},
            }
        }

    async def structured_output(  # type: ignore[override]
        self, output_model, prompt, system_prompt=None, **kwargs
    ) -> AsyncGenerator[dict[str, Any], None]:
        if self._structured is not None:
            self.calls += 1
            yield {"output": output_model(**self._structured(output_model, prompt))}
            return
        turn = self._next(prompt)
        data = turn.input if isinstance(turn, ToolCall) else json.loads(turn)
        yield {"output": output_model(**data)}


def last_text(messages: list[dict[str, Any]]) -> str:
    """The text of the most recent message, for scripts that react to a prompt."""
    for message in reversed(messages):
        texts = [b["text"] for b in message.get("content", []) if "text" in b]
        if texts:
            return "\n".join(texts)
    return ""


def has_tool_result(messages: list[dict[str, Any]]) -> bool:
    return bool(messages) and any(
        "toolResult" in b for b in messages[-1].get("content", [])
    )
