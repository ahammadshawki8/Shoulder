"""Precedents: how a decision the family made once is applied without asking again.

The product promise is that it interrupts often in week one and rarely by week
four. That only works if a human decision is remembered as something the agent
can apply, not as a line of prose. So a precedent is built by code from the
typed effect of the option a human chose (`OptionEffect`), never by a model, and
it is applied by code:

  paid_help       those recurring tasks are covered by paid help next time,
                  and booking it is inside the authority envelope
  remove_tasks    those recurring tasks come off the plan next time
  accept_split    when the rounds run out, a split no less even than the one the
                  family accepted is published instead of escalated
  decline_action  the agent does not take, or raise, that action again

Every application is written to the ledger with its provenance ("the family
decided this on 11 Sep"), so nothing is applied silently.
"""

from __future__ import annotations

import math
import uuid

from shoulder.models.core import (
    CareTask,
    Circle,
    EscalationCard,
    Precedent,
    Resolution,
)
from shoulder.tools.remedies import valid_task_ids

_DECLINED_TEXT = {
    "arrange_paid_help": "Keep care within the family. Do not suggest paid help again.",
    "drop_task": "Keep every task in the plan. Do not suggest dropping one again.",
}


def _titles(circle: Circle, task_ids: list[str]) -> list[str]:
    tasks = (circle.task(t) for t in valid_task_ids(circle, task_ids))
    return list(dict.fromkeys(t.title for t in tasks if t is not None))


_DAY_NAMES = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}


def _in_sentence(title: str) -> str:
    """"Follow-up nephrology appointment" reads as "the follow-up nephrology
    appointment" mid-sentence; "Wednesday overnight stay" keeps its capital."""
    first = title.split(" ", 1)[0]
    body = title if first in _DAY_NAMES else title[:1].lower() + title[1:]
    return f"the {body}"


def _join(titles: list[str]) -> str:
    parts = [_in_sentence(t) for t in titles]
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def extract(
    card: EscalationCard,
    resolution: Resolution,
    circle: Circle,
    deviation_at_decision: float | None = None,
) -> Precedent | None:
    """Turn a resolved card into a rule, or None if the choice is not one.

    `circle` is the circle of the period the card was raised in, so task ids can
    be turned into the titles that recur. `deviation_at_decision` is the worst
    deviation of the rota the family was looking at, needed for accept_split.
    """
    option = card.options[resolution.option_index]
    effect = option.effect
    if effect is None or effect.kind == "none":
        return None

    base = dict(
        id=f"P-{uuid.uuid4().hex[:8]}",
        source_escalation_id=card.id,
        period_decided=card.period,
        decided_by=resolution.decided_by,
        decided_at=resolution.decided_at,
    )

    if effect.kind in ("paid_help", "remove_tasks"):
        titles = _titles(circle, effect.task_ids)
        if not titles:
            return None
        joined = _join(titles)
        text = (
            f"Paid help covers {joined} each month."
            if effect.kind == "paid_help"
            else f"{joined[:1].upper()}{joined[1:]} come off the plan each month."
        )
        return Precedent(**base, kind=effect.kind, text=text, task_titles=titles)

    if effect.kind == "accept_split":
        if deviation_at_decision is None:
            return None
        # Round up to the whole percent the family was shown, so a split that
        # reads the same to them is treated the same.
        ceiling = math.ceil(deviation_at_decision * 100 - 1e-9) / 100
        return Precedent(
            **base,
            kind="accept_split",
            max_deviation=ceiling,
            text=(
                f"The split can stand with a spread of up to {round(ceiling * 100)} "
                f"percent, as long as every stated limit holds and nobody objects."
            ),
        )

    if effect.kind == "decline_action" and effect.action:
        if effect.action == "change_capacity":
            person = circle.principal(effect.principal_id)
            name = person.name if person else "their"
            text = f"Leave {name}'s capacity as they set it. Do not raise it again."
        else:
            text = _DECLINED_TEXT.get(
                effect.action, f"Do not {effect.action.replace('_', ' ')}."
            )
        return Precedent(
            **base,
            kind="decline_action",
            action=effect.action,
            principal_id=effect.principal_id,
            text=text,
        )
    return None


def same_rule(a: Precedent, b: Precedent) -> bool:
    """Two precedents that say the same thing. The newer one replaces the older."""
    return (
        a.kind == b.kind
        and sorted(a.task_titles) == sorted(b.task_titles)
        and a.action == b.action
        and a.principal_id == b.principal_id
    )


def covering(precedents: list[Precedent], kind: str, task: CareTask) -> Precedent | None:
    """The active precedent of this kind that covers a recurring task, if any."""
    for p in precedents:
        if p.active and p.kind == kind and task.title in p.task_titles:
            return p
    return None


def declining(
    precedents: list[Precedent], action: str, principal_id: str = ""
) -> Precedent | None:
    for p in precedents:
        if p.active and p.kind == "decline_action" and p.action == action:
            if not p.principal_id or p.principal_id == principal_id:
                return p
    return None


def accepting(precedents: list[Precedent], deviation: float) -> Precedent | None:
    for p in precedents:
        if (
            p.active
            and p.kind == "accept_split"
            and p.max_deviation is not None
            and deviation <= p.max_deviation + 1e-9
        ):
            return p
    return None


def recall(
    circle: Circle, precedents: list[Precedent]
) -> tuple[Circle, dict[str, Precedent]]:
    """Apply the task-shaping precedents before anyone negotiates.

    Returns the circle the family actually has to split between them, and the
    tasks taken out of it with the precedent that took each one.
    """
    covered: dict[str, Precedent] = {}
    for task in circle.tasks:
        p = covering(precedents, "paid_help", task) or covering(
            precedents, "remove_tasks", task
        )
        if p is not None:
            covered[task.id] = p
    reduced = circle.model_copy(
        update={"tasks": [t for t in circle.tasks if t.id not in covered]}
    )
    return reduced, covered
