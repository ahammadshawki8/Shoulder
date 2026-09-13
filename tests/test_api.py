"""The family app over HTTP: sign-up, login, privacy, and every change.

The privacy tests are the ones that matter most. They log in as each person and
check every response the app can produce, not just the family view, for anyone
else's private reason or sensitive words. A leak in any one route is a leak.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from shoulder.api.app import COOKIE, create_app


WEEKDAYS_ALL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _client(tmp_path) -> TestClient:
    app = create_app(db_path=str(tmp_path / "test.db"), reseed_demo=True)
    return TestClient(app)


@pytest.fixture
def client(tmp_path):
    with _client(tmp_path) as c:
        yield c


def _profile(name="Sam Lee", **extra):
    return {"name": name, "capacity": 0.7, "distance_km": 10, "days_off": [], "refuses": [], **extra}


def _create(client, recipient="Mary Lee", me=None):
    r = client.post("/api/families", json={"recipient": {"name": recipient, "relation": "Mum"}, "me": me or _profile()})
    assert r.status_code == 201, r.text
    return r.json()


def _secret_texts(client, family_code):
    return client.app.state.db.all_secret_texts(family_code)


# -- creating and joining ------------------------------------------------------


def test_create_family_generates_both_codes_and_logs_in(client):
    body = _create(client)
    assert len(body["family_code"]) == 6
    assert body["member_id"].startswith("sam-") and len(body["member_id"]) == len("sam-") + 8
    assert COOKIE in client.cookies
    view = client.get("/api/family").json()
    assert view["recipient"]["name"] == "Mary Lee"
    assert [m["name"] for m in view["members"]] == ["Sam Lee"]


def test_session_cookie_is_httponly(client):
    r = client.post("/api/families", json={"recipient": {"name": "Mary"}, "me": _profile()})
    header = r.headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=lax" in header


def test_codes_are_not_chosen_by_the_client(client):
    r = client.post(
        "/api/families",
        json={"recipient": {"name": "Mary"}, "me": {**_profile(), "id": "i-picked-this"}},
    )
    assert r.json()["member_id"] != "i-picked-this"


def test_family_lookup_before_joining(client):
    code = _create(client)["family_code"]
    client.cookies.clear()
    assert client.get(f"/api/families/{code}").json()["recipient_name"] == "Mary Lee"
    assert client.get("/api/families/nope99").status_code == 404


def test_new_member_joins_with_only_the_family_code(client):
    code = _create(client)["family_code"]
    client.cookies.clear()
    r = client.post(f"/api/families/{code}/members", json=_profile("Alex Lee"))
    assert r.status_code == 201
    joined = r.json()
    assert joined["family_code"] == code and joined["member_id"].startswith("alex-")
    view = client.get("/api/family").json()
    assert view["me"] == joined["member_id"]
    assert sorted(m["name"] for m in view["members"]) == ["Alex Lee", "Sam Lee"]


def test_existing_member_logs_back_in_with_both_codes(client):
    body = _create(client)
    client.delete("/api/session")
    assert client.get("/api/family").status_code == 401
    r = client.post("/api/session", json={"family_code": body["family_code"], "member_id": body["member_id"]})
    assert r.status_code == 200
    assert client.get("/api/family").json()["me"] == body["member_id"]


def test_login_is_case_and_space_tolerant(client):
    body = _create(client)
    client.delete("/api/session")
    r = client.post(
        "/api/session",
        json={"family_code": f" {body['family_code'].upper()} ", "member_id": body["member_id"].upper()},
    )
    assert r.status_code == 200


def test_wrong_codes_give_one_message_for_both_halves(client):
    body = _create(client)
    client.delete("/api/session")
    wrong_member = client.post("/api/session", json={"family_code": body["family_code"], "member_id": "sam-wrongwro"})
    wrong_family = client.post("/api/session", json={"family_code": "zzzzzz", "member_id": body["member_id"]})
    assert wrong_member.status_code == wrong_family.status_code == 401
    assert wrong_member.json() == wrong_family.json()


def test_login_is_rate_limited(client):
    for _ in range(20):
        client.post("/api/session", json={"family_code": "rahman", "member_id": "nobody"})
    r = client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    assert r.status_code == 429


def test_logout_ends_the_session_on_the_server(client):
    _create(client)
    token = client.cookies.get(COOKIE)
    client.delete("/api/session")
    client.cookies.set(COOKIE, token)
    assert client.get("/api/family").status_code == 401


def test_session_tokens_are_stored_hashed(client):
    _create(client)
    token = client.cookies.get(COOKIE)
    with client.app.state.db.connect() as conn:
        stored = [r[0] for r in conn.execute("SELECT token_hash FROM sessions")]
    assert token not in stored and len(stored[0]) == 64


# -- the seeded family ---------------------------------------------------------


def test_rahmans_log_in_as_farah(client):
    r = client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    assert r.status_code == 200
    view = client.get("/api/family").json()
    assert view["today"] == "2026-10-14"
    assert {m["id"] for m in view["members"]} == {"amina", "rian", "farah"}
    assert len(view["tasks"]) == 26 and len(view["escalations"]) == 2


def test_rahman_activity_keeps_rounds_and_verdicts_but_no_rationale(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "amina"})
    ledger = client.get("/api/family").json()["ledger"]
    answers = [e for e in ledger if e["kind"] == "asked_for_view"]
    assert answers and all(e["round"] and e["details"]["verdict"] for e in answers)
    assert all(set(e["details"]) <= {"verdict", "max_deviation", "proportional", "moves", "tool"} for e in ledger)


def test_rahmans_are_reseeded_on_start(tmp_path):
    path = str(tmp_path / "persist.db")
    with TestClient(create_app(db_path=path)) as c:
        c.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
        card = c.get("/api/family").json()["escalations"][0]
        c.post(f"/api/escalations/{card['id']}/resolve", json={"option_index": 0})
        assert c.get("/api/family").json()["escalations"] == []
    with TestClient(create_app(db_path=path)) as c:
        c.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
        assert len(c.get("/api/family").json()["escalations"]) == 2


# -- privacy -------------------------------------------------------------------


def _every_response(client) -> list[str]:
    """Every body this member can make the server send, as text."""
    view = client.get("/api/family").json()
    bodies = [str(view)]
    task = view["tasks"][-1]
    me = view["me"]
    other = next((m["id"] for m in view["members"] if m["id"] != me), me)
    mine = next(m for m in view["members"] if m["id"] == me)
    own_days = sorted({d for c in mine["constraints"] for d in c["blocks_weekdays"]})
    own_types = sorted({t for c in mine["constraints"] for t in c["blocks_task_types"]})
    for method, path, body in [
        ("patch", "/api/me", {"name": view["members"][0]["name"]}),
        ("put", "/api/me/limits", {"days_off": [*own_days, "Sun"], "refuses": own_types}),
        ("put", "/api/me/limits", {"days_off": own_days, "refuses": own_types}),
        ("put", "/api/me/agent", {"instructions": "Be brief."}),
        ("put", f"/api/tasks/{task['id']}/note", {"text": "Brought her the paper."}),
        ("post", f"/api/tasks/{task['id']}/complete", {"note": ""}),
        ("post", f"/api/tasks/{task['id']}/complete", {"note": ""}),
        ("post", "/api/tasks", {"title": "Chemist run", "type": "medication", "on_date": view["today"], "duration_min": 30}),
        ("post", "/api/recipient/changes", {"name": view["recipient"]["name"], "relation": "Mum", "note": "Doing well"}),
        ("post", f"/api/tasks/{task['id']}/assign", {"to": other}),
    ]:
        bodies.append(getattr(client, method)(path, json=body).text)
    return bodies


@pytest.mark.parametrize("viewer", ["amina", "rian", "farah"])
def test_no_response_ever_carries_someone_elses_reason(client, viewer):
    secrets = _secret_texts(client, "rahman")
    assert secrets["farah"], "the seed must hold Farah's private reasons"
    for owner, text in client.app.state.db.all_instructions("rahman").items():
        secrets.setdefault(owner, []).append(text)
    client.post("/api/session", json={"family_code": "rahman", "member_id": viewer})
    for body in _every_response(client):
        lowered = body.lower()
        for owner, texts in secrets.items():
            if owner == viewer:
                continue
            for text in texts:
                assert text.lower() not in lowered, f"{viewer} received {owner}'s private text: {text!r}"


def test_privacy_catch_goes_only_to_the_person_it_protected(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    catches = client.get("/api/me/privacy").json()["catches"]
    assert catches and catches[0]["matched"] and catches[0]["live"]
    for other in ("amina", "rian"):
        client.post("/api/session", json={"family_code": "rahman", "member_id": other})
        assert client.get("/api/me/privacy").json()["catches"] == []


def test_a_member_sees_their_own_reason(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    farah = next(m for m in client.get("/api/family").json()["members"] if m["is_me"])
    assert any("Chemotherapy" in c.get("reason", "") for c in farah["constraints"])


def test_a_private_limit_still_binds_for_everyone_else(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "amina"})
    farah = next(m for m in client.get("/api/family").json()["members"] if m["id"] == "farah")
    days = {d for c in farah["constraints"] for d in c["blocks_weekdays"]}
    assert {"Fri", "Sat"} <= days
    assert all("reason" not in c for c in farah["constraints"])


def test_a_reason_given_at_sign_up_is_private_from_the_start(client):
    code = _create(client, me=_profile("Sam", days_off=["Mon"], private_reason="Dialysis on Mondays"))["family_code"]
    client.cookies.clear()
    client.post(f"/api/families/{code}/members", json=_profile("Alex"))
    body = client.get("/api/family").text
    assert "Dialysis" not in body
    assert "Mon" in body


def test_the_family_document_itself_holds_no_reason(client):
    _create(client, me=_profile("Sam", private_reason="Dialysis on Mondays"))
    with client.app.state.db.connect() as conn:
        for (state,) in conn.execute("SELECT state FROM families"):
            assert "Dialysis" not in state and "Chemotherapy" not in state


def test_editing_a_reason_stays_private(client):
    code = _create(client, me=_profile("Sam", days_off=["Tue"]))["family_code"]
    mine = client.get("/api/family").json()["members"][0]["constraints"][0]["id"]
    client.put(f"/api/me/reasons/{mine}", json={"reason": "Night shifts at the hospice"})
    client.cookies.clear()
    client.post(f"/api/families/{code}/members", json=_profile("Alex"))
    assert "hospice" not in client.get("/api/family").text


def test_a_member_sees_their_own_agent_brief_with_their_reason(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    agent = client.get("/api/family").json()["my_agent"]
    assert "never apologise" in agent["instructions"]
    assert "Chemotherapy" in agent["brief"] and "never apologise" in agent["brief"]
    assert "Nasrin" in agent["brief"]


def test_agent_instructions_are_saved_and_kept_from_the_family(client):
    code = _create(client)["family_code"]
    view = client.put("/api/me/agent", json={"instructions": "Say no to anything after 9pm."}).json()
    assert view["my_agent"]["instructions"] == "Say no to anything after 9pm."
    assert "after 9pm" in view["my_agent"]["brief"]
    client.cookies.clear()
    client.post(f"/api/families/{code}/members", json=_profile("Alex"))
    assert "after 9pm" not in client.get("/api/family").text
    too_long = client.put("/api/me/agent", json={"instructions": "x" * 2001})
    assert too_long.status_code == 400


# -- changing your limits ------------------------------------------------------


def _mine(view):
    return next(m for m in view["members"] if m["is_me"])


def test_every_limit_set_at_sign_up_can_be_changed(client):
    _create(client, me=_profile("Sam", days_off=["Mon", "Tue"], refuses=["night"]))
    view = client.put("/api/me/limits", json={"days_off": ["Tue", "Sun"], "refuses": ["transport"]}).json()
    constraints = _mine(view)["constraints"]
    assert sorted({d for c in constraints for d in c["blocks_weekdays"]}) == ["Sun", "Tue"]
    assert {t for c in constraints for t in c["blocks_task_types"]} == {"transport"}
    assert "Sunday" in constraints[0]["summary"] and "driving" in constraints[0]["summary"]


def test_clearing_every_limit_removes_it_and_its_reason(client):
    _create(client, me=_profile("Sam", days_off=["Mon"], private_reason="Dialysis on Mondays"))
    view = client.put("/api/me/limits", json={"days_off": [], "refuses": []}).json()
    assert _mine(view)["constraints"] == []
    assert not any(_secret_texts(client, view["family_code"]).values())


def test_trimming_a_private_limit_keeps_it_private(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    view = client.put("/api/me/limits", json={"days_off": ["Sat"], "refuses": ["night"]}).json()
    treatment = next(c for c in _mine(view)["constraints"] if c["id"] == "farah-treatment")
    assert treatment["blocks_weekdays"] == ["Sat"] and treatment["tier"] == "private"
    assert "Chemotherapy" in treatment["reason"]
    client.post("/api/session", json={"family_code": "rahman", "member_id": "amina"})
    assert "Chemotherapy" not in client.get("/api/family").text


def test_changing_limits_deals_the_work_out_again(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "amina"})
    before = client.get("/api/family").json()
    view = client.put("/api/me/limits", json={"days_off": WEEKDAYS_ALL, "refuses": []}).json()
    open_amina = [
        t for t, who in view["assignments"].items()
        if who == "amina" and t not in view["completed"]
    ]
    assert open_amina == []
    assert view["ledger"][0]["summary"] != before["ledger"][0]["summary"]


def test_recipient_photo_can_be_removed(client):
    _create(client)
    client.post("/api/recipient/changes", json={"name": "Mary Lee", "avatar": "data:image/png;base64,AAAA"})
    assert client.get("/api/family").json()["recipient"]["avatar"]
    client.post("/api/recipient/changes", json={"name": "Mary Lee", "clear_avatar": True})
    assert client.get("/api/family").json()["recipient"]["avatar"] is None


# -- tasks and decisions -------------------------------------------------------


def test_adding_a_task_assigns_someone_who_can_take_it(client):
    _create(client, me=_profile("Sam", days_off=["Wed"]))
    view = client.post(
        "/api/tasks",
        json={"title": "GP visit", "type": "appointment", "on_date": "2026-09-16", "duration_min": 60},
    ).json()
    task = next(t for t in view["tasks"] if t["title"] == "GP visit")
    assert task["id"] not in view["assignments"]
    assert "not available on Wednesday" in view["why"][task["id"]]


def test_reassigning_to_someone_whose_limit_forbids_it_is_refused(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "amina"})
    friday = next(t for t in client.get("/api/family").json()["tasks"] if t["title"].startswith("Pharmacy"))
    r = client.post(f"/api/tasks/{friday['id']}/assign", json={"to": "farah"})
    assert r.status_code == 400
    assert "Friday" in r.json()["detail"] and "Chemotherapy" not in r.text


def test_resolving_paid_help_answers_both_cards_and_settles(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    card = client.get("/api/family").json()["escalations"][0]
    view = client.post(f"/api/escalations/{card['id']}/resolve", json={"option_index": 0}).json()
    assert view["escalations"] == []
    assert set(view["covered"]) == {"T13", "T22"}
    assert view["precedents"][0]["provenance"].startswith("Farah decided this on")


def test_a_decision_cannot_be_made_twice(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    card = client.get("/api/family").json()["escalations"][0]
    client.post(f"/api/escalations/{card['id']}/resolve", json={"option_index": 1})
    again = client.post(f"/api/escalations/{card['id']}/resolve", json={"option_index": 1})
    assert again.status_code == 409


def test_resolve_rejects_an_option_not_on_the_card(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    card = client.get("/api/family").json()["escalations"][0]
    assert client.post(f"/api/escalations/{card['id']}/resolve", json={"option_index": 9}).status_code == 400


def test_completing_a_task_toggles_and_keeps_a_note(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    task = client.get("/api/family").json()["tasks"][-1]
    view = client.post(f"/api/tasks/{task['id']}/complete", json={"note": "She was cheerful"}).json()
    assert task["id"] in view["completed"] and view["task_notes"][task["id"]]["text"] == "She was cheerful"
    view = client.post(f"/api/tasks/{task['id']}/complete", json={"note": ""}).json()
    assert task["id"] not in view["completed"]


def test_recipient_change_needs_everyone_to_agree(client):
    client.post("/api/session", json={"family_code": "rahman", "member_id": "farah"})
    view = client.post("/api/recipient/changes", json={"name": "Nasrin R.", "relation": "Mum"}).json()
    change = view["pending_changes"][0]
    assert view["recipient"]["name"] == "Nasrin Rahman" and not change["needs_my_answer"]

    for member_id in ("amina", "rian"):
        client.post("/api/session", json={"family_code": "rahman", "member_id": member_id})
        mine = client.get("/api/family").json()["pending_changes"][0]
        assert mine["needs_my_answer"]
        view = client.post(f"/api/recipient/changes/{change['id']}/answer", json={"approve": True}).json()
    assert view["recipient"]["name"] == "Nasrin R." and view["pending_changes"] == []


def test_sole_member_changes_recipient_immediately(client):
    _create(client)
    view = client.post("/api/recipient/changes", json={"name": "Mary L.", "relation": "Mum"}).json()
    assert view["recipient"]["name"] == "Mary L." and view["pending_changes"] == []


def test_leaving_removes_you_and_redeals_your_work(client):
    sam = _create(client)
    code = sam["family_code"]
    for day in ("2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"):
        client.post("/api/tasks", json={"title": f"Visit {day}", "type": "visit", "on_date": day, "duration_min": 60})
    client.cookies.clear()
    alex = client.post(f"/api/families/{code}/members", json=_profile("Alex")).json()
    held = [t for t, who in client.get("/api/family").json()["assignments"].items() if who == alex["member_id"]]
    assert held, "joining should deal Alex some of the open work"

    client.delete("/api/me")
    assert client.get("/api/family").status_code == 401
    assert client.post("/api/session", json={"family_code": code, "member_id": alex["member_id"]}).status_code == 401

    client.post("/api/session", json={"family_code": code, "member_id": sam["member_id"]})
    view = client.get("/api/family").json()
    assert [m["id"] for m in view["members"]] == [sam["member_id"]]
    assert all(view["assignments"].get(t) == sam["member_id"] for t in held)


def test_last_member_leaving_deletes_the_family(client):
    code = _create(client)["family_code"]
    client.delete("/api/me")
    assert client.get(f"/api/families/{code}").status_code == 404


def test_every_change_needs_a_session(client):
    for method, path, body in [
        ("post", "/api/tasks", {"title": "x", "on_date": "2026-09-20"}),
        ("patch", "/api/me", {"name": "x"}),
        ("post", "/api/escalations/x/resolve", {"option_index": 0}),
        ("delete", "/api/tasks/T01", None),
    ]:
        r = getattr(client, method)(path, json=body) if body is not None else getattr(client, method)(path)
        assert r.status_code == 401, path
