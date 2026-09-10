"""The authority envelope: what the agent may do alone, enforced in code.

The product's first invariant is that the agent never makes the human decision.
It proposes, it does the safe work, and it escalates. This hook is where "the
safe work" is defined. Every tool call the Convener makes passes through it:

  measuring       always allowed, not recorded (it changes nothing)
  inside          runs unattended and is written to the ledger with the reason
                  it was allowed
  outside         does not run. The attempt becomes an EscalationCard with the
                  options and their fairness consequences, computed by the
                  deterministic engine, and goes to the family

Anything the policy does not name is outside. The envelope fails closed: a new
tool gets no authority until someone decides it should have some.

An out-of-envelope action is never an error. From the model's side the tool
returns "not done, raised with the family", and the negotiation carries on.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable

from strands.hooks import BeforeToolCallEvent, HookProvider, HookRegistry
from strands.tools.structured_output.structured_output_tool import StructuredOutputTool

from shoulder.config import FAIRNESS_TOLERANCE
from shoulder.models.core import (
    Allocation,
    CareTask,
    Circle,
    EscalationCard,
    EscalationOption,
    FairnessReport,
)
from shoulder.tools.fairness import FAIRNESS_TOOLS, build_fairness_report

READ_ONLY_TOOLS = {t.tool_name for t in FAIRNESS_TOOLS}

# Actions that are never the agent's to take, and why, in the words the family
# will read. Adding a tool here is a product decision, not an engineering one.
OUTSIDE: dict[str, str] = {
    "arrange_paid_help": (
        "Spending the family's money, and bringing someone new into her home, "
        "is a decision for the family and for her."
    ),
    "drop_task": (
        "Deciding that she needs less care is a judgement about her, not about "
        "the rota."
    ),
    "change_capacity": (
        "Only a person can change what they said they can carry. I work from "
        "what they told me."
    ),
}

UNKNOWN = "I have not been given authority for this, so it goes to the family."


@dataclass(frozen=True)
class EnvelopeContext:
    """What the envelope needs to judge an action and price its consequences."""

    circle: Circle
    allocation: Allocation
    report: FairnessReport
    round_number: int | None = None


@dataclass(frozen=True)
class Decision:
    allowed: bool
    why: str


def decide(tool_name: str, args: dict[str, Any], ctx: EnvelopeContext | None) -> Decision:
    """The envelope as a pure function. Same call, same answer, every time."""
    if tool_name in READ_ONLY_TOOLS:
        return Decision(True, "Measuring changes nothing.")

    if tool_name == "send_reminder":
        if ctx is None:
            return Decision(False, "There is no rota yet to remind anyone about.")
        pid = args.get("principal_id")
        task_ids = list(args.get("task_ids") or [])
        if ctx.circle.principal(str(pid)) is None:
            return Decision(False, "That person is not in this care circle.")
        not_held = [t for t in task_ids if ctx.allocation.assignments.get(t) != pid]
        if not task_ids or not_held:
            return Decision(
                False,
                "A reminder can only be about work someone already holds. Handing "
                "someone new work by message is not mine to do.",
            )
        return Decision(True, "Reminding someone about work they already hold is routine.")

    if tool_name in OUTSIDE:
        return Decision(False, OUTSIDE[tool_name])
    return Decision(False, UNKNOWN)


# ---------------------------------------------------------------------------
# Plain-language descriptions and escalation cards
# ---------------------------------------------------------------------------


def _recipient(circle: Circle) -> str:
    return circle.care_recipient.split(",")[0].strip() or "your parent"


def _when(task: CareTask) -> str:
    return f"{task.weekday} {task.on_date.day} {task.on_date.strftime('%b')}"


def _titles(tasks: list[CareTask]) -> str:
    return "; ".join(f"{t.title} ({_when(t)})" for t in tasks)


def _tasks(ctx: EnvelopeContext | None, ids: Any) -> list[CareTask]:
    if ctx is None:
        return []
    if isinstance(ids, str):
        ids = [ids]
    found = (ctx.circle.task(str(t)) for t in (ids or []))
    return [t for t in found if t is not None]


def _pct(value: float) -> str:
    return f"{round(value * 100)} percent"


def _without(ctx: EnvelopeContext, task_ids: set[str]) -> FairnessReport:
    """The fairness report if these tasks left the family's plan entirely."""
    circle = ctx.circle.model_copy(
        update={"tasks": [t for t in ctx.circle.tasks if t.id not in task_ids]}
    )
    allocation = Allocation(
        period=ctx.allocation.period,
        round_number=ctx.allocation.round_number,
        assignments={
            t: p for t, p in ctx.allocation.assignments.items() if t not in task_ids
        },
    )
    return build_fairness_report(circle, allocation)


