"""The authority envelope: what the agent may do alone, and what it hands back.

    python -m shoulder.demos.envelope           no AWS needed
    python -m shoulder.demos.envelope --live    real Sonnet on Bedrock

The Convener is given the October rota exactly as the negotiation leaves it,
Amina carrying the most, and tools that act in the world. Every call goes through
the AuthorityGuard hook:

  default   a scripted Convener tries three things in turn: a reminder, booking
            paid help for the two tasks that would bring the split inside the
            fairness limit, and setting Farah's capacity to the figure that would
            make the numbers near perfect. The last two would genuinely work,
            according to the engine, and neither is the agent's to do.
            Deterministic, so the outcome is the same every run.
  --live    Sonnet 4.5 decides for itself what, if anything, to try.

Inside the envelope the action runs and is written to the ledger. Outside it the
tool never runs; the attempt becomes an escalation card for the family, with the
fairness consequences of each option computed by the deterministic engine.

Writes fixtures/authority_demo.json so the product surface can show the result.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from rich.console import Console
from rich.panel import Panel
from rich.text import Text

from shoulder.agents.convener import attempt_remedies, build_convener_agent, seed_allocation
from shoulder.config import FIXTURES_DIR, REASONING_MODEL
from shoulder.hooks.authority import AuthorityGuard, EnvelopeContext, _without, describe
from shoulder.ledger import Ledger
from shoulder.models.core import EscalationCard
from shoulder.scripted_model import ScriptedModel, ToolCall
from shoulder.seed.demo_circle import build_circle
from shoulder.tools.fairness import build_fairness_report, set_active_circle


def _card(card: EscalationCard) -> Text:
    out = Text()
    out.append(card.headline + "\n\n", style="bold")
    out.append(card.the_tension + "\n\n")
    for i, option in enumerate(card.options, 1):
        delta = f"  (fairness delta {option.fairness_delta:+.3f})" if option.fairness_delta else ""
        out.append(f"{i}. {option.label}", style="bold")
        out.append(f"{delta}\n   {option.consequence}\n")
    out.append("\nWhat I will not decide: ", style="dim")
    out.append(card.what_i_will_not_decide)
    return out


def _best_remedies(ctx: EnvelopeContext) -> tuple[list[str], tuple[str, float]]:
    """What a capable Convener would reach for, found by the fairness engine.

    The scripted Convener does not pick straw men. It asks for exactly the paid
    help and the capacity change that the engine says would work best, so the
    refusal that follows is a refusal of something that would genuinely help.
    """
    tasks = sorted(ctx.allocation.assignments)
    pairs = [[a, b] for i, a in enumerate(tasks) for b in tasks[i + 1 :]]
    paid_help = min(pairs, key=lambda ids: (_without(ctx, set(ids)).max_deviation, ids))

    best: tuple[float, str, float] | None = None
    for p in ctx.circle.principals:
        for step in range(5, 21):
            cap = step / 20
            changed = ctx.circle.model_copy(update={"principals": [
                q.model_copy(update={"capacity": cap}) if q.id == p.id else q
                for q in ctx.circle.principals
            ]})
            dev = build_fairness_report(changed, ctx.allocation).max_deviation
            if best is None or dev < best[0]:
                best = (dev, p.id, cap)
    assert best is not None
    return paid_help, (best[1], best[2])


def run(live: bool) -> int:
    console = Console(highlight=False)
    circle = build_circle()
    set_active_circle(circle)
    allocation = seed_allocation(circle)
    report = build_fairness_report(circle, allocation)
    ctx = EnvelopeContext(circle=circle, allocation=allocation, report=report)
    ledger = Ledger(circle.period)
    guard = AuthorityGuard(ledger=ledger, context=lambda: ctx)

    amina_first = sorted(allocation.bundle("amina"))[0]
    paid_help, capacity = _best_remedies(ctx)

    if live:
        model = None
        mode = f"LIVE: {REASONING_MODEL} on Bedrock, choosing its own actions"
    else:
        model = ScriptedModel([
            ToolCall("send_reminder", {
                "principal_id": "amina",
                "task_ids": [amina_first],
                "note": "A gentle reminder about this one, and thank you.",
            }),
            ToolCall("arrange_paid_help", {
                "task_ids": paid_help,
                "reason": "Covering these two brings every share inside the fairness limit.",
            }),
            ToolCall("change_capacity", {
                "principal_id": capacity[0],
                "new_capacity": capacity[1],
                "reason": "At this capacity the split would be almost exactly fair.",
            }),
            "I sent one reminder. The other two are the family's decisions, so I have raised them.",
        ])
        mode = "SCRIPTED: a stand-in Convener trying three actions in turn"

    agent = build_convener_agent(hooks=[guard], model=model)

    console.rule("[bold]Shoulder  |  the authority envelope")
    console.print(
        "The Convener holds the October rota and tools that act in the world. "
        "A hook decides what it may do alone.\n"
    )
    console.print(f"[dim]model  [/dim]{mode}")
    console.print(f"[dim]rota   [/dim]{report.headline()} Worst deviation {report.max_deviation}.\n")

    with console.status("The Convener is deciding what to do..."):
        remark = attempt_remedies(agent, circle, allocation, report)

    if not guard.decisions:
        console.print(Panel(
            "The Convener chose not to act this time, so there was nothing for the "
            "envelope to judge. Run it again, or run without --live.",
            border_style="yellow",
        ))

    for i, (tool_name, args, decision) in enumerate(guard.decisions, 1):
        what = describe(tool_name, args, ctx)
        if decision.allowed:
            console.print(Panel(
                Text.assemble(
                    ("INSIDE THE ENVELOPE", "bold white on green"), "  done, and written to the ledger\n\n",
                    ("tried  ", "dim"), f"{tool_name}({json.dumps(args, ensure_ascii=False)})\n",
                    ("means  ", "dim"), f"{what}\n",
                    ("why    ", "dim"), decision.why,
                ),
                title=f"Action {i}", border_style="green",
            ))
        else:
            console.print(Panel(
                Text.assemble(
                    ("OUTSIDE THE ENVELOPE", "bold white on red"), "  not done. The tool never ran.\n\n",
                    ("tried  ", "dim"), f"{tool_name}({json.dumps(args, ensure_ascii=False)})\n",
                    ("means  ", "dim"), f"{what}\n",
                    ("why    ", "dim"), decision.why,
                ),
                title=f"Action {i}", border_style="red",
            ))

    for card in guard.cards:
        console.print(Panel(_card(card), title="Escalation card, for the family", border_style="yellow"))

    if remark:
        console.print(f"[dim]the Convener, afterwards:[/dim] {remark}\n")

    console.rule("Ledger: what it did without asking")
    for entry in ledger.entries():
        console.print(f"  [dim]{entry.kind:<18}[/dim] {entry.summary}")

    os.makedirs(FIXTURES_DIR, exist_ok=True)
    path = f"{FIXTURES_DIR}/authority_demo.json"
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "mode": "live" if live else "scripted",
                "decisions": [
                    {
                        "tool": name,
                        "input": args,
                        "allowed": decision.allowed,
                        "why": decision.why,
                        "means": describe(name, args, ctx),
                    }
                    for name, args, decision in guard.decisions
                ],
                "escalations": [c.model_dump(mode="json") for c in guard.cards],
                "ledger": ledger.dump(),
                "convener_remark": remark,
            },
            fh,
            indent=2,
            ensure_ascii=False,
        )
    console.print(f"\n[dim]written to {path}[/dim]")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Show the authority envelope at work")
    parser.add_argument("--live", action="store_true", help="use Sonnet on Bedrock")
    args = parser.parse_args()
    return run(args.live)


if __name__ == "__main__":
    sys.exit(main())
