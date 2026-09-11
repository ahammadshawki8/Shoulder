"""It learns: two months through the real graph, offline.

Every node, hook, store and ledger entry is the real code; only model calls are
scripted (shoulder.demos.offline). These pin the longitudinal claim the demo
makes: a decision taken in one month is applied the next, cited, and the family
is asked less.
"""

from __future__ import annotations

import pytest

from shoulder.demos.offline import offline_models
from shoulder.seed.demo_circle import NEXT_PERIOD, PERIOD, build_circle
from shoulder.session import run_period
from shoulder.store.family import FamilyStore
from shoulder.tools.remedies import price_effect


def _run(period, state_dir):
    circle = build_circle(period)
    return run_period(period, circle=circle, state_dir=state_dir, models=offline_models(circle))


def _option(card, kind):
    return next(i for i, o in enumerate(card.options) if o.effect and o.effect.kind == kind)


@pytest.fixture
def october(tmp_path):
    state = str(tmp_path)
    return state, _run(PERIOD, state)


def test_october_escalates_what_it_cannot_close(october):
    _state, run = october
    kinds = [c.kind for c in run.outcome.escalations]
    assert kinds == ["fairness_breach", "authority_exceeded"]
    assert not run.outcome.settled


def test_every_number_on_the_card_comes_from_the_engine(october):
    _state, run = october
    card = run.outcome.escalations[0]
    circle = run.circle
    for option in card.options:
        expected = price_effect(option.effect, circle, run.outcome.final_allocation,
                                run.outcome.final_report)
        assert option.fairness_delta == expected


def test_the_headline_a_family_reads_first_comes_from_the_engine(october):
    """The first live card led with "70.48 adjusted share ... against a mean of
    62.67". The headline is now the fairness report's own sentence."""
    _state, run = october
    card = run.outcome.escalations[0]
    assert card.headline == run.outcome.final_report.headline()


def test_every_round_records_what_it_tried(october):
    """The fairness bar shows what each round tried beside what it kept. Without
    this every rejected round would look identical to the one before it."""
    _state, run = october
    later = run.outcome.rounds[1:]
    assert later and all(r.tried is not None for r in later)
    assert run.outcome.rounds[0].tried is None


def test_a_decision_in_october_is_applied_in_november(october):
    state, oct_run = october
    store = FamilyStore(state)
    card = oct_run.outcome.escalations[0]
    store.resolve(card.id, _option(card, "paid_help"), decided_by="Amina")

    nov = _run(NEXT_PERIOD, state)
    assert nov.outcome.settled
    assert nov.outcome.escalations == []
    assert len(nov.outcome.covered) == 2

    applied = [e for e in nov.ledger.entries() if e.kind == "applied_precedent"]
    assert applied and applied[0].justification.startswith("Amina decided this on")
    history = store.history()
    assert [h["escalations"] for h in history] == [2, 0]


def test_accepting_the_split_means_it_is_published_next_time(october):
    """The other road: the family keeps the split. November still tries every
    round first, then publishes instead of asking again."""
    state, oct_run = october
    store = FamilyStore(state)
    card = oct_run.outcome.escalations[0]
    store.resolve(card.id, _option(card, "accept_split"))
    paid = oct_run.outcome.escalations[1]
    store.resolve(paid.id, _option(paid, "decline_action"))

    nov = _run(NEXT_PERIOD, state)
    assert nov.outcome.settled_by_precedent is not None
    assert nov.outcome.escalations == []
    assert len(nov.outcome.rounds) == 4, "it must still try before relying on a precedent"
    kinds = [e.kind for e in nov.ledger.entries()]
    assert "applied_precedent" in kinds


def test_an_unanswered_month_is_asked_again(october):
    state, _oct = october
    nov = _run(NEXT_PERIOD, state)
    assert len(nov.outcome.escalations) == 2
