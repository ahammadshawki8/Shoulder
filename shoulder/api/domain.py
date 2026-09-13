"""What a family can do, as plain functions over its state.

Nothing here touches HTTP or the database, so every rule can be tested directly.
The arithmetic is the real engine in `shoulder.tools.fairness` and
`shoulder.agents.convener`, the same code the negotiation and the evals run.
Nothing in the browser decides who does what; it only renders what this module
settled.

The state document this module works on never holds a private reason. The
engine does not need one: a blocked day is a blocked day whatever the cause.
"""

from __future__ import annotations

import copy
import json
import math
import re
import secrets
import string
from datetime import date, datetime, timezone
from typing import Any

from shoulder.agents.convener import _eligible
from shoulder.config import REMOTE_CAPABLE
from shoulder.models.core import (
    Allocation,
    CareTask,
    Circle,
    Constraint,
    Principal,
    Tier,
)
from shoulder.tools.fairness import (
    build_fairness_report,
    needs_travel,
    personal_disutility,
    task_load,
)
from shoulder.tools.remedies import best_paid_help

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
LONG_DAY = {
    "Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday",
    "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday",
}
TASK_TYPES = {"appointment", "medication", "night", "transport", "admin", "finance", "visit", "household"}
RELATIONS = {"Mum", "Dad", "Nan", "Grandad", "Someone else"}
MAX_AVATAR_CHARS = 1_500_000  # roughly a 1 MB image once base64 encoded

# Codes are read aloud and typed on phones. No 0/o, 1/l/i.
CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


