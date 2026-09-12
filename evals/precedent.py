"""Precedent eval: the family is asked less, month over month.

The demo makes a longitudinal claim: week one it interrupts often, week four
rarely. This runs the same family for four months and counts the interruptions.

The claim only means something with its converse attached, so both are measured:

  it falls        a family that answers its questions with a reusable decision
                  is asked less each month, and then not at all
  only decisions  a family that decides nothing is asked exactly as often the
                  next month. Nothing is learned that nobody decided.
  reversible      retiring a decision brings the question straight back, so the
                  quiet months are the family's doing, not the agent's drift
  cited           every rule applied is written to the ledger naming who
                  decided it and when, so a quiet month can be audited
  care kept       work the family paid for is out of their split and recorded
                  as covered, never quietly dropped
  never re-asked  across generated families, a question already answered does
                  not come back

Model calls are scripted (shoulder.demos.offline); the graph, the stores, the
precedents and the ledger are the real thing.
"""

from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from typing import Any

from evals.common import EvalResult, quiet, ratio
from evals.generate import generate_families
from shoulder.demos.offline import offline_models
from shoulder.models.core import Circle, EscalationCard
from shoulder.seed.demo_circle import NEXT_PERIOD, PERIOD, build_circle
from shoulder.session import run_period
from shoulder.store.family import FamilyStore

MONTHS = [PERIOD, NEXT_PERIOD, "2026-12", "2027-01"]


def _choose(card: EscalationCard, prefer: tuple[str, ...]) -> int | None:
    """Which option this family taps, or None if they leave it for now."""
    for kind in prefer:
        for i, option in enumerate(card.options):
            if option.effect is None or option.effect.kind != kind:
                continue
            if kind == "decline_action" and "paid_help" in prefer:
                continue  # a family that wants paid help does not also refuse it
            return i
    return None


@dataclass
class Policy:
    id: str
    label: str
    prefer: tuple[str, ...]
    # Months after which the family changes its mind and retires what it decided.
    retire_after: int | None = None


POLICIES = [
    Policy("pay", "Pays for help when offered", ("paid_help", "accept_split", "decline_action")),
    Policy("keep", "Keeps the split and the care in the family",
           ("accept_split", "decline_action")),
    Policy("talk", "Talks it through and decides nothing", ("none",)),
    Policy("change-mind", "Pays for help, then changes its mind",
           ("paid_help", "accept_split", "decline_action"), retire_after=2),
]


def _month_circle(period: str) -> Circle:
    from shoulder.demos.next_month import november_circle

    return november_circle() if period == NEXT_PERIOD else build_circle(period)


def _answer(store: FamilyStore, period: str, prefer: tuple[str, ...]) -> list[str]:
    """The family works through the queue, as they would in the inbox."""
    answered = []
    while True:
        waiting = store.escalations(period=period, status="open")
        if not waiting:
            return answered
        card, _status = waiting[0]
        index = _choose(card, prefer)
        if index is None:
            return answered  # left open on purpose
        _resolution, precedent, _also = store.resolve(card.id, index, decided_by="The family")
        answered.append(precedent.id if precedent else "no rule")


def run_policy(policy: Policy, months: list[str]) -> dict[str, Any]:
    state = tempfile.mkdtemp(prefix="shoulder-eval-")
    try:
        store = FamilyStore(state)
        asked, applied, covered, provenance = [], [], [], []
        for i, period in enumerate(months, 1):
            circle = _month_circle(period)
            with quiet():
                run = run_period(period, circle=circle, state_dir=state,
                                 models=offline_models(circle))
            asked.append(len(run.outcome.escalations))
            applied.append(len(run.outcome.applied_precedents))
            covered.append(len(run.outcome.covered))
            provenance.extend(
                e.justification for e in run.ledger.entries() if e.kind == "applied_precedent"
            )
            _answer(store, period, policy.prefer)
            if policy.retire_after == i:
                for p in store.precedents():
                    store.retire(p.id)
        return {"asked": asked, "applied": applied, "covered": covered,
                "provenance": provenance}
    finally:
        shutil.rmtree(state, ignore_errors=True)


