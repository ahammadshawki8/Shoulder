"""What one member of a family is allowed to see.

This is the privacy boundary for the app, in one function. The state document
already holds no reasons, so everything here is additive: the viewer's own
reasons are joined back in from `member_secrets`, and nobody else's ever are.

For everyone else, a constraint keeps only its shape (which days, which kinds of
work) and loses any text a person wrote. A private limit still visibly binds;
what is behind it does not travel.
"""

from __future__ import annotations

import hashlib
from typing import Any

from shoulder.api import domain

# Fields of a constraint that describe its effect. Nothing a person typed.
SHAPE_FIELDS = (
    "id",
    "tier",
    "hardness",
    "blocks_weekdays",
    "blocks_task_types",
    "max_tasks_per_period",
    "requires_remote",
    "applies_to_remote",
)

PALETTE = ["#3B6E94", "#BF5D30", "#1B6B73", "#7C5AA6", "#A6635A", "#41725A"]


def _opaque(member_id: str, constraint_id: str) -> str:
    return "c-" + hashlib.sha256(f"{member_id}:{constraint_id}".encode()).hexdigest()[:12]


def _member_view(m: dict[str, Any], own: bool, secrets: dict[str, dict[str, Any]]) -> dict[str, Any]:
    constraints = []
    for c in m.get("constraints", []):
        shaped = {k: c.get(k) for k in SHAPE_FIELDS}
        if not own:
            # An identifier can carry meaning too. The seeded family names one of
            # Farah's limits `farah-treatment`, which says enough on its own. The
            # API test that sweeps every response caught it; everyone else now
            # gets an id that means nothing.
            shaped["id"] = _opaque(m["id"], c["id"])
        if own:
            shaped["summary"] = c.get("summary", "")
            shaped["reason"] = secrets.get(c["id"], {}).get("reason", "")
        elif c.get("tier", "shareable") == "shareable":
            # A shareable summary is generated from the limit itself.
            shaped["summary"] = c.get("summary", "")
        else:
            shaped["summary"] = domain.limits_summary(
                c.get("blocks_weekdays") or [], c.get("blocks_task_types") or []
            )
        constraints.append(shaped)

    return {
        "id": m["id"],
        "name": m["name"],
        "capacity": m["capacity"],
        "distance_km": m["distance_km"],
        "avatar": m.get("avatar"),
        "color": m.get("color") or PALETTE[m.get("color_index", 0) % len(PALETTE)],
        "aversions": m.get("aversions") or {},
        "joined_at": m.get("joined_at"),
        "constraints": constraints,
        "is_me": own,
    }


def view_for(
    code: str,
    state: dict[str, Any],
    viewer_id: str,
    viewer_secrets: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """The whole family, as `viewer_id` may see it."""
    pending = []
    for change in state.get("pending_changes", []):
        if change.get("status") != "pending":
            continue
        pending.append(
            {
                **change,
                "needs_my_answer": viewer_id in change.get("required", [])
                and viewer_id not in change.get("answers", {}),
            }
        )

    escalations = [
        {**card, "previews": domain.option_previews(state, card)}
        for card in domain.open_escalations(state)
    ]

    return {
        "family_code": code,
        "me": viewer_id,
        "today": domain.today_of(state),
        "recipient": state["recipient"],
        "members": [
            _member_view(m, m["id"] == viewer_id, viewer_secrets)
            for m in state["members"]
        ],
        "tasks": state["tasks"],
        "assignments": state["assignments"],
        "covered": state["covered"],
        "completed": state["completed"],
        "task_notes": state["task_notes"],
        "why": {t["id"]: domain.why_for(state, t["id"]) for t in state["tasks"]},
        "eligible": domain.eligible_map(state),
        "fairness": domain.fairness_view(state),
        "precedents": state["precedents"],
        "ledger": state["ledger"],
        "escalations": escalations,
        "pending_changes": pending,
    }
