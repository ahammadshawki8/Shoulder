"""Run the whole negotiation across the A2A protocol.

Starts one server per sibling, each in its own process with its own agent card,
runs the negotiation against them, writes the wire log, and shuts them down.

    python -m shoulder.a2a.demo

The wire log is the artefact that matters. It contains every message that
actually crossed a network boundary, which is what the privacy claim has to be
tested against. A promise that private facts stay private is worth nothing until
you can point at the bytes that left the machine.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

from shoulder.a2a.serve import PORTS, agent_url
from shoulder.cli import RULE, print_header, print_report
from shoulder.config import FIXTURES_DIR
from shoulder.hooks.privacy import scan_for_leaks
from shoulder.seed.demo_circle import build_circle

STARTUP_TIMEOUT = 90.0


def _card_url(pid: str) -> str:
    return f"{agent_url(pid)}/.well-known/agent-card.json"


def _is_up(pid: str) -> bool:
    try:
        with urllib.request.urlopen(_card_url(pid), timeout=2) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError):
        return False


def start_servers(principal_ids: list[str]) -> list[subprocess.Popen]:
    procs: list[subprocess.Popen] = []
    for pid in principal_ids:
        proc = subprocess.Popen(
            [sys.executable, "-m", "shoulder.a2a.serve", "--principal", pid],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        procs.append(proc)
        print(f"  starting {pid} on port {PORTS[pid]} (pid {proc.pid})")
    return procs


def wait_for_servers(principal_ids: list[str]) -> bool:
    deadline = time.time() + STARTUP_TIMEOUT
    pending = set(principal_ids)
    while time.time() < deadline and pending:
        for pid in sorted(pending):
            if _is_up(pid):
                print(f"  {pid} is serving its agent card at {_card_url(pid)}")
                pending.discard(pid)
        if pending:
            time.sleep(1.0)
    if pending:
        print(f"  these never came up: {', '.join(sorted(pending))}")
        return False
    return True


def stop_servers(procs: list[subprocess.Popen]) -> None:
    for proc in procs:
        proc.terminate()
    for proc in procs:
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def main() -> int:
    from shoulder.a2a.client import WIRE_LOG
    from shoulder.graph.negotiation import negotiate

    circle = build_circle()
    principal_ids = [p.id for p in circle.principals]

    print_header(circle)
    print(f"{RULE}\nSTARTING ONE A2A SERVER PER SIBLING\n{RULE}")
    procs = start_servers(principal_ids)

    try:
        if not wait_for_servers(principal_ids):
            stop_servers(procs)
            return 1

        print(f"\n{RULE}\nNEGOTIATING ACROSS THE A2A PROTOCOL\n{RULE}")
        outcome = negotiate(circle, transport="a2a")

        print(f"\n{RULE}\nFINAL ROTA\n{RULE}")
        if outcome.final_report:
            print_report(outcome.final_report, circle)

        print(f"\n{RULE}\nWHAT NEEDS A HUMAN\n{RULE}")
        for card in outcome.escalations:
            print(f"\n  {card.headline}")
            if card.what_i_will_not_decide:
                print(f"\n  {card.what_i_will_not_decide}")
        if not outcome.escalations:
            print("  Nothing. The circle settled on its own.")

        os.makedirs(FIXTURES_DIR, exist_ok=True)
        wire_path = f"{FIXTURES_DIR}/a2a_wire_log.json"
        with open(wire_path, "w", encoding="utf-8") as fh:
            json.dump(WIRE_LOG, fh, indent=2, ensure_ascii=False)

        print(f"\n{RULE}\nWHAT ACTUALLY CROSSED THE WIRE\n{RULE}")
        print(f"  {len(WIRE_LOG)} messages captured to {wire_path}")

        # Check, here and now, that nothing private left any process. Tier 7
        # turns this into a proper adversarial eval; even this version is worth
        # running every time, because a privacy claim nobody checks is just a
        # sentence in a README. It uses the guard's own detector, which also
        # catches a fact split across streamed chunks. The earlier plain
        # substring check did not.
        leaks = scan_for_leaks(
            [entry["payload"] for entry in WIRE_LOG], circle.principals
        )
        if leaks:
            print("  PRIVACY FAILURE, these left the machine:")
            for leak in leaks:
                print(f"    {leak.principal_name}: {leak.matched} ({leak.layer})")
            return 1
        print("  No private constraint appears in any message. Boundary held.")
        return 0
    finally:
        print("\n  shutting down the A2A servers")
        stop_servers(procs)


if __name__ == "__main__":
    sys.exit(main())
