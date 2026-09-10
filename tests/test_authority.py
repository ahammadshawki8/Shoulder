"""Tests for the authority envelope.

The envelope is the line between "the safe work" and "the human decision". These
tests pin both sides of it, and pin that a refused action becomes a decision for
the family rather than an error, with its consequences computed, not guessed.
"""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from shoulder.agents.convener import build_convener_agent, seed_allocation
from shoulder.hooks.authority import (
    UNKNOWN,
    AuthorityGuard,
    EnvelopeContext,
    _without,
    decide,
)
from shoulder.ledger import Ledger
from shoulder.scripted_model import ScriptedModel, ToolCall
from shoulder.seed.demo_circle import build_circle
from shoulder.tools.fairness import build_fairness_report, set_active_circle


@pytest.fixture
def ctx():
    circle = build_circle()
    set_active_circle(circle)
    allocation = seed_allocation(circle)
    return EnvelopeContext(circle, allocation, build_fairness_report(circle, allocation))


def _held_by(ctx, pid):
    return sorted(ctx.allocation.bundle(pid))


class TestPolicy:
    def test_measuring_is_always_allowed(self, ctx):
        assert decide("fairness_report", {}, ctx).allowed

    def test_reminding_someone_of_their_own_work_is_inside(self, ctx):
        tid = _held_by(ctx, "amina")[0]
        assert decide("send_reminder", {"principal_id": "amina", "task_ids": [tid]}, ctx).allowed

    def test_a_reminder_cannot_hand_someone_new_work(self, ctx):
        not_hers = _held_by(ctx, "rian")[0]
        decision = decide("send_reminder", {"principal_id": "amina", "task_ids": [not_hers]}, ctx)
        assert not decision.allowed

    @pytest.mark.parametrize("tool", ["arrange_paid_help", "drop_task", "change_capacity"])
    def test_consequential_actions_are_outside(self, ctx, tool):
        assert not decide(tool, {}, ctx).allowed

    def test_the_envelope_fails_closed(self, ctx):
        decision = decide("email_the_gp", {}, ctx)
        assert not decision.allowed
        assert decision.why == UNKNOWN


def _convener(ctx, ledger, script):
    cards = []
    guard = AuthorityGuard(ledger=ledger, context=lambda: ctx, on_escalation=cards.append)
    agent = build_convener_agent(hooks=[guard], model=ScriptedModel(script))
    return agent, guard, cards


def _tool_results(agent):
    return [
        block["toolResult"]
        for m in agent.messages
        for block in m["content"]
        if "toolResult" in block
    ]


class TestTheHook:
    def test_an_outside_action_never_runs_and_becomes_a_card(self, ctx):
        ledger = Ledger(ctx.circle.period)
        ids = ["T13", "T22"]
        agent, guard, cards = _convener(ctx, ledger, [
            ToolCall("arrange_paid_help", {"task_ids": ids, "reason": "closes the gap"}),
            "Raised with the family.",
        ])
        agent("Help if you can.")

        (result,) = _tool_results(agent)
        assert result["status"] == "error"
        assert "booked" not in str(result["content"])
        assert "Not done" in result["content"][0]["text"]

        (card,) = cards
        assert card.kind == "authority_exceeded"
        assert card.what_i_will_not_decide
        assert len(card.options) == 2

    def test_card_consequences_come_from_the_fairness_engine(self, ctx):
        ledger = Ledger(ctx.circle.period)
        ids = ["T13", "T22"]
        agent, _guard, cards = _convener(ctx, ledger, [
            ToolCall("arrange_paid_help", {"task_ids": ids, "reason": "x"}), "done",
        ])
        agent("Help if you can.")
        expected = _without(ctx, set(ids)).max_deviation - ctx.report.max_deviation
        assert cards[0].options[0].fairness_delta == pytest.approx(expected, abs=1e-3)

    def test_an_inside_action_runs_and_is_ledgered_with_its_reason(self, ctx):
        ledger = Ledger(ctx.circle.period)
        tid = _held_by(ctx, "amina")[0]
        agent, _guard, cards = _convener(ctx, ledger, [
            ToolCall("send_reminder", {"principal_id": "amina", "task_ids": [tid], "note": "thanks"}),
            "Sent.",
        ])
        agent("Remind Amina.")

        (result,) = _tool_results(agent)
        assert result["status"] == "success"
        assert cards == []
        (entry,) = ledger.entries()
        assert entry.kind == "took_action"
        assert entry.summary.startswith("Sent Amina a reminder")
        assert entry.justification

    def test_asking_twice_raises_one_card(self, ctx):
        ledger = Ledger(ctx.circle.period)
        call = ToolCall("drop_task", {"task_id": "T13", "reason": "x"})
        agent, _guard, cards = _convener(ctx, ledger, [call, call, "done"])
        agent("Lighten it.")
        assert len(cards) == 1
        assert [e.kind for e in ledger.entries()].count("blocked_action") == 1

    def test_structured_output_is_never_mistaken_for_an_action(self, ctx):
        class Answer(BaseModel):
            text: str

        ledger = Ledger(ctx.circle.period)
        agent, guard, cards = _convener(ctx, ledger, [ToolCall("Answer", {"text": "hi"})])
        result = agent("Answer.", structured_output_model=Answer)
        assert result.structured_output.text == "hi"
        assert guard.decisions == [] and cards == []
