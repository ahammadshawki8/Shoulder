"""Serve one Principal Agent over the A2A protocol.

Each sibling gets their own process, their own port and their own agent card.
That separation is the point: the Convener reaches a principal only across a
network boundary, and the only thing that crosses that boundary is what the
principal's agent chooses to say.

Run one per person:

    python -m shoulder.a2a.serve --principal farah --port 9103

Or let the demo launcher start all three:

    python -m shoulder.a2a.demo
"""

from __future__ import annotations

import argparse
import sys
import warnings
from typing import Any

from strands.models.model import Model
from strands.multiagent.a2a import A2AServer
from strands.multiagent.a2a.executor import StrandsA2AExecutor

from shoulder.agents.principal import build_principal_agent
from shoulder.models.core import Principal
from shoulder.seed.demo_circle import build_circle

# One port per sibling, fixed so the Convener knows where to find them.
PORTS: dict[str, int] = {"amina": 9101, "rian": 9102, "farah": 9103}


def agent_url(principal_id: str, host: str = "127.0.0.1") -> str:
    return f"http://{host}:{PORTS[principal_id]}"


class HeldReplyExecutor(StrandsA2AExecutor):
    """Sends nothing until the whole reply has been through the privacy guard.

    The stock executor forwards every streamed text chunk to the caller as a
    status update the moment the model produces it. That is before any hook has
    seen the finished message, so a guard that runs after the model call would
    be screening text that had already left the process. It is not hypothetical:
    the Block 1 wire log shows every reply arriving twice, once whole and once
    as a trail of fragments.

    Holding the stream closes the gap. The only thing that crosses the wire is
    the final reply, built from the message the guard has already rewritten.
    `tests/test_privacy.py` pins this: the same leaking model served through the
    stock executor leaks, and through this one does not.
    """

    async def _handle_streaming_event(self, event, updater, stream_state) -> None:  # type: ignore[override]
        return None


# The SDK warns on every request that its legacy status-update streaming is not
# spec compliant. With the stream held there is no streaming left to object to,
# so the warning is noise in the demo output.
warnings.filterwarnings("ignore", message="The default A2A response stream")


def build_server(
    principal_id: str,
    host: str,
    port: int,
    *,
    principal: Principal | None = None,
    ledger: Any = None,
    model: Model | None = None,
    system_prompt: str | None = None,
) -> A2AServer:
    if principal is None:
        principal = build_circle().principal(principal_id)
    if principal is None:
        raise SystemExit(f"no principal called {principal_id} in the demo circle")

    def factory(_context_id: str):
        agent = build_principal_agent(
            principal,
            wire_format=True,
            ledger=ledger,
            model=model,
            system_prompt=system_prompt,
        )
        agent.name = f"{principal.name}'s agent"
        agent.description = (
            f"Speaks for {principal.name} in the care circle. Judges whether a "
            f"proposed share of the caring is workable. Answers with a position, "
            f"never with a reason."
        )
        return agent

    # One agent per A2A context, so two callers can never share a conversation.
    server = A2AServer(agent_factory=factory, host=host, port=port)
    server.request_handler.agent_executor = HeldReplyExecutor(agent_factory=factory)
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve one principal over A2A")
    parser.add_argument("--principal", required=True, choices=sorted(PORTS))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()

    port = args.port or PORTS[args.principal]
    server = build_server(args.principal, args.host, port)
    print(f"serving {args.principal} at http://{args.host}:{port}", flush=True)
    server.serve(host=args.host, port=port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
