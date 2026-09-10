"""Command line entry point for the Shoulder demo.

    python -m shoulder.cli            run the negotiation and write fixtures
    python -m shoulder.cli --dry      deterministic seed only, no model calls
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from shoulder.agents.convener import seed_allocation
from shoulder.agents.principal import positions_payload
from shoulder.config import FIXTURES_DIR, MAX_ROUNDS
from shoulder.ledger import Ledger
from shoulder.models.core import Circle, NegotiationOutcome
from shoulder.seed.demo_circle import build_circle
from shoulder.tools.fairness import build_fairness_report, set_active_circle

RULE = "-" * 74


def _write(path: str, payload: dict | list) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    return path


def print_header(circle: Circle) -> None:
    print(RULE)
    print(f"Shoulder  |  {circle.care_recipient}  |  period {circle.period}")
    print(RULE)
    print(f"{len(circle.tasks)} care tasks this month, "
          f"{len(circle.principals)} people in the circle.\n")
    for p in circle.principals:
        pos = p.to_position()
        private_count = sum(1 for c in p.constraints if c.is_private())
        bits = [f"capacity {pos.capacity}", f"{pos.distance_km:.0f} km"]
        if pos.unavailable_weekdays:
            bits.append("off " + "/".join(pos.unavailable_weekdays))
        if pos.unavailable_weekdays_onsite:
            bits.append(
                "no travel " + "/".join(pos.unavailable_weekdays_onsite)
            )
        if pos.refused_task_types:
            bits.append("no " + "/".join(pos.refused_task_types))
        if pos.max_tasks_per_period:
            bits.append(f"max {pos.max_tasks_per_period}")
        line = f"  {p.name:<7} " + ", ".join(bits)
        if private_count:
            line += f"   [{private_count} private constraint(s) the circle never sees]"
        print(line)
    print()


def print_report(report, circle: Circle) -> None:
    print(f"  {'person':<8}{'tasks':>6}{'hours':>8}{'weighted':>10}"
          f"{'capacity':>10}{'adjusted':>10}{'share':>8}")
    for b in report.burdens:
        print(f"  {b.name:<8}{b.task_count:>6}{b.raw_hours:>8.1f}"
              f"{b.weighted_burden:>10.1f}{b.capacity:>10.2f}"
              f"{b.adjusted_share:>10.2f}{b.percent_of_total:>7.0f}%")
    print(f"\n  proportional: {report.proportional}   "
          f"envy free: {report.envy_free}   "
          f"worst deviation: {report.max_deviation}")
    if report.unassigned_tasks:
        print(f"  unassigned: {', '.join(report.unassigned_tasks)}")
    if report.hard_violations:
        for v in report.hard_violations:
            print(f"  VIOLATION: {v}")
    print(f"\n  {report.headline()}")


def run_dry(circle: Circle) -> int:
    """Deterministic path only. Useful when offline or checking the maths."""
    set_active_circle(circle)
    allocation = seed_allocation(circle)
    report = build_fairness_report(circle, allocation)
    print("Deterministic seed allocation (no model calls)\n")
    print_report(report, circle)
    return 0


def run_full(circle: Circle) -> int:
    from shoulder.graph.negotiation import negotiate

    print(f"Negotiating, at most {MAX_ROUNDS} rounds.\n")
    ledger = Ledger(circle.period, persist=True)
    outcome: NegotiationOutcome = negotiate(circle, ledger=ledger)

    print(f"\n{RULE}\nFINAL ROTA\n{RULE}")
    if outcome.final_report:
        print_report(outcome.final_report, circle)

    print(f"\n{RULE}\nWHAT NEEDS A HUMAN\n{RULE}")
    if not outcome.escalations:
        print("  Nothing. The circle settled on its own.")
    for card in outcome.escalations:
        print(f"\n  {card.headline}\n")
        if card.what_i_tried:
            print("  What I tried:")
            for a in card.what_i_tried:
                print(f"    - {a}")
        if card.the_tension:
            print(f"\n  The tension:\n    {card.the_tension}")
        if card.options:
            print("\n  Options:")
            for i, o in enumerate(card.options, 1):
                print(f"    {i}. {o.label}")
                print(f"       {o.consequence}")
        if card.what_i_will_not_decide:
            print(f"\n  What I will not decide:\n    {card.what_i_will_not_decide}")

    family = ledger.entries()
    print(f"\n{RULE}\nWHAT I DID WITHOUT ASKING ({len(family)} ledger entries)\n{RULE}")
    for entry in family:
        when = f"r{entry.round_number}" if entry.round_number else "  "
        print(f"  {when:<3} {entry.summary}")

    written = [
        _write(f"{FIXTURES_DIR}/circle.json", circle.model_dump(mode="json")),
        _write(f"{FIXTURES_DIR}/outcome.json", outcome.model_dump(mode="json")),
        _write(
            f"{FIXTURES_DIR}/positions.json", json.loads(positions_payload(circle.principals))
        ),
        # The family's view only. Private-scope entries stay with each person's
        # agent (in .shoulder/private/) and are never written here.
        _write(f"{FIXTURES_DIR}/ledger.json", ledger.dump()),
    ]
    if outcome.final_report:
        written.append(
            _write(f"{FIXTURES_DIR}/fairness_report.json",
                   outcome.final_report.model_dump(mode="json"))
        )
    if outcome.escalations:
        written.append(
            _write(f"{FIXTURES_DIR}/escalations.json",
                   [c.model_dump(mode="json") for c in outcome.escalations])
        )

    print(f"\n{RULE}\nFIXTURES WRITTEN (the UI builds against these)\n{RULE}")
    for w in written:
        print(f"  {w}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Shoulder demo")
    parser.add_argument("--dry", action="store_true",
                        help="deterministic seed only, no model calls")
    args = parser.parse_args()

    circle = build_circle()
    print_header(circle)
    return run_dry(circle) if args.dry else run_full(circle)


if __name__ == "__main__":
    sys.exit(main())
