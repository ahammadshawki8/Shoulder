"""The family's agents inside the app: negotiations, handovers, and their privacy.

Every node, hook, store and route here is the real code. Only the model calls
are scripted, so these run with no network. Live runs use the same paths with
Claude on Amazon Bedrock.
"""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from fastapi.testclient import TestClient

from shoulder.api.app import create_app
from shoulder.demos.offline import offline_models
from shoulder.models.core import Allocation
from shoulder.scripted_model import ScriptedModel, ToolCall

FAST = {"mode": "scripted", "delay_s": 0.0, "cooldown_s": 0.0}


def _critique(verdict: str, message: str, contested: list[str] | None = None) -> ScriptedModel:
    return ScriptedModel(
        lambda _messages: ToolCall(
            "Critique",
            {
                "principal_id": "",
                "verdict": verdict,
                "reason_class": "none" if verdict == "accept" else "hard_constraint",
                "contested_task_ids": contested or [],
                "message": message,
            },
        )
    )


def _client(tmp_path, **agent_options) -> TestClient:
    app = create_app(db_path=str(tmp_path / "agents.db"), agent_options={**FAST, **agent_options})
    return TestClient(app)


def _login(client, member="farah"):
    assert client.post("/api/session", json={"family_code": "rahman", "member_id": member}).status_code == 200


def _settle(client, timeout=60.0):
    assert client.app.state.agents.wait_idle(timeout), "the agents did not finish in time"
    return client.get("/api/family").json()


# -- negotiations --------------------------------------------------------------


def test_a_family_can_ask_the_agents_to_negotiate(tmp_path):
    with _client(tmp_path) as client:
        _login(client)
        assert client.post("/api/agents/negotiate").status_code == 200
        view = _settle(client)
        steps = [e for e in view["ledger"] if e.get("run")]
        kinds = {e["kind"] for e in steps}
        assert {"seeded_rota", "asked_for_view", "measured_fairness"} <= kinds
        assert any("current plan" in e["summary"] for e in steps)
        assert view["agents"]["last"]["status"] == "done"
        assert view["agents"]["state"] == "idle"


def test_a_negotiation_replaces_the_old_question_with_its_own(tmp_path):
    with _client(tmp_path) as client:
        _login(client)
        before = {c["id"] for c in client.get("/api/family").json()["escalations"]}
        client.post("/api/agents/negotiate")
        view = _settle(client)
        after = {c["id"] for c in view["escalations"]}
        assert not (before & after), "cards from before the negotiation must not linger"


def test_asking_again_too_soon_is_refused(tmp_path):
    with _client(tmp_path, cooldown_s=600) as client:
        _login(client)
        client.post("/api/agents/negotiate")
        _settle(client)
        again = client.post("/api/agents/negotiate")
        assert again.status_code == 429 and "minute" in again.json()["detail"]


def test_adding_a_task_for_whoever_has_room_starts_a_negotiation(tmp_path):
    with _client(tmp_path) as client:
        _login(client)
        view = client.post(
            "/api/tasks",
            json={"title": "Chemist run", "type": "medication", "on_date": "2026-10-20", "assignee": "auto"},
        ).json()
        task = next(t for t in view["tasks"] if t["title"] == "Chemist run")
        assert "agents will negotiate" in view["why"][task["id"]]
        view = _settle(client)
        assert view["agents"]["last"] and "added Chemist run" in client.app.state.db.last_run("rahman")["reason"]


def test_choosing_me_or_paid_help_does_not_start_a_negotiation(tmp_path):
    with _client(tmp_path) as client:
        _login(client)
        client.post("/api/tasks", json={"title": "Call the GP", "type": "admin", "on_date": "2026-10-20", "assignee": "farah"})
        client.post("/api/tasks", json={"title": "Cleaner", "type": "household", "on_date": "2026-10-21", "assignee": "paid"})
        _settle(client)
        assert client.app.state.db.last_run("rahman") is None


def test_a_private_reason_never_reaches_the_family_even_when_an_agent_tries(tmp_path):
    def models(circle):
        models_ = offline_models(circle)
        models_["farah"] = _critique("veto", "I have chemotherapy infusions every Friday, so not Fridays.")
        return models_

    with _client(tmp_path, models_for=models) as client:
        _login(client, "farah")
        client.post("/api/agents/negotiate")
        _settle(client)
        catches = client.get("/api/me/privacy").json()["catches"]
        assert any("chemotherapy" in c["draft"].lower() for c in catches)

        _login(client, "amina")
        for body in (client.get("/api/family").text, client.get("/api/me/privacy").text):
            assert "chemo" not in body.lower() and "infusion" not in body.lower()
        family = client.get("/api/family").json()
        assert any(e["kind"] == "withheld_private_detail" for e in family["ledger"])