def describe(tool_name: str, args: dict[str, Any], ctx: EnvelopeContext | None) -> str:
    """What the action would do, as a phrase: "booking paid help for ..."."""
    tasks = _tasks(ctx, args.get("task_ids") or args.get("task_id"))
    person = ctx.circle.principal(str(args.get("principal_id"))) if ctx else None
    who = person.name if person else str(args.get("principal_id", "someone"))
    if tool_name == "send_reminder":
        return f"reminding {who} about {_titles(tasks) or 'their tasks'}"
    if tool_name == "arrange_paid_help":
        return f"booking paid help for {_titles(tasks) or 'some of the care'}"
    if tool_name == "drop_task":
        return f"taking {_titles(tasks) or 'a task'} off the plan"
    if tool_name == "change_capacity":
        old = f" from {person.capacity}" if person else ""
        return f"changing {who}'s capacity{old} to {args.get('new_capacity')}"
    return f"running {tool_name}"


def describe_done(tool_name: str, args: dict[str, Any], ctx: EnvelopeContext | None) -> str:
    """The ledger line for an action that ran: "Sent Amina a reminder about ..."."""
    if tool_name == "send_reminder":
        tasks = _tasks(ctx, args.get("task_ids"))
        person = ctx.circle.principal(str(args.get("principal_id"))) if ctx else None
        who = person.name if person else str(args.get("principal_id", "someone"))
        return f"Sent {who} a reminder about {_titles(tasks) or 'their tasks'}."
    return f"Ran {tool_name}."


def _card_id(ctx: EnvelopeContext | None, tool_name: str, index: int) -> str:
    if ctx is None:
        return f"esc-authority-{tool_name}-{index}"
    return f"esc-{ctx.circle.id}-{ctx.circle.period}-{tool_name}-{index}"


def build_card(
    tool_name: str,
    args: dict[str, Any],
    ctx: EnvelopeContext | None,
    decision: Decision,
    index: int = 1,
    period: str = "",
) -> EscalationCard:
    """Turn a refused action into the decision it really was.

    Every number on the card comes from the fairness engine. The copy is fixed
    text, not model prose, because this is the moment the product has to be
    most careful about what it claims.
    """
    card_id = _card_id(ctx, tool_name, index)
    base = dict(
        id=card_id,
        period=ctx.circle.period if ctx else period,
        kind="authority_exceeded",
    )

    if ctx is not None and tool_name in ("arrange_paid_help", "drop_task"):
        tasks = _tasks(ctx, args.get("task_ids") or args.get("task_id"))
        if tasks:
            return _card_for_less_family_work(tool_name, tasks, ctx, decision, base)

    if ctx is not None and tool_name == "change_capacity":
        person = ctx.circle.principal(str(args.get("principal_id")))
        try:
            new_capacity = float(args.get("new_capacity"))
        except (TypeError, ValueError):
            new_capacity = None
        if person is not None and new_capacity is not None and 0.05 <= new_capacity <= 1.0:
            return _card_for_capacity(person.id, new_capacity, ctx, decision, base)

    return EscalationCard(
        **base,
        headline=f"I stopped before {describe(tool_name, args, ctx)}, because it is "
        f"not mine to do.",
        what_i_tried=[f"Considered {describe(tool_name, args, ctx)}.", "Stopped before doing it."],
        the_tension=decision.why,
        options=[
            EscalationOption(label="Go ahead with it", consequence="Someone in the family does it, or asks me to."),
            EscalationOption(label="Leave it", consequence="Nothing changes."),
        ],
        what_i_will_not_decide="Whether this should happen at all. That is yours.",
    )


