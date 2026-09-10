"""Tests for precedents: turning a human decision into a rule, and applying it."""

from __future__ import annotations

import pytest

from shoulder.agents.convener import build_convener_agent, seed_allocation
from shoulder.hooks.authority import AuthorityGuard, EnvelopeContext, build_card, decide
from shoulder.ledger import Ledger
from shoulder.models.core import Resolution
from shoulder.precedent import accepting, extract, recall
from shoulder.scripted_model import ScriptedModel, ToolCall
from shoulder.seed.demo_circle import NEXT_PERIOD, build_circle
from shoulder.tools.fairness import build_fairness_report, set_active_circle

NOW = "2026-09-11T10:00:00+00:00"


@pytest.fixture
def ctx():
    circle = build_circle()
    set_active_circle(circle)
    allocation = seed_allocation(circle)
    return EnvelopeContext(circle, allocation, build_fairness_report(circle, allocation))


def _resolve(card, index, by="The family"):
    return Resolution(escalation_id=card.id, period=card.period, option_index=index,
                      option_label=card.options[index].label, decided_by=by, decided_at=NOW)


def _paid_help_card(ctx, ids=("T13", "T22")):
    return build_card("arrange_paid_help", {"task_ids": list(ids)}, ctx,
                      decide("arrange_paid_help", {"task_ids": list(ids)}, ctx))


class TestExtraction:
    def test_choosing_paid_help_becomes_a_rule_about_recurring_tasks(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 0), ctx.circle)
        assert p is not None and p.kind == "paid_help"
        assert p.task_titles == ["Wednesday overnight stay", "Follow-up nephrology appointment"]
        assert "the Wednesday overnight stay and the follow-up nephrology appointment" in p.text

    def test_keeping_it_in_the_family_becomes_do_not_ask_again(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 1), ctx.circle)
        assert p is not None and p.kind == "decline_action"
        assert p.action == "arrange_paid_help"

    def test_leaving_someones_capacity_is_scoped_to_that_person(self, ctx):
        args = {"principal_id": "farah", "new_capacity": 0.5}
        card = build_card("change_capacity", args, ctx, decide("change_capacity", args, ctx))
        p = extract(card, _resolve(card, 0), ctx.circle)
        assert p is not None and p.principal_id == "farah"
        assert "Farah" in p.text

    def test_accepting_the_split_remembers_how_uneven_it_was(self, ctx):
        from shoulder.models.core import EscalationCard, EscalationOption, OptionEffect

        card = EscalationCard(id="e", period="2026-10", kind="fairness_breach", headline="h",
                              options=[EscalationOption(label="Keep it", consequence="c",
                                                        effect=OptionEffect(kind="accept_split"))])
        p = extract(card, _resolve(card, 0), ctx.circle, deviation_at_decision=0.229)
        assert p is not None and p.max_deviation == 0.23
        assert "23 percent" in p.text

    def test_a_choice_with_no_effect_is_not_a_rule(self, ctx):
        args = {"principal_id": "farah", "new_capacity": 0.5}
        card = build_card("change_capacity", args, ctx, decide("change_capacity", args, ctx))
        assert extract(card, _resolve(card, 1), ctx.circle) is None

    def test_provenance_names_who_decided_and_when(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 0, by="Amina"), ctx.circle)
        assert p is not None
        assert p.provenance().startswith("Amina decided this on ")
        assert "Sep" in p.provenance()


class TestApplication:
    def test_recall_covers_the_same_tasks_next_month(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 0), ctx.circle)
        november = build_circle(NEXT_PERIOD)
        reduced, covered = recall(november, [p])
        titles = sorted(november.task(t).title for t in covered)
        assert titles == ["Follow-up nephrology appointment", "Wednesday overnight stay"]
        assert len(reduced.tasks) == len(november.tasks) - 2

    def test_a_retired_precedent_is_not_applied(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 0), ctx.circle)
        p.active = False
        assert recall(build_circle(NEXT_PERIOD), [p])[1] == {}

    def test_a_family_decision_widens_the_envelope(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 0), ctx.circle)
        args = {"task_ids": ["T13", "T22"]}
        assert not decide("arrange_paid_help", args, ctx).allowed
        decision = decide("arrange_paid_help", args, ctx, [p])
        assert decision.allowed and decision.precedent is p

    def test_the_envelope_widens_only_as_far_as_the_decision(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 0), ctx.circle)
        assert not decide("arrange_paid_help", {"task_ids": ["T13", "T04"]}, ctx, [p]).allowed

    def test_a_declined_action_is_neither_taken_nor_raised_again(self, ctx):
        card = _paid_help_card(ctx)
        p = extract(card, _resolve(card, 1), ctx.circle)
        ledger, cards = Ledger(ctx.circle.period), []
        guard = AuthorityGuard(ledger=ledger, context=lambda: ctx,
                               on_escalation=cards.append, precedents=[p])
        agent = build_convener_agent(hooks=[guard], model=ScriptedModel([
            ToolCall("arrange_paid_help", {"task_ids": ["T13"], "reason": "x"}), "ok",
        ]))
        agent("Help if you can.")
        assert cards == []
        (entry,) = ledger.entries()
        assert entry.kind == "applied_precedent"
        assert entry.justification.startswith("The family decided this on")

    def test_accepting_holds_only_up_to_the_accepted_spread(self, ctx):
        from shoulder.models.core import Precedent

        p = Precedent(id="p", kind="accept_split", text="t", max_deviation=0.23,
                      source_escalation_id="e", period_decided="2026-10",
                      decided_by="The family", decided_at=NOW)
        assert accepting([p], 0.229) is p
        assert accepting([p], 0.25) is None
