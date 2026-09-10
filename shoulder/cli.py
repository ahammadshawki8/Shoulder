"""Command line entry point for the Shoulder demo.

    python -m shoulder.cli                      negotiate October, write fixtures
    python -m shoulder.cli --period 2026-11     the next month, applying past decisions
    python -m shoulder.cli --dry                deterministic seed only, no model calls

Each run remembers (in .shoulder/) the rota, the escalations, and what each
person told their agent. Answer the escalations with `python -m shoulder.decide`
before running the next month, and those answers are applied.
"""

from __future__ import annotations

import argparse
import sys

from shoulder.agents.convener import seed_allocation
from shoulder.config import MAX_ROUNDS
from shoulder.models.core import Circle, NegotiationOutcome
from shoulder.seed.demo_circle import PERIOD, build_circle
from shoulder.tools.fairness import build_fairness_report, set_active_circle

RULE = "-" * 74


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


def print_cards(cards) -> None:
    for card in cards:
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
                delta = f"  (spread {o.fairness_delta * 100:+.0f} points)" if o.fairness_delta else ""
                print(f"    {i}. {o.label}{delta}")
                print(f"       {o.consequence}")
        if card.what_i_will_not_decide:
            print(f"\n  What I will not decide:\n    {card.what_i_will_not_decide}")


def run_full(circle: Circle) -> int:
    from shoulder.session import run_period, write_family, write_fixtures
    from shoulder.store.family import FamilyStore

    remembered = FamilyStore().precedents()
    print(f"Negotiating, at most {MAX_ROUNDS} rounds. "
          f"{len(remembered)} past decision(s) to apply.\n")
    run = run_period(circle.period, circle=circle)
    outcome: NegotiationOutcome = run.outcome
    ledger = run.ledger

    if outcome.covered:
        print(f"\n{RULE}\nCOVERED BY A PAST DECISION\n{RULE}")
        for task_id in sorted(outcome.covered):
            task = circle.task(task_id)
            print(f"  {task_id}  {task.title if task else ''}")

    print(f"\n{RULE}\nFINAL ROTA\n{RULE}")
    if outcome.final_report:
        print_report(outcome.final_report, circle)

    print(f"\n{RULE}\nWHAT NEEDS A HUMAN\n{RULE}")
    if not outcome.escalations:
        print("  Nothing. The circle settled on its own.")
    print_cards(outcome.escalations)
    if outcome.escalations:
        print("\n  Answer these with: python -m shoulder.decide")

    family = ledger.entries()
    print(f"\n{RULE}\nWHAT I DID WITHOUT ASKING ({len(family)} ledger entries)\n{RULE}")
    for entry in family:
        when = f"r{entry.round_number}" if entry.round_number else "  "
        print(f"  {when:<3} {entry.summary}")

    written = [*write_fixtures(run), write_family()]

    print(f"\n{RULE}\nFIXTURES WRITTEN (the UI builds against these)\n{RULE}")
    for w in written:
        print(f"  {w}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Shoulder demo")
    parser.add_argument("--dry", action="store_true",
                        help="deterministic seed only, no model calls")
    parser.add_argument("--period", default=PERIOD,
                        help=f"month to negotiate, YYYY-MM (default {PERIOD})")
    args = parser.parse_args()

    circle = build_circle(args.period)
    print_header(circle)
    return run_dry(circle) if args.dry else run_full(circle)


if __name__ == "__main__":
    sys.exit(main())
