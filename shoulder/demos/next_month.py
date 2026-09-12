"""It learns: two months of the same family, back to back.

    python -m shoulder.demos.next_month                     no AWS needed
    python -m shoulder.demos.next_month --live              real models on Bedrock
    python -m shoulder.demos.next_month --live --write-fixtures

  October    the negotiation runs and escalates what it cannot close
  decisions  the family answers the queue, as they would in the inbox
  November   the same care, one month on. Each person's profile is loaded from
             last month and anything that changed is noted. The family's answers
             are applied as precedents, each cited back with who decided it
             and when. The escalation count drops.

Nothing is learned that a person did not decide. The precedents are built by
code from the options the family chose, and applied by code.

Runs in its own state folder (.shoulder/demo-next-month), reset every run, so it
never mixes with a real history. By default the model calls are scripted
(shoulder.demos.offline); every node, hook, store and ledger entry is real.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from shoulder.config import FIXTURES_DIR, STATE_DIR
from shoulder.demos.offline import offline_models
from shoulder.models.core import Constraint, EscalationCard, Tier
from shoulder.seed.demo_circle import NEXT_PERIOD, PERIOD, build_circle
from shoulder.session import run_period, write_family, write_fixtures
from shoulder.store.family import FamilyStore
from shoulder.store.sqlite import LedgerStore, store_path_for

DEMO_STATE = os.path.join(STATE_DIR, "demo-next-month")

# What the family taps, in order of preference, for each card. A family that
# would rather pay for help than keep asking the same sibling to carry more.
PREFERENCE = ["paid_help", "decline_action", "accept_split"]


def _choice(card: EscalationCard) -> int:
    for kind in PREFERENCE:
        for i, option in enumerate(card.options):
            if option.effect is not None and option.effect.kind == kind:
                if kind == "decline_action" and option.effect.action == "arrange_paid_help":
                    continue  # this family said yes to paid help
                return i
    return 0


def november_circle():
    """November, with a month of drift in what people told their agents.

    Amina adds a soft preference, which the family can see. Farah's private
    reason changes, which nobody but her agent ever learns. Neither changes
    what anyone can do, so the difference in November is the family's
    decisions, not the data.
    """
    circle = build_circle(NEXT_PERIOD)
    amina = circle.principal("amina")
    farah = circle.principal("farah")
    assert amina is not None and farah is not None
    amina.constraints.append(Constraint(
        id="amina-mornings",
        summary="Prefers morning appointments where possible.",
        tier=Tier.SHAREABLE,
        hardness="soft",
    ))
    treatment = next(c for c in farah.constraints if c.id == "farah-treatment")
    treatment.reason = (
        "Chemotherapy infusions on Friday, recovering all Saturday. The cycle was "
        "extended by two months. She has not told her brother or sister and does "
        "not intend to."
    )
    return circle


def _cards_panel(console: Console, cards: list[EscalationCard], title: str) -> None:
    if not cards:
        console.print(Panel("Nothing needs you this month.", title=title, border_style="green"))
        return
    body = Text()
    for i, card in enumerate(cards, 1):
        body.append(f"{i}. ", style="bold")
        body.append(f"{card.headline}\n")
    console.print(Panel(body, title=title, border_style="yellow"))


def run(live: bool, write_fixtures_too: bool) -> int:
    console = Console(highlight=False)
    shutil.rmtree(DEMO_STATE, ignore_errors=True)

    console.rule("[bold]Shoulder  |  it learns")
    console.print(
        "model  " + ("LIVE: real models on Bedrock" if live else
                     "SCRIPTED model calls; every node, hook, store and ledger entry is real")
        + "\n"
    )

    # -- October -------------------------------------------------------------
    october = build_circle(PERIOD)
    with console.status("October: negotiating..."):
        oct_run = run_period(
            PERIOD, circle=october, state_dir=DEMO_STATE,
            models=None if live else offline_models(october),
        )
    report = oct_run.outcome.final_report
    assert report is not None
    console.print(
        f"[bold]October[/bold]  {report.headline()} Worst deviation "
        f"{round(report.max_deviation * 100)} percent against a limit of 15."
    )
    _cards_panel(console, oct_run.outcome.escalations,
                 f"October: {len(oct_run.outcome.escalations)} decision(s) for the family")

    # -- the family decides --------------------------------------------------
    store = FamilyStore(DEMO_STATE)
    decided = Text()
    while True:
        waiting = store.escalations(period=PERIOD, status="open")
        if not waiting:
            break
        card, _ = waiting[0]
        index = _choice(card)
        resolution, precedent, also = store.resolve(card.id, index, decided_by="The family")
        decided.append("Tapped: ", style="dim")
        decided.append(f"{resolution.option_label}\n", style="bold")
        if precedent is not None:
            decided.append("  becomes a standing decision: ", style="dim")
            decided.append(f"{precedent.text}\n")
        for other in also:
            decided.append(f"  and answers the same question on {other}\n", style="dim")
    console.print(Panel(decided, title="The family decides, in the inbox", border_style="cyan"))

    # -- November ------------------------------------------------------------
    november = november_circle()
    with console.status("November: negotiating, with what the family decided..."):
        nov_run = run_period(
            NEXT_PERIOD, circle=november, state_dir=DEMO_STATE,
            models=None if live else offline_models(november),
        )
    nov_report = nov_run.outcome.final_report
    assert nov_report is not None
    console.print(
        f"\n[bold]November[/bold]  {nov_report.headline()} Worst deviation "
        f"{round(nov_report.max_deviation * 100)} percent."
    )

    remembered = Text()
    for entry in nov_run.ledger.entries():
        if entry.kind in ("applied_precedent", "noted_change"):
            remembered.append("- ", style="dim")
            remembered.append(entry.summary + "\n")
            if entry.kind == "applied_precedent":
                remembered.append(f"  {entry.justification}\n", style="italic")
    console.print(Panel(remembered or "Nothing.", title="What it applied without asking",
                        border_style="green"))
    _cards_panel(console, nov_run.outcome.escalations,
                 f"November: {len(nov_run.outcome.escalations)} decision(s) for the family")

    farah_private = [
        e for e in LedgerStore(store_path_for("private:farah", DEMO_STATE)).load(NEXT_PERIOD)
        if e.kind == "noted_change"
    ]
    family_view = [e for e in nov_run.ledger.entries() if "farah" in e.actor and e.kind == "noted_change"]
    console.print(Panel(
        Text.assemble(
            ("Farah's own ledger  ", "dim"),
            "; ".join(e.summary for e in farah_private) or "nothing", "\n",
            ("Family ledger       ", "dim"),
            "; ".join(e.summary for e in family_view) or "nothing about it",
        ),
        title="A private change stays private",
        border_style="magenta",
    ))

    table = Table(title="Escalations, month over month")
    for column in ("month", "asked", "worst deviation", "settled", "past decisions applied"):
        table.add_column(column)
    for row in store.history():
        table.add_row(
            row["period"], str(row["escalations"]),
            f"{round(row['max_deviation'] * 100)} percent",
            "yes" if row["settled"] else "no",
            str(len(row["applied_precedents"])),
        )
    console.print(table)

    if write_fixtures_too:
        written = [*write_fixtures(oct_run), *write_fixtures(nov_run),
                   write_family(DEMO_STATE)]
        console.print("[dim]fixtures written: " + ", ".join(written) + "[/dim]")

    before, after = len(oct_run.outcome.escalations), len(nov_run.outcome.escalations)
    return 0 if after < before or before == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Two months, back to back")
    parser.add_argument("--live", action="store_true", help="real models on Bedrock")
    parser.add_argument("--write-fixtures", action="store_true",
                        help=f"write both months and the family history to {FIXTURES_DIR}/")
    args = parser.parse_args()
    return run(args.live, args.write_fixtures)


if __name__ == "__main__":
    sys.exit(main())