class DomainError(Exception):
    """A request the rules do not allow. The message is shown to the person."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _random(length: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def new_family_code() -> str:
    return _random(6)


def new_member_id(name: str) -> str:
    """Readable prefix, random tail. The tail is what keeps an account private."""
    slug = re.sub(r"[^a-z]", "", name.strip().split()[0].lower())[:12] if name.strip() else ""
    return f"{slug or 'member'}-{_random(8)}"


def today_of(state: dict[str, Any]) -> str:
    """A seeded family keeps its own today, so its month still reads right."""
    return state.get("today") or date.today().isoformat()


# -- validation ---------------------------------------------------------------


def _clean_text(value: Any, field: str, max_len: int, required: bool = False) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise DomainError(f"Please add {field}.")
    if len(text) > max_len:
        raise DomainError(f"{field.capitalize()} is too long (at most {max_len} characters).")
    return text


def _weekdays(values: Any) -> list[str]:
    days = [d for d in (values or []) if d in WEEKDAYS]
    return [d for d in WEEKDAYS if d in days]


def _task_types(values: Any) -> list[str]:
    return sorted({t for t in (values or []) if t in TASK_TYPES})


def _capacity(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise DomainError("Capacity must be a number.")
    return round(max(0.05, min(1.0, number)), 2)


def _distance(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise DomainError("Distance must be a number.")
    return round(max(0.0, min(20000.0, number)), 1)


def _avatar(value: Any) -> str | None:
    if not value:
        return None
    text = str(value)
    if not text.startswith("data:image/"):
        raise DomainError("A photo must be an image.")
    if len(text) > MAX_AVATAR_CHARS:
        raise DomainError("That photo is too large. Please use one under 1 MB.")
    return text


def _date(value: Any) -> str:
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        raise DomainError("Please choose a valid date.")


# -- constructing a family ----------------------------------------------------


def limits_summary(days: list[str], refuses: list[str]) -> str:
    """Written from the limit itself, never from the reason. Safe to share."""
    parts = []
    if days:
        parts.append(f"Cannot do {', '.join(days)}")
    if refuses:
        parts.append(f"does not take {', '.join(refuses)} work")
    return (", ".join(parts) + ".") if parts else "Something they would rather not explain."


def build_member(
    member_id: str,
    profile: dict[str, Any],
    color_index: int,
) -> tuple[dict[str, Any], str]:
    """A member record for the state document, plus any private reason.

    The reason is returned separately and never placed in the record.
    """
    name = _clean_text(profile.get("name"), "your name", 80, required=True)
    days = _weekdays(profile.get("days_off"))
    refuses = _task_types(profile.get("refuses"))
    reason = _clean_text(profile.get("private_reason"), "the private reason", 1000)

    constraints: list[dict[str, Any]] = []
    if days or refuses or reason:
        constraints.append(
            {
                "id": f"{member_id}-limits",
                "summary": limits_summary(days, refuses),
                "tier": "private" if reason else "shareable",
                "hardness": "hard" if (days or refuses) else "soft",
                "blocks_weekdays": days,
                "blocks_task_types": refuses,
                "max_tasks_per_period": None,
                "requires_remote": False,
                "applies_to_remote": True,
            }
        )

    member = {
        "id": member_id,
        "name": name,
        "capacity": _capacity(profile.get("capacity", 0.7)),
        "distance_km": _distance(profile.get("distance_km", 0)),
        "avatar": _avatar(profile.get("avatar")),
        "color_index": color_index,
        "joined_at": now_iso(),
        "aversions": {},
        "constraints": constraints,
    }
    return member, reason


def new_state(recipient: dict[str, Any]) -> dict[str, Any]:
    relation = recipient.get("relation") or "Mum"
    if relation not in RELATIONS:
        relation = "Someone else"
    return {
        "today": None,
        "recipient": {
            "name": _clean_text(recipient.get("name"), "their name", 80, required=True),
            "relation": relation,
            "note": _clean_text(recipient.get("note"), "the note", 200),
            "avatar": _avatar(recipient.get("avatar")),
        },
        "members": [],
        "tasks": [],
        "assignments": {},
        "covered": {},
        "completed": [],
        "task_notes": {},
        "why": {},
        "precedents": [],
        "ledger": [],
        "escalations": [],
        "accepted_spread": None,
        "muted_for": None,
        "pending_changes": [],
    }


def member(state: dict[str, Any], member_id: str) -> dict[str, Any] | None:
    return next((m for m in state["members"] if m["id"] == member_id), None)


def short_name(state: dict[str, Any], member_id: str | None) -> str:
    if member_id == "paid":
        return "Paid help"
    m = member(state, member_id) if member_id else None
    return m["name"].split()[0] if m else "Someone"


# -- the engine, fed from the state document ---------------------------------


def to_care_task(raw: dict[str, Any]) -> CareTask:
    on = date.fromisoformat(raw["on_date"])
    return CareTask(
        id=raw["id"],
        title=raw["title"],
        type=raw["type"],
        on_date=on,
        weekday=WEEKDAYS[on.weekday()],
        duration_min=int(raw["duration_min"]),
        requires_presence=bool(raw.get("requires_presence", True)),
        notes=raw.get("notes") or None,
    )


def to_principal(m: dict[str, Any]) -> Principal:
    return Principal(
        id=m["id"],
        name=m["name"].split()[0],
        capacity=m["capacity"],
        distance_km=m["distance_km"],
        aversions=m.get("aversions") or {},
        constraints=[
            Constraint(
                id=c["id"],
                summary=c.get("summary") or "",
                tier=Tier(c.get("tier", "shareable")),
                hardness=c.get("hardness", "hard"),
                blocks_weekdays=c.get("blocks_weekdays") or [],
                blocks_task_types=c.get("blocks_task_types") or [],
                max_tasks_per_period=c.get("max_tasks_per_period"),
                requires_remote=bool(c.get("requires_remote", False)),
                applies_to_remote=bool(c.get("applies_to_remote", True)),
            )
            for c in m.get("constraints", [])
        ],
    )


def circle_of(state: dict[str, Any], task_ids: set[str] | None = None) -> Circle:
    tasks = [t for t in state["tasks"] if task_ids is None or t["id"] in task_ids]
    return Circle(
        id="live",
        care_recipient=state["recipient"]["name"],
        period="live",
        principals=[to_principal(m) for m in state["members"]],
        tasks=[to_care_task(t) for t in tasks],
    )


def in_play(state: dict[str, Any]) -> dict[str, str]:
    """Assignments the family is carrying: anything paid for is not their load."""
    return {t: p for t, p in state["assignments"].items() if t not in state["covered"]}


def fairness(state: dict[str, Any]):
    uncovered = {t["id"] for t in state["tasks"] if t["id"] not in state["covered"]}
    circle = circle_of(state, uncovered)
    allocation = Allocation(period="live", assignments=in_play(state))
    return circle, allocation, build_fairness_report(circle, allocation)


def unassigned(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Open work nobody can legally take. Finished work is never a question."""
    done = set(state["completed"])
    return [
        t for t in state["tasks"]
        if t["id"] not in state["assignments"]
        and t["id"] not in state["covered"]
        and t["id"] not in done
    ]


def add_ledger(
    state: dict[str, Any],
    summary: str,
    justification: str,
    who: str | None = None,
    kind: str = "took_action",
) -> None:
    state["ledger"].insert(
        0,
        {
            "id": f"led-{secrets.token_hex(6)}",
            "at": now_iso(),
            "summary": summary,
            "justification": justification,
            "who": who,
            "kind": kind,
        },
    )
    del state["ledger"][500:]


