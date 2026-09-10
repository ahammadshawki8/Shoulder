"""Tests for the privacy guard.

The guard is the reason "private facts never leave" is a property of the code
rather than a hope about the model. So these tests drive it with a model that
deliberately leaks, through the real Strands machinery, and assert on what
comes out the other side. No AWS is needed.
"""

from __future__ import annotations

import json

import pytest
from strands.multiagent.a2a import A2AServer

from shoulder.a2a.client import A2ATransport
from shoulder.a2a.local_server import BackgroundServer, free_port
from shoulder.a2a.serve import build_server
from shoulder.agents.convener import seed_allocation
from shoulder.agents.principal import build_principal_agent, critique_allocation
from shoulder.hooks.privacy import WITHHELD, PrivacyScreen, scan_for_leaks
from shoulder.ledger import FAMILY, Ledger
from shoulder.scripted_model import ScriptedModel, ToolCall
from shoulder.seed.demo_circle import build_circle

LEAK = (
    "Farah has chemotherapy infusions every Friday and spends Saturday "
    "recovering. She can still take weekday visits."
)


@pytest.fixture
def farah():
    circle = build_circle()
    principal = circle.principal("farah")
    assert principal is not None
    return principal


@pytest.fixture
def screen(farah):
    return PrivacyScreen(farah)


class TestDetection:
    @pytest.mark.parametrize(
        "text",
        [
            "Farah has chemotherapy on Fridays.",
            "She has CHEMO every week.",
            "Her oncologist says no.",
            "I cannot be the only responsible adult overnight.",
            "Neutropenia rules out nights.",
            "She is having infusions on Fridays.",
            "Her constraints are genuine and health-related.",
        ],
    )
    def test_catches_private_facts(self, screen, text):
        assert screen.findings(text)

    def test_catches_a_fact_split_across_streamed_chunks(self, screen):
        """A streamed reply can break a word in two. A whole-word check misses it."""
        assert screen.findings("She is having chemo\ntherapy")

    @pytest.mark.parametrize(
        "text",
        [
            "This share works for me.",
            "I cannot take T15 on Friday.",
            "I can't do Fridays or Saturdays.",
            "Amina is carrying more than her share.",
            "Happy to take the Thursday appointment instead.",
            # Her private constraints' own wording, which is only their effect.
            # The Convener says this, legitimately, from her Position.
            "Farah refuses night shifts and is unavailable Friday and Saturday.",
            "Cannot do overnight care.",
            # Her mother's care, which she must be free to talk about.
            "I can take the diabetes clinic appointment and the pill organiser refill.",
        ],
    )
    def test_leaves_ordinary_positions_alone(self, screen, text):
        """Stating a position is allowed. Only the reason behind it is private."""
        assert screen.findings(text) == []

    def test_principal_with_nothing_private_is_never_flagged(self):
        amina = build_circle().principal("amina")
        assert amina is not None
        assert PrivacyScreen(amina).findings(LEAK) == []


class TestRedaction:
    def test_withholds_the_whole_text_not_just_the_leaking_sentence(self, screen):
        """From the first live run: with the leaking sentences cut, what remained
        ("she needs help quickly if she develops any complications") still
        pointed at the secret. Everything written in the same breath goes."""
        cleaned, found = screen.redact_text(LEAK)
        assert found
        assert cleaned == WITHHELD

    def test_keeps_a_json_reply_parseable_and_its_verdict_intact(self, screen):
        reply = json.dumps({"verdict": "veto", "reason_class": "hard_constraint",
                            "contested_task_ids": ["T15"], "message": LEAK})
        cleaned, found = screen.redact_text(f"```json\n{reply}\n```")
        assert found
        data = json.loads(cleaned[cleaned.find("{"): cleaned.rfind("}") + 1])
        assert data["verdict"] == "veto"
        assert data["contested_task_ids"] == ["T15"]
        assert data["message"] == WITHHELD

    def test_prose_around_a_json_reply_is_dropped_if_it_leaks(self, screen):
        reply = json.dumps({"verdict": "accept", "message": "Fine."})
        cleaned, found = screen.redact_text(f"She has chemo on Fridays.\n{reply}")
        assert found
        assert json.loads(cleaned) == {"verdict": "accept", "message": "Fine."}


