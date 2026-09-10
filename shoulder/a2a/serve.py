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

from strands.multiagent.a2a import A2AServer

from shoulder.agents.principal import build_principal_agent
from shoulder.seed.demo_circle import build_circle

# One port per sibling, fixed so the Convener knows where to find them.
PORTS: dict[str, int] = {"amina": 9101, "rian": 9102, "farah": 9103}


def agent_url(principal_id: str, host: str = "127.0.0.1") -> str:
    return f"http://{host}:{PORTS[principal_id]}"


def build_server(principal_id: str, host: str, port: int) -> A2AServer:
    circle = build_circle()
    principal = circle.principal(principal_id)
    if principal is None:
        raise SystemExit(f"no principal called {principal_id} in the demo circle")

    agent = build_principal_agent(principal, wire_format=True)
    agent.name = f"{principal.name}'s agent"
    agent.description = (
        f"Speaks for {principal.name} in the care circle. Judges whether a "
        f"proposed share of the caring is workable. Answers with a position, "
        f"never with a reason."
    )
    return A2AServer(agent=agent, host=host, port=port)


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