def rebalance(state: dict[str, Any], because: str) -> None:
    """Deal the open work out again, the way the opening split is built.

    Finished tasks keep their holder: rewriting who did last week's pharmacy run
    would change the family's history, not its plan.

    The deal starts from what each person already carried on those finished
    tasks. Starting everyone from zero made paying for help look worse: in the
    Rahmans' October it pushed the spread from 23 to 37 percent, because the
    greedy split kept handing open work to whoever had already done the most.
    Same rule and same order as `seed_allocation`, with the load carried in.
    """
    if not state["members"]:
        state["assignments"] = {}
        return
    circle = circle_of(state)
    positions = {p.principal_id: p for p in circle.positions()}
    tasks = {t.id: t for t in circle.tasks}
    done = set(state["completed"])

    load = {pid: 0.0 for pid in positions}
    held = {pid: 0 for pid in positions}
    assignments: dict[str, str] = {}
    for task_id, pid in state["assignments"].items():
        if task_id in done and pid in positions and task_id in tasks and task_id not in state["covered"]:
            assignments[task_id] = pid
            load[pid] += personal_disutility(tasks[task_id], positions[pid])
            held[pid] += 1

    open_tasks = [t for t in tasks.values() if t.id not in done and t.id not in state["covered"]]
    open_tasks.sort(
        key=lambda t: (
            sum(1 for p in positions.values() if _eligible(p, t, held[p.principal_id])),
            -task_load(t, 0.0),
        )
    )
    for task in open_tasks:
        best, best_score = None, None
        for pid, pos in positions.items():
            if not _eligible(pos, task, held[pid]):
                continue
            score = (load[pid] + personal_disutility(task, pos)) / pos.capacity
            if best_score is None or score < best_score:
                best, best_score = pid, score
        if best is not None:
            assignments[task.id] = best
            load[best] += personal_disutility(task, positions[best])
            held[best] += 1

    state["assignments"] = assignments
    add_ledger(
        state,
        "Worked out the split again",
        f"{because}, so every open task was dealt out again inside everyone's limits.",
    )


def _positions(state: dict[str, Any]):
    return [to_principal(m).to_position() for m in state["members"]]


def ineligible_because(position, task: CareTask, held: int) -> str | None:
    """Why this person cannot take this task, in the family's words.

    Returns None exactly when the engine's `_eligible` says yes. The two must
    never disagree, or the app would explain a rule the split does not follow.
    """
    if _eligible(position, task, held):
        return None
    day = LONG_DAY.get(task.weekday, task.weekday)
    if task.weekday in position.unavailable_weekdays:
        return f"{position.name} is not available on {day}"
    if task.weekday in position.unavailable_weekdays_onsite and needs_travel(task):
        return f"{position.name} cannot be there in person on {day}"
    if task.type in position.refused_task_types:
        return f"{position.name} does not take {task.type} work"
    if position.remote_only and task.type not in REMOTE_CAPABLE:
        return f"{position.name} can only take work that needs no travel"
    return f"{position.name} is at their limit of {position.max_tasks_per_period} tasks"


def suggest(state: dict[str, Any], task: CareTask) -> tuple[str | None, list[str]]:
    """The eligible person whose capacity-adjusted load would stay lowest."""
    positions = _positions(state)
    tasks = {t["id"]: t for t in state["tasks"]}
    held = {p.principal_id: 0 for p in positions}
    load = {p.principal_id: 0.0 for p in positions}
    for task_id, who in in_play(state).items():
        pos = next((p for p in positions if p.principal_id == who), None)
        if pos is None or task_id not in tasks:
            continue
        held[who] += 1
        load[who] += personal_disutility(to_care_task(tasks[task_id]), pos)

    best, best_score, blocked = None, None, []
    for pos in positions:
        why = ineligible_because(pos, task, held[pos.principal_id])
        if why:
            blocked.append(why)
            continue
        score = (load[pos.principal_id] + personal_disutility(task, pos)) / pos.capacity
        if best_score is None or score < best_score:
            best, best_score = pos, score
    return (best.principal_id if best else None), blocked


def can_take(state: dict[str, Any], member_id: str, task_raw: dict[str, Any]) -> str | None:
    """Why this person cannot take this task, or None if they can."""
    m = member(state, member_id)
    if m is None:
        return "That person is not in this family."
    position = to_principal(m).to_position()
    held = sum(1 for t, p in in_play(state).items() if p == member_id and t != task_raw["id"])
    return ineligible_because(position, to_care_task(task_raw), held)


# -- decisions ----------------------------------------------------------------


def plan_signature(state: dict[str, Any]) -> str:
    return json.dumps(
        {
            "a": sorted(state["assignments"].items()),
            "c": sorted(state["covered"]),
            "t": [t["id"] for t in state["tasks"]],
        }
    )