class TestTheHook:
    def test_rewrites_a_leaking_reply_inside_the_agent_loop(self, farah):
        ledger = Ledger("2026-10")
        agent = build_principal_agent(
            farah, ledger=ledger, model=ScriptedModel([LEAK])
        )
        result = str(agent("Why can Farah not do Fridays?"))
        assert scan_for_leaks([result], [farah]) == []
        assert WITHHELD in result

    def test_screens_the_structured_critique_used_in_the_negotiation(self, farah):
        """The in-process transport returns a Critique object, not text. The hook
        has to catch it as the structured output tool call carrying it."""
        circle = build_circle()
        allocation = seed_allocation(circle)
        tasks = {t.id: t for t in circle.tasks}
        leaking = ToolCall("Critique", {
            "principal_id": "farah", "verdict": "veto",
            "reason_class": "hard_constraint", "contested_task_ids": [],
            "message": LEAK,
        })
        agent = build_principal_agent(farah, model=ScriptedModel([leaking]))
        critique = critique_allocation(agent, farah, allocation, tasks, "", 1)
        assert critique.verdict == "veto"
        assert scan_for_leaks([critique.model_dump_json()], [farah]) == []

    def test_a_leaking_critique_is_recorded_as_a_catch(self, farah):
        circle = build_circle()
        ledger = Ledger("2026-10")
        leaking = ToolCall("Critique", {"principal_id": "farah", "verdict": "accept",
                                        "message": LEAK})
        agent = build_principal_agent(farah, ledger=ledger, model=ScriptedModel([leaking]))
        critique_allocation(agent, farah, seed_allocation(circle),
                            {t.id: t for t in circle.tasks}, "", 1)
        assert [e.kind for e in ledger.entries()] == ["withheld_private_detail"]

    def test_working_notes_are_scrubbed_but_not_announced(self, farah):
        """Found in the first live run: in process, the model writes notes before
        its structured answer that quote her constraints back to her. They never
        leave, so the family ledger must not report a catch every round, which
        would itself tell the family she has something private."""
        circle = build_circle()
        ledger = Ledger("2026-10")
        notes = "Checking: her chemo is on Fridays, so nothing can land on those days."
        script = [
            notes,
            ToolCall("Critique", {"principal_id": "farah", "verdict": "accept",
                                  "message": "This works for me."}),
        ]
        agent = build_principal_agent(farah, ledger=ledger, model=ScriptedModel(script))
        critique = critique_allocation(agent, farah, seed_allocation(circle),
                                       {t.id: t for t in circle.tasks}, "", 1)
        assert critique.message == "This works for me."
        assert ledger.entries(None) == []
        # Not announced, but still scrubbed in place, so they cannot surface later.
        assert scan_for_leaks([json.dumps(agent.messages)], [farah]) == []

    def test_family_ledger_learns_a_check_ran_and_nothing_more(self, farah):
        ledger = Ledger("2026-10")
        agent = build_principal_agent(
            farah, wire_format=True, ledger=ledger, model=ScriptedModel([LEAK])
        )
        agent("Why can Farah not do Fridays?")

        family = ledger.dump(FAMILY)
        assert [e["kind"] for e in family] == ["withheld_private_detail"]
        assert scan_for_leaks([json.dumps(family)], [farah]) == []

        private = ledger.private("farah")
        assert len(private) == 1
        assert "chemotherapy" in private[0].details["draft"].lower()


def _serve_leaking_farah(farah, held: bool):
    port = free_port()
    model = ScriptedModel(lambda _m: LEAK, chunk_size=5)
    if held:
        server = build_server("farah", "127.0.0.1", port, principal=farah, model=model)
    else:
        # The stock executor, with the same guarded agent. This is what the
        # server looked like before the reply was held.
        def factory(_ctx):
            agent = build_principal_agent(farah, wire_format=True, model=model)
            agent.name, agent.description = "Farah's agent", "control"
            return agent

        server = A2AServer(agent_factory=factory, host="127.0.0.1", port=port)
    return BackgroundServer(server, "127.0.0.1", port)


class TestOverTheWire:
    def test_nothing_private_crosses_a2a(self, farah):
        with _serve_leaking_farah(farah, held=True) as srv:
            wire = A2ATransport(["farah"], urls={"farah": srv.url}).send(
                srv.url, "Why can Farah not do Fridays?"
            )
        assert scan_for_leaks([wire], [farah]) == []
        assert WITHHELD in wire

    def test_holding_the_reply_is_what_makes_the_hook_sufficient(self, farah):
        """Control. The same guarded agent behind the stock executor leaks,
        because streamed chunks leave before the hook sees the finished message.
        If this ever stops leaking, the SDK changed; re-check before simplifying
        HeldReplyExecutor away."""
        with _serve_leaking_farah(farah, held=False) as srv:
            wire = A2ATransport(["farah"], urls={"farah": srv.url}).send(
                srv.url, "Why can Farah not do Fridays?"
            )
        assert scan_for_leaks([wire], [farah]) != []