def demo_family(result: EvalResult, months: list[str]) -> dict[str, Any]:
    falls = result.check("it falls",
                         "A family that answers with a reusable decision is asked less, then not at all.")
    only = result.check("only their decisions",
                        "A family that decides nothing is asked just as often the next month.")
    back = result.check("reversible",
                        "Retiring a decision brings the question back.")
    cited = result.check("cited",
                         "Every rule applied names who decided it and when.")
    kept = result.check("care kept",
                        "Work the family paid for is recorded as covered, never quietly dropped.")

    runs = {p.id: run_policy(p, months) for p in POLICIES}

    for pid in ("pay", "keep"):
        asked = runs[pid]["asked"]
        falls.record(all(b <= a for a, b in zip(asked, asked[1:])) and asked[-1] == 0,
                     pid, f"asked {asked}")
    talk = runs["talk"]["asked"]
    only.record(len(set(talk)) == 1 and talk[0] > 0, "talk", f"asked {talk}")
    mind = runs["change-mind"]["asked"]
    back.record(mind[1] == 0 and mind[2] > 0, "change-mind", f"asked {mind}")

    for pid, run in runs.items():
        lines = run["provenance"]
        cited.record(all("decided this on" in line for line in lines), pid,
                     f"{[line[:60] for line in lines if 'decided this on' not in line]}")
    pay = runs["pay"]
    kept.record(pay["covered"][1] > 0 and pay["applied"][1] > 0, "pay",
                f"covered {pay['covered']}, applied {pay['applied']}")

    return {p.id: {"label": p.label, "asked": runs[p.id]["asked"],
                   "covered": runs[p.id]["covered"]} for p in POLICIES}


def generated_families(result: EvalResult, n: int, seed: int) -> dict[str, Any]:
    """Two months each, for families nobody designed."""
    never = result.check("never re-asked",
                         "A question the family already answered does not come back.")
    no_rise = result.check("never asked more",
                           "Answering every question never makes the next month noisier.")
    counts: list[tuple[int, int]] = []

    for family in generate_families(n, seed):
        state = tempfile.mkdtemp(prefix="shoulder-eval-")
        try:
            store = FamilyStore(state)
            first = family.circle(MONTHS[0])
            with quiet():
                run_one = run_period(MONTHS[0], circle=first, state_dir=state,
                                     models=offline_models(first))
            _answer(store, MONTHS[0], ("paid_help", "accept_split", "decline_action"))
            covered_titles = {t for p in store.precedents() if p.kind == "paid_help"
                              for t in p.task_titles}
            declined = {p.action for p in store.precedents() if p.kind == "decline_action"}

            second = family.circle(MONTHS[1])
            with quiet():
                run_two = run_period(MONTHS[1], circle=second, state_dir=state,
                                     models=offline_models(second))

            asked = (len(run_one.outcome.escalations), len(run_two.outcome.escalations))
            counts.append(asked)
            no_rise.record(asked[1] <= asked[0], family.id, f"asked {asked[0]} then {asked[1]}")

            titles = {t.id: t.title for t in second.tasks}
            again: list[str] = []
            for card in run_two.outcome.escalations:
                for option in card.options:
                    effect = option.effect
                    if effect is None:
                        continue
                    if effect.kind == "paid_help" and covered_titles and all(
                        titles.get(t) in covered_titles for t in effect.task_ids
                    ):
                        again.append(f"{card.id} offers paid help already agreed")
                if card.kind == "authority_exceeded" and "arrange_paid_help" in declined:
                    again.append(f"{card.id} raises paid help after it was refused")
            never.record(not again, family.id, "; ".join(again))
        finally:
            shutil.rmtree(state, ignore_errors=True)

    return {
        "families": n,
        "asked_first_month": [c[0] for c in counts],
        "asked_second_month": [c[1] for c in counts],
        "quieter_or_equal": ratio(sum(1 for a, b in counts if b <= a), len(counts)),
    }


def run(n: int = 8, seed: int = 7, months: int = 4) -> EvalResult:
    result = EvalResult("precedent", "Precedent regression: asked less, month over month")
    result.metrics = {"demo_family": demo_family(result, MONTHS[:months])}
    result.metrics["generated"] = generated_families(result, n, seed)
    return result
