"""Tests for the family session and each person's own session."""

from __future__ import annotations

import pytest

from shoulder.agents.convener import seed_allocation
from shoulder.hooks.authority import EnvelopeContext, build_card, decide
from shoulder.models.core import (
    Constraint,
    EscalationCard,
    EscalationOption,
    NegotiationOutcome,
    OptionEffect,
    Tier,
)
from shoulder.seed.demo_circle import build_circle
from shoulder.store.family import FamilyStore
from shoulder.store.principal import PrincipalStore, drift
from shoulder.tools.fairness import build_fairness_report


@pytest.fixture
def october(tmp_path):
    """A family store holding October with a fairness card and a paid-help card."""
    circle = build_circle()
    allocation = seed_allocation(circle)
    report = build_fairness_report(circle, allocation)
    ctx = EnvelopeContext(circle, allocation, report)
    args = {"task_ids": ["T13", "T22"]}
    paid = build_card("arrange_paid_help", args, ctx, decide("arrange_paid_help", args, ctx))
    fairness = EscalationCard(
        id="esc-fairness", period=circle.period, kind="fairness_breach", headline="Uneven.",
        options=[
            EscalationOption(label="Keep it", consequence="c", effect=OptionEffect(kind="accept_split")),
            EscalationOption(label="Paid help", consequence="c",
                             effect=OptionEffect(kind="paid_help", task_ids=["T22", "T13"])),
        ],
    )
    outcome = NegotiationOutcome(circle_id=circle.id, period=circle.period, settled=False,
                                 final_allocation=allocation, final_report=report,
                                 escalations=[fairness, paid])
    store = FamilyStore(str(tmp_path))
    store.record_outcome(circle, outcome)
    return store, fairness, paid


class TestFamilyStore:
    def test_escalations_are_queued_in_order(self, october):
        store, fairness, paid = october
        assert [c.id for c, _ in store.escalations(status="open")] == [fairness.id, paid.id]

    def test_one_decision_answers_the_same_question_everywhere(self, october):
        store, fairness, paid = october
        _resolution, precedent, also = store.resolve(fairness.id, 1)
        assert precedent is not None and precedent.kind == "paid_help"
        assert also == [paid.id]
        assert store.escalations(status="open") == []
        assert len(store.precedents()) == 1

    def test_a_card_cannot_be_decided_twice(self, october):
        store, fairness, _paid = october
        store.resolve(fairness.id, 0)
        with pytest.raises(ValueError):
            store.resolve(fairness.id, 1)

    def test_accepting_the_split_records_the_spread_it_accepted(self, october):
        store, fairness, _paid = october
        _r, precedent, _also = store.resolve(fairness.id, 0)
        assert precedent is not None and precedent.max_deviation == 0.23

    def test_changing_your_mind_replaces_the_rule(self, october):
        store, fairness, paid = october
        store.resolve(paid.id, 1)  # keep it in the family
        (declined,) = store.precedents()
        store.retire(declined.id)
        assert store.precedents() == []
        assert len(store.precedents(active_only=False)) == 1

    def test_history_survives_a_new_store_on_the_same_folder(self, october, tmp_path):
        store, fairness, _paid = october
        store.resolve(fairness.id, 1)
        again = FamilyStore(str(tmp_path))
        (row,) = again.history()
        assert row["period"] == "2026-10" and row["escalations"] == 2 and row["resolved"] == 2
        assert again.export()["precedents"][0]["provenance"]


class TestPrincipalSession:
    def test_profile_is_remembered_between_periods(self, tmp_path):
        farah = build_circle().principal("farah")
        store = PrincipalStore("farah", str(tmp_path))
        store.save("2026-10", farah)
        assert store.before("2026-11") == farah
        assert store.before("2026-10") is None

    def test_a_public_change_is_noted_for_the_family(self):
        rian = build_circle().principal("rian")
        changed = rian.model_copy(update={"capacity": 0.7})
        public, private = drift(rian, changed)
        assert public == ["Rian's capacity changed from 0.6 to 0.7."]
        assert private == []

    def test_a_private_change_never_reaches_the_public_half(self):
        farah = build_circle().principal("farah")
        changed = farah.model_copy(deep=True)
        changed.constraints[0].reason = "Chemotherapy moved to Thursdays."
        public, private = drift(farah, changed)
        assert public == []
        assert private and all("Chemotherapy" not in line for line in private)

    def test_a_new_shareable_note_is_public(self):
        amina = build_circle().principal("amina")
        changed = amina.model_copy(deep=True)
        changed.constraints.append(Constraint(id="n", summary="Prefers mornings.",
                                              tier=Tier.SHAREABLE, hardness="soft"))
        public, _ = drift(amina, changed)
        assert public == ["Amina added: Prefers mornings."]
