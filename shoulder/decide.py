"""Answer the escalation queue from the command line.

    python -m shoulder.decide                           what is waiting, one card at a time
    python -m shoulder.decide <card-id> <option>        choose an option (numbered from 1)
    python -m shoulder.decide <card-id> <option> --by Amina --note "..."
    python -m shoulder.decide --precedents              what it will apply without asking
    python -m shoulder.decide --retire <precedent-id>   the family changed its mind

This is the escalation inbox without the screen. The agent never calls this; a
person does. Every answer that can become a rule does, and is applied from the
next period on, cited back to whoever made it.
"""

from __future__ import annotations

import argparse
import sys

from shoulder.cli import RULE, print_cards
from shoulder.session import write_family
from shoulder.store.family import FamilyStore


def _show_queue(store: FamilyStore) -> int:
    waiting = store.escalations(status="open")
    if not waiting:
        print("Nothing is waiting for you. Everything else was handled.")
        return 0
    print(f"{len(waiting)} decision(s) waiting. One at a time:\n")
    card, _status = waiting[0]
    print(f"{RULE}\n{card.id}  ({card.period})\n{RULE}")
    print_cards([card])
    print(f"\n  Answer with: python -m shoulder.decide {card.id} <option number>")
    if len(waiting) > 1:
        print(f"\n  Then {len(waiting) - 1} more: " + ", ".join(c.id for c, _ in waiting[1:]))
    return 0


def _show_precedents(store: FamilyStore) -> int:
    rules = store.precedents(active_only=False)
    if not rules:
        print("No past decisions yet.")
        return 0
    for p in rules:
        state = "applies" if p.active else "retired"
        print(f"  {p.id}  [{state}]  {p.text}\n      {p.provenance()}, on card {p.source_escalation_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Answer Shoulder's escalations")
    parser.add_argument("card", nargs="?", help="escalation card id")
    parser.add_argument("option", nargs="?", type=int, help="option number, from 1")
    parser.add_argument("--by", default="The family", help="who decided")
    parser.add_argument("--note", default="")
    parser.add_argument("--precedents", action="store_true")
    parser.add_argument("--retire", metavar="PRECEDENT_ID")
    args = parser.parse_args()

    store = FamilyStore()
    if args.precedents:
        return _show_precedents(store)
    if args.retire:
        store.retire(args.retire)
        write_family()
        print(f"Retired {args.retire}. It will not be applied again.")
        return 0
    if not args.card:
        return _show_queue(store)
    if args.option is None:
        parser.error("give an option number")

    try:
        resolution, precedent, also = store.resolve(
            args.card, args.option - 1, decided_by=args.by, note=args.note
        )
    except (KeyError, ValueError, IndexError) as exc:
        print(f"Could not record that: {exc}")
        return 1

    print(f"Recorded: {resolution.option_label}  ({resolution.decided_by})")
    if precedent is not None:
        print(f"From next month, without asking: {precedent.text}")
    else:
        print("This choice is not a standing rule, so nothing will be applied automatically.")
    for other in also:
        print(f"The same decision also answers {other}.")
    write_family()
    return 0


if __name__ == "__main__":
    sys.exit(main())