def _card_for_less_family_work(
    tool_name: str,
    tasks: list[CareTask],
    ctx: EnvelopeContext,
    decision: Decision,
    base: dict[str, Any],
) -> EscalationCard:
    ids = {t.id for t in tasks}
    before = ctx.report.max_deviation
    after = _without(ctx, ids).max_deviation
    hours = sum(t.duration_min for t in tasks) / 60.0
    holders = sorted(
        {
            p.name
            for p in ctx.circle.principals
            if any(ctx.allocation.assignments.get(t) == p.id for t in ids)
        }
    )
    carried_by = " and ".join(holders) if holders else "the family"
    recipient = _recipient(ctx.circle)
    spread = (
        f"The worst deviation would go from {_pct(before)} to {_pct(after)}, "
        f"against a limit of {_pct(FAIRNESS_TOLERANCE)}."
    )

    if tool_name == "arrange_paid_help":
        return EscalationCard(
            **base,
            headline=(
                f"Paid help could cover {len(tasks)} of this month's tasks. Whether "
                f"to bring someone in is your decision, not mine."
            ),
            what_i_tried=[
                "Looked for moves between you that stay inside everyone's stated limits.",
                f"Found that paid help for {_titles(tasks)} would take "
                f"{hours:.1f} hours of care off {carried_by}.",
                "Stopped before booking anything.",
            ],
            the_tension=(
                f"{spread} It also means spending money, and someone new in "
                f"{recipient}'s home."
            ),
            options=[
                EscalationOption(
                    label="Bring in paid help for these tasks",
                    consequence=(
                        f"The spread goes from {_pct(before)} to {_pct(after)}. You "
                        f"agree between you who pays, and {recipient} has a say in it."
                    ),
                    fairness_delta=round(after - before, 3),
                ),
                EscalationOption(
                    label="Keep this care within the family",
                    consequence="Nothing changes. The current split stands.",
                    fairness_delta=0.0,
                ),
            ],
            what_i_will_not_decide=(
                f"Whether to pay for care, who pays, and whether someone new comes "
                f"into {recipient}'s home. Those choices belong to your family, and "
                f"to {recipient}."
            ),
        )

    task = tasks[0]
    return EscalationCard(
        **base,
        headline=(
            f"Taking {task.title} ({_when(task)}) off the plan would lighten the load. "
            f"Whether {recipient} can do without it is not mine to decide."
        ),
        what_i_tried=[
            "Looked for a way to lighten the heaviest share.",
            f"Considered taking {task.title} off the plan, and stopped.",
        ],
        the_tension=f"{spread} {decision.why}",
        options=[
            EscalationOption(
                label="Take it off the plan this month",
                consequence=f"The spread goes from {_pct(before)} to {_pct(after)}.",
                fairness_delta=round(after - before, 3),
            ),
            EscalationOption(
                label="Keep it in the plan",
                consequence="Nothing changes. The current split stands.",
                fairness_delta=0.0,
            ),
        ],
        what_i_will_not_decide=(
            f"What care {recipient} needs. That is for {recipient} and for you, "
            f"with her doctors where it matters."
        ),
    )