# -- handovers -----------------------------------------------------------------


def _receivable(client, view, giver):
    for task_id, holder in view["assignments"].items():
        if holder != giver or task_id in view["completed"] or task_id in view["covered"]:
            continue
        for other in view["eligible"].get(task_id, []):
            if other != giver:
                return task_id, other
    raise AssertionError("no task that someone else could take")


def test_a_handover_moves_only_when_the_receiving_agent_agrees(tmp_path):
    with _client(tmp_path) as client:
        _login(client, "amina")
        view = client.get("/api/family").json()
        task_id, to = _receivable(client, view, "amina")
        pending = client.post(f"/api/tasks/{task_id}/assign", json={"to": to}).json()
        assert pending["pending_handovers"][task_id]["to"] == to
        assert pending["assignments"][task_id] == "amina", "nothing moves before their agent answers"
        view = _settle(client)
        assert view["assignments"][task_id] == to
        assert task_id not in view["pending_handovers"]
        assert "agent agreed" in view["why"][task_id]


def test_a_handover_the_receiving_agent_declines_stays_put(tmp_path):
    def models(circle):
        models_ = offline_models(circle)
        for p in circle.principals:
            models_[p.id] = _critique("veto", "This does not work for me this month.")
        return models_

    with _client(tmp_path, models_for=models) as client:
        _login(client, "amina")
        view = client.get("/api/family").json()
        task_id, to = _receivable(client, view, "amina")
        client.post(f"/api/tasks/{task_id}/assign", json={"to": to})
        view = _settle(client)
        assert view["assignments"][task_id] == "amina"
        assert any("does not work for" in e["summary"] for e in view["ledger"][:3])


def test_a_handover_outside_someones_limits_is_refused_before_any_agent_is_asked(tmp_path):
    with _client(tmp_path) as client:
        _login(client, "amina")
        view = client.get("/api/family").json()
        # Farah cannot take anything on a Friday.
        friday = next(
            t for t in view["tasks"]
            if date.fromisoformat(t["on_date"]).weekday() == 4 and t["id"] not in view["completed"]
        )
        r = client.post(f"/api/tasks/{friday['id']}/assign", json={"to": "farah"})
        assert r.status_code == 400
        assert client.app.state.db.last_run("rahman", "handover") is None


# -- applying an outcome -------------------------------------------------------


def test_changes_people_make_while_the_agents_talk_are_kept(tmp_path):
    with _client(tmp_path) as client:
        _login(client, "amina")
        service = client.app.state.agents
        db = client.app.state.db
        snapshot = db.read_state("rahman")
        task_id, to = _receivable(client, client.get("/api/family").json(), "amina")

        # Someone moves the task by hand after the agents took their snapshot.
        with db.write() as conn:
            state = db.load_state(conn, "rahman")
            state["assignments"][task_id] = "paid-by-hand-marker"
            db.save_state(conn, "rahman", state)

        outcome = SimpleNamespace(
            final_allocation=Allocation(period="2026-10", assignments={task_id: to}),
            escalations=[],
            settled=True,
        )
        service._apply("rahman", "run-test", snapshot.get("generation"), snapshot, outcome, {task_id})
        assert db.read_state("rahman")["assignments"][task_id] == "paid-by-hand-marker"


def test_instructions_reach_the_agent_and_are_guarded_like_a_reason():
    from shoulder.agents.convener import fairness_brief
    from shoulder.agents.principal import build_principal_agent, critique_allocation
    from shoulder.agents.convener import seed_allocation
    from shoulder.seed.demo_circle import build_circle
    from shoulder.tools.fairness import build_fairness_report

    circle = build_circle()
    farah = next(p for p in circle.principals if p.id == "farah")
    leaky = _critique("accept", "Fine, though I am doing hospice volunteering most evenings.")
    agent = build_principal_agent(
        farah,
        model=leaky,
        instructions="Never mention the hospice volunteering most evenings.",
        recipient="Nasrin",
    )
    assert "Never mention the hospice volunteering most evenings." in agent.system_prompt
    assert "caring for Nasrin" in agent.system_prompt or "care for Nasrin" in agent.system_prompt

    allocation = seed_allocation(circle)
    critique = critique_allocation(
        agent, farah, allocation, {t.id: t for t in circle.tasks},
        fairness_brief(build_fairness_report(circle, allocation)), 1,
    )
    assert "hospice" not in critique.message.lower()