def open_escalations(state: dict[str, Any]) -> list[dict[str, Any]]:
    """The questions for the family, if there are any.

    Cards the negotiation wrote are stored, and shown until decided. Otherwise
    the card is derived from how things stand right now, never stored, because a
    stored card goes stale the moment somebody adds a task. What the family
    decided is what silences it.
    """
    stored = [c for c in state["escalations"] if c.get("status", "open") == "open"]
    if stored:
        return stored
    if not state["members"] or not state["tasks"]:
        return []

    circle, allocation, report = fairness(state)
    uncovered = unassigned(state)
    if report.proportional and not uncovered:
        return []
    spread = state.get("accepted_spread")
    if not uncovered and spread is not None and report.max_deviation <= spread + 1e-9:
        return []
    if state.get("muted_for") and state["muted_for"] == plan_signature(state):
        return []
    return [_derived_card(state, circle, allocation, report, uncovered)]


def _derived_card(state, circle, allocation, report, uncovered) -> dict[str, Any]:
    titles = {t["id"]: t["title"] for t in state["tasks"]}
    n = len(uncovered)
    options = [
        {
            "label": "Keep the split as it is",
            "consequence": (
                f"Every stated limit is respected, and {n} task{'s' if n != 1 else ''} "
                "nobody can take stay uncovered."
                if n
                else "Every stated limit is respected and the care is covered, with the load uneven."
            ),
            "effect": {"kind": "accept_split", "task_ids": []},
        }
    ]
    help_ = best_paid_help(circle, allocation, report)
    if help_:
        ids, _after = help_
        named = " and ".join(titles[i] for i in ids if i in titles)
        options.append(
            {
                "label": f"Bring in paid help for {named}",
                "consequence": "Those come off the family's plate, and the rest is dealt out again.",
                "effect": {"kind": "paid_help", "task_ids": list(ids)},
            }
        )
    if n:
        options.append(
            {
                "label": f"Take {'it' if n == 1 else 'them'} off the plan",
                "consequence": f"{', '.join(t['title'] for t in uncovered)} would not happen at all.",
                "effect": {"kind": "remove_tasks", "task_ids": [t["id"] for t in uncovered]},
            }
        )
    options.append(
        {
            "label": "Talk it through together first",
            "consequence": "Nothing changes until you have spoken.",
            "effect": {"kind": "none", "task_ids": []},
        }
    )
    return {
        "id": "live-shortfall" if n else "live-fairness",
        "kind": "capacity_shortfall" if n else "fairness_breach",
        "headline": (
            f"{n} task{'s' if n != 1 else ''} nobody in the family can take."
            if n
            else report.headline()
        ),
        "the_tension": (
            "Everyone's stated limits rule these out. Something has to give, and it is not mine to choose."
            if n
            else "I dealt every task out to whoever had the most room, and this is as even as it goes inside everyone's limits."
        ),
        "what_i_tried": [
            "Dealt every task out to whoever had the most room.",
            "Kept every limit anyone told their own agent.",
        ],
        "what_i_will_not_decide": (
            "Whether to spend money, drop care, or ask somebody to stretch past what "
            "they said they can do. Those are yours."
        ),
        "options": options,
        "status": "open",
        "derived": True,
    }


# -- what the app shows, computed here rather than in the browser --------------


def fairness_view(state: dict[str, Any]) -> dict[str, Any]:
    from shoulder.config import FAIRNESS_TOLERANCE

    _c, _a, report = fairness(state)
    # The engine's headline compares the heaviest and lightest shares, which is
    # never zero. Printed beside "Even, within 15%" it read as the app arguing
    # with itself ("Rian is carrying 21 percent more than Farah. Even."), so a
    # fair split says it is fair.
    carrying = [b for b in report.burdens if b.task_count]
    if not carrying:
        headline = "Nothing to share out yet."
    elif report.proportional:
        headline = "The care is shared fairly."
    else:
        headline = report.headline()
    return {
        "max_deviation": report.max_deviation,
        "spread_pct": round(report.max_deviation * 100),
        "tolerance_pct": round(FAIRNESS_TOLERANCE * 100),
        "proportional": report.proportional,
        "headline": headline,
        "burdens": [b.model_dump() for b in report.burdens],
        "unassigned": [t["id"] for t in unassigned(state)],
        "paid_count": len(state["covered"]),
    }