def _card_for_capacity(
    principal_id: str,
    new_capacity: float,
    ctx: EnvelopeContext,
    decision: Decision,
    base: dict[str, Any],
) -> EscalationCard:
    person = ctx.circle.principal(principal_id)
    assert person is not None
    changed = ctx.circle.model_copy(
        update={
            "principals": [
                p.model_copy(update={"capacity": new_capacity}) if p.id == principal_id else p
                for p in ctx.circle.principals
            ]
        }
    )
    before = ctx.report.max_deviation
    after = build_fairness_report(changed, ctx.allocation).max_deviation
    name = person.name
    return EscalationCard(
        **base,
        headline=f"I will not change what {name} said they can carry.",
        what_i_tried=[
            f"Worked out the split as if {name}'s capacity were {new_capacity} "
            f"instead of {person.capacity}.",
            f"Left it exactly as {name} set it.",
        ],
        the_tension=(
            f"At {new_capacity}, the worst deviation would be {_pct(after)} instead "
            f"of {_pct(before)}. {decision.why}"
        ),
        options=[
            EscalationOption(
                label=f"Leave {name}'s capacity as they set it",
                consequence="Nothing changes.",
                fairness_delta=0.0,
            ),
            EscalationOption(
                label=f"{name} revisits it, if they choose to",
                consequence=(
                    f"Only {name} can do this. If they do, I renegotiate with the "
                    f"new figure and the spread moves to about {_pct(after)}."
                ),
                fairness_delta=round(after - before, 3),
            ),
        ],
        what_i_will_not_decide=f"How much {name} can carry. Only {name} knows that.",
    )


# ---------------------------------------------------------------------------
# The hook
# ---------------------------------------------------------------------------


class AuthorityGuard(HookProvider):
    """Strands hook on BeforeToolCallEvent that enforces the envelope.

    `context` is called at the moment of each tool call, so the envelope always
    judges against the rota as it stands then, not as it stood when the agent
    was built.
    """

    def __init__(
        self,
        *,
        ledger: Any = None,
        context: Callable[[], EnvelopeContext | None] = lambda: None,
        on_escalation: Callable[[EscalationCard], None] | None = None,
        echo: bool = False,
    ) -> None:
        self.ledger = ledger
        self.context = context
        self.on_escalation = on_escalation
        self.echo = echo
        self.cards: list[EscalationCard] = []
        self.decisions: list[tuple[str, dict[str, Any], Decision]] = []
        self._by_attempt: dict[str, EscalationCard] = {}

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self._check)

    def _check(self, event: BeforeToolCallEvent) -> None:
        # The structured output tool is how an answer comes back, not an action.
        if isinstance(event.selected_tool, StructuredOutputTool):
            return

        name = event.tool_use.get("name", "")
        args = event.tool_use.get("input") or {}
        if not isinstance(args, dict):
            args = {"input": args}
        if name in READ_ONLY_TOOLS:
            return

        ctx = self.context()
        decision = decide(name, args, ctx)
        self.decisions.append((name, args, decision))
        what = describe(name, args, ctx)
        round_number = ctx.round_number if ctx else None

        if decision.allowed:
            if self.echo:
                print(f"  [envelope] inside: {what}")
            if self.ledger is not None:
                self.ledger.record(
                    "took_action",
                    describe_done(name, args, ctx),
                    justification=decision.why,
                    round_number=round_number,
                    details={"tool": name, "input": args},
                )
            return

        key = f"{name}:{json.dumps(args, sort_keys=True, default=str)}"
        card = self._by_attempt.get(key)
        if card is None:
            card = build_card(
                name,
                args,
                ctx,
                decision,
                index=len(self.cards) + 1,
                period=getattr(self.ledger, "period", ""),
            )
            self._by_attempt[key] = card
            self.cards.append(card)
            if self.on_escalation is not None:
                self.on_escalation(card)
            if self.echo:
                print(f"  [envelope] outside: {what}. Raised with the family instead.")
            if self.ledger is not None:
                self.ledger.record(
                    "blocked_action",
                    f"Stopped before {what}.",
                    justification=decision.why,
                    round_number=round_number,
                    details={"tool": name, "input": args, "escalation_id": card.id},
                )
                self.ledger.record(
                    "raised_escalation",
                    f"Asked the family instead: {card.headline}",
                    justification=(
                        "Anything outside what I may do alone becomes a question for "
                        "the people it affects."
                    ),
                    round_number=round_number,
                    details={"escalation_id": card.id, "kind": card.kind},
                )

        event.cancel_tool = (
            f"Not done. {decision.why} It has been put to the family as a decision "
            f"instead: {card.headline}"
        )
