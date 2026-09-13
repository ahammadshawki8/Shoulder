"""The Rahmans, loaded from `fixtures/` as an ordinary family.

There is no demo mode anywhere in the app. This is just a family that already
exists when the server starts: code `rahman`, members `amina`, `rian` and
`farah`, a month of real negotiation output, and the two decisions it could not
make on its own.

It is re-seeded on every start. Everyone who logs in as Farah shares one family,
so without this one visitor deciding both cards would leave every later visitor
an empty inbox.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from shoulder.api import domain
from shoulder.api.db import Database

CODE = "rahman"
TODAY = "2026-10-14"
FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"

DISPLAY = {
    "amina": {"name": "Amina Rahman", "avatar": "/assets/amina_portrait.jpg", "color": "#3B6E94"},
    "rian": {"name": "Rian Rahman", "avatar": "/assets/rian_portrait.jpg", "color": "#BF5D30"},
    "farah": {"name": "Farah Rahman", "avatar": "/assets/farah_portrait.jpg", "color": "#1B6B73"},
}


def _load(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def build() -> tuple[dict[str, Any], dict[str, list[tuple[str, str, list[str]]]]]:
    """The state document, and each member's secrets kept apart from it."""
    circle = _load("circle.json")
    outcome = _load("outcome.json")
    cards = _load("escalations.json")
    ledger = _load("ledger.json")

    state = domain.new_state(
        {"name": "Nasrin Rahman", "relation": "Mum", "note": "Reduced mobility and diabetes"}
    )
    state["today"] = TODAY
    state["recipient"]["avatar"] = "/assets/nasrin_mum.jpg"

    secrets: dict[str, list[tuple[str, str, list[str]]]] = {}
    for index, p in enumerate(circle["principals"]):
        display = DISPLAY.get(p["id"], {"name": p["name"], "avatar": None, "color": None})
        constraints = []
        for c in p["constraints"]:
            if c.get("reason") or c.get("sensitive_terms"):
                secrets.setdefault(p["id"], []).append(
                    (c["id"], c.get("reason") or "", c.get("sensitive_terms") or [])
                )
            constraints.append(
                {k: v for k, v in c.items() if k not in ("reason", "sensitive_terms")}
            )
        state["members"].append(
            {
                "id": p["id"],
                "name": display["name"],
                "capacity": p["capacity"],
                "distance_km": p["distance_km"],
                "avatar": display["avatar"],
                "color": display["color"],
                "color_index": index,
                "joined_at": "2026-09-01T09:00:00+00:00",
                "aversions": p.get("aversions") or {},
                "constraints": constraints,
            }
        )

    state["tasks"] = [
        {
            "id": t["id"],
            "title": t["title"],
            "type": t["type"],
            "on_date": t["on_date"],
            "duration_min": t["duration_min"],
            "requires_presence": t.get("requires_presence", True),
            "time": None,
            "notes": t.get("notes") or "",
            "is_custom": False,
            "created_by": None,
        }
        for t in circle["tasks"]
    ]
    state["assignments"] = dict(outcome["final_allocation"]["assignments"])
    state["covered"] = dict(outcome.get("covered") or {})
    state["completed"] = [t["id"] for t in state["tasks"] if t["on_date"] < TODAY]
    state["escalations"] = [{**card, "status": "open"} for card in cards]
    state["ledger"] = [
        {
            "id": e["id"],
            "at": e["at"],
            "summary": e["summary"],
            "justification": e.get("justification") or "",
            "who": (e.get("actor") or "").replace("agent:", "") or None,
            "kind": e.get("kind") or "took_action",
        }
        for e in reversed(ledger)
        if e.get("scope", "family") == "family"
    ]
    return state, secrets


def reseed(db: Database) -> None:
    """Replace the Rahmans with a fresh copy, in one transaction."""
    state, secrets = build()
    with db.write() as conn:
        db.delete_family(conn, CODE)
        db.insert_family(conn, CODE, state)
        for m in state["members"]:
            db.insert_member(conn, CODE, m["id"])
        for member_id, rows in secrets.items():
            for constraint_id, reason, terms in rows:
                db.put_secret(conn, CODE, member_id, constraint_id, reason, terms)

        # The live catch from the privacy hook, for the person it protected.
        demo = _load("privacy_demo.json")
        if demo.get("blocked") and domain.member(state, demo.get("principal_id", "")):
            at = next((e["at"] for e in demo.get("family_ledger", [])), "2026-09-12T00:00:00+00:00")
            db.put_catch(
                conn,
                CODE,
                demo["principal_id"],
                "live-catch",
                at,
                {
                    "asked": (demo.get("attempt") or "").split("\n\n")[1:2][0]
                    if "\n\n" in (demo.get("attempt") or "")
                    else demo.get("attempt") or "",
                    "draft": demo.get("draft_message") or "",
                    "sent": demo.get("sent_message") or "",
                    "matched": demo.get("matched") or [],
                    "live": demo.get("mode") == "live",
                },
            )