def option_previews(state: dict[str, Any], card: dict[str, Any]) -> list[dict[str, Any]]:
    """What each option would really do, by making the choice on a copy.

    The preview and the outcome come from the same code path, so the number a
    person sees before choosing is the number they get after.
    """
    previews = []
    for index in range(len(card["options"])):
        trial = copy.deepcopy(state)
        try:
            apply_option(trial, card, index, state["members"][0]["id"] if state["members"] else "")
            after = fairness_view(trial)
        except DomainError:
            after = fairness_view(state)
        previews.append(
            {
                "spread_pct": after["spread_pct"],
                "proportional": after["proportional"],
                "burdens": after["burdens"],
            }
        )
    return previews


def eligible_map(state: dict[str, Any]) -> dict[str, list[str]]:
    """For each open task, who could legally take it right now."""
    out: dict[str, list[str]] = {}
    done = set(state["completed"])
    for task in state["tasks"]:
        if task["id"] in done:
            continue
        out[task["id"]] = [m["id"] for m in state["members"] if can_take(state, m["id"], task) is None]
    return out


def why_for(state: dict[str, Any], task_id: str) -> str:
    saved = state["why"].get(task_id)
    if saved:
        return saved
    if task_id in state["covered"]:
        return "The family decided paid help covers this one."
    holder = state["assignments"].get(task_id)
    task = next((t for t in state["tasks"] if t["id"] == task_id), None)
    if not holder or task is None or member(state, holder) is None:
        return ""
    care = to_care_task(task)
    blocked = []
    for m in state["members"]:
        if m["id"] == holder:
            continue
        reason = ineligible_because(to_principal(m).to_position(), care, 0)
        if reason:
            blocked.append(reason)
    base = f"{short_name(state, holder)} had the most room for this once everyone's limits were respected."
    return f"{base} {'. '.join(blocked)}." if blocked else base


def _day_month() -> str:
    # strftime's %-d is not portable (it fails on Windows), so build it by hand.
    today = date.today()
    return f"{today.day} {today.strftime('%b')}"


def _same_effect(a: dict[str, Any] | None, b: dict[str, Any] | None) -> bool:
    if not a or not b:
        return False
    return a.get("kind") == b.get("kind") and sorted(a.get("task_ids") or []) == sorted(
        b.get("task_ids") or []
    )


def resolve(state: dict[str, Any], card_id: str, option_index: int, decided_by: str) -> dict[str, Any]:
    """Apply what the family chose. The card is rebuilt here, never trusted from the client."""
    card = next((c for c in open_escalations(state) if c["id"] == card_id), None)
    if card is None:
        raise DomainError("This decision has already been made, or the plan has changed since.", 409)
    return apply_option(state, card, option_index, decided_by)


def apply_option(state: dict[str, Any], card: dict[str, Any], option_index: int, decided_by: str) -> dict[str, Any]:
    """Make the choice on a card already known to be open. `resolve` checks that first."""
    card_id = card["id"]
    if not 0 <= option_index < len(card["options"]):
        raise DomainError("That option is not on this card.")
    option = card["options"][option_index]
    effect = option.get("effect") or {"kind": "none", "task_ids": []}
    kind = effect.get("kind", "none")
    who = short_name(state, decided_by)
    known = {t["id"] for t in state["tasks"]}

    if kind == "accept_split":
        _c, _a, report = fairness(state)
        state["accepted_spread"] = math.ceil(report.max_deviation * 100) / 100

    changed_plan = False
    if kind in ("paid_help", "remove_tasks"):
        for task_id in effect.get("task_ids") or []:
            if task_id not in known:
                continue
            state["covered"][task_id] = "Paid help" if kind == "paid_help" else "Taken off the plan"
            state["assignments"].pop(task_id, None)
            changed_plan = True

    if not card.get("derived"):
        for stored in state["escalations"]:
            if stored["id"] == card_id:
                stored["status"] = "resolved"
            elif stored.get("status", "open") == "open" and kind in ("paid_help", "remove_tasks"):
                # One decision answers the same question everywhere it was asked.
                if any(_same_effect(o.get("effect"), effect) for o in stored["options"]):
                    stored["status"] = "resolved"

    if kind != "none":
        state["precedents"].insert(
            0,
            {
                "id": f"prec-{secrets.token_hex(5)}",
                "text": option["label"],
                "provenance": f"{who} decided this on {_day_month()}",
                "decided_by": decided_by,
                "decided_at": now_iso(),
                "active": True,
            },
        )

    add_ledger(state, f"The family chose: {option['label']}", option.get("consequence", ""), decided_by)

    if changed_plan:
        rebalance(state, f"{who} took some tasks off the family's plan")

    if kind == "none":
        # Recorded after any change, so the deferral lasts exactly as long as this plan.
        state["muted_for"] = plan_signature(state)
    return option
