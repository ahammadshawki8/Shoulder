"""The Convener: proposes a split, then revises it against what the agents say.

The Convener never sees a private constraint. It works entirely from Positions,
which is why it can be trusted to coordinate at all.

Round one is seeded deterministically. That is not a shortcut: starting from a
feasible, capacity-aware split means the model spends its rounds on the genuinely
contested parts rather than rediscovering arithmetic. Rounds two and beyond are
the model revising in response to critiques.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field
from strands import Agent
from strands.models import BedrockModel
from strands.models.model import Model

from shoulder.config import REASONING_MODEL, REGION, REMOTE_CAPABLE
from shoulder.resilience import with_retry
from shoulder.text import clean, clean_all
from shoulder.models.core import (
    Allocation,
    Circle,
    Critique,
    EscalationCard,
    FairnessReport,
    Position,
    _Lenient,
)
from shoulder.tools.actions import ACTION_TOOLS
from shoulder.tools.fairness import (
    FAIRNESS_TOOLS,
    needs_travel,
    personal_disutility,
    task_load,
)

CONVENER_PROMPT = """You are the Convener for a family arranging care for their \
mother. Three adult siblings each have their own agent. You coordinate between
them.

WHAT YOU ARE FOR

You do the work nobody in this family can do for themselves: hold everyone's
stated limits at once, find a split that respects all of them, and keep the load
proportional to what each person said they can carry.

WHAT YOU ARE NOT FOR

You do not decide anything that belongs to the family. You do not tell anyone
they should do more. You do not judge whether someone's stated capacity is
honest. When you cannot find a fair split, you say so plainly and hand it back.
That is a success, not a failure.

WHAT YOU KNOW

Only positions: availability, refused task types, caps, distance, declared
capacity. You never learn why anyone is unavailable. Do not speculate about it,
in your reasoning or in your rationale. A sibling's reasons are theirs.

FAIRNESS IS NOT YOURS TO JUDGE

Call the fairness tools. They compute capacity-adjusted proportionality and
weighted envy-freeness deterministically. Never estimate a burden yourself and
never argue with the numbers they return.

WHEN YOU REVISE

Move specific tasks in response to specific objections. Respect every veto
absolutely. Prefer moving remote work (admin, finance) to distant siblings, since
distance costs them nothing there. Never assign someone a task on a weekday they
said they cannot do.

Write plain prose. Never use em dashes and never use emojis.
"""


class TaskMove(BaseModel):
    """One task changing hands."""

    task_id: str
    to_principal_id: str
    why: str = ""


class ProposedRevision(_Lenient):
    """What the Convener returns when it revises a split.

    Deliberately a short list of moves rather than a fresh allocation. Asking a
    model to re-emit every assignment invites it to quietly reshuffle work nobody
    objected to, and the result drifts further from fair each round. Constraining
    it to a handful of deliberate moves keeps each round an argument about
    something specific.
    """

    moves: list[TaskMove] = Field(default_factory=list)
    rationale: str = ""


def build_convener_agent(
    *, hooks: list[Any] | None = None, model: Model | None = None
) -> Agent:
    """The Convener, with tools that measure and tools that act.

    The acting tools are only ever reached through the authority envelope hook
    passed in `hooks` (see `shoulder.hooks.authority`). The negotiation always
    passes one.
    """
    return Agent(
        model=model or BedrockModel(model_id=REASONING_MODEL, region_name=REGION),
        system_prompt=CONVENER_PROMPT,
        tools=[*FAIRNESS_TOOLS, *ACTION_TOOLS],
        hooks=hooks or [],
        callback_handler=None,
    )


# ---------------------------------------------------------------------------
# Deterministic seed
# ---------------------------------------------------------------------------


def _eligible(pos: Position, task, held: int) -> bool:
    if task.weekday in pos.unavailable_weekdays:
        return False
    if task.weekday in pos.unavailable_weekdays_onsite and needs_travel(task):
        return False
    if task.type in pos.refused_task_types:
        return False
    if pos.remote_only and task.type not in REMOTE_CAPABLE:
        return False
    if pos.max_tasks_per_period is not None and held >= pos.max_tasks_per_period:
        return False
    return True


def seed_allocation(circle: Circle) -> Allocation:
    """A feasible starting split, built greedily by lowest capacity-adjusted load.

    Hard constraints are absolute. Tasks nobody can legally take are left
    unassigned so that the evaluator sees the shortfall rather than the seeder
    hiding it.
    """
    positions = {p.principal_id: p for p in circle.positions()}
    load: dict[str, float] = {pid: 0.0 for pid in positions}
    held: dict[str, int] = {pid: 0 for pid in positions}
    assignments: dict[str, str] = {}

    # Hardest first: the scarcest tasks should pick their owner before the easy
    # ones soak up the available people.
    def scarcity(task) -> tuple[int, float]:
        n = sum(1 for pos in positions.values() if _eligible(pos, task, held[pos.principal_id]))
        return (n, -task_load(task, 0.0))

    for task in sorted(circle.tasks, key=scarcity):
        best_pid, best_score = None, None
        for pid, pos in positions.items():
            if not _eligible(pos, task, held[pid]):
                continue
            cost = personal_disutility(task, pos)
            projected = (load[pid] + cost) / pos.capacity if pos.capacity > 0 else 1e9
            if best_score is None or projected < best_score:
                best_pid, best_score = pid, projected
        if best_pid is not None:
            assignments[task.id] = best_pid
            load[best_pid] += personal_disutility(task, positions[best_pid])
            held[best_pid] += 1

    return Allocation(
        period=circle.period,
        round_number=1,
        assignments=assignments,
        rationale=(
            "Opening split. Every hard constraint respected, load balanced against "
            "declared capacity, remote work pushed to whoever is furthest away."
        ),
    )


def repair_allocation(circle: Circle, allocation: Allocation) -> tuple[Allocation, list[str]]:
    """Make a proposed split legal, deterministically.

    The model proposes; this decides what is allowed to stand. Any assignment
    that breaks a hard constraint is stripped and re-placed with someone who can
    actually do it. A rota that breaks a stated limit must never reach a family,
    however good the reasoning behind it looked.

    Returns the repaired allocation and a note of what had to be corrected.
    """
    positions = {p.principal_id: p for p in circle.positions()}
    held: dict[str, int] = {pid: 0 for pid in positions}
    load: dict[str, float] = {pid: 0.0 for pid in positions}
    kept: dict[str, str] = {}
    corrections: list[str] = []

    for task_id, pid in allocation.assignments.items():
        task = circle.task(task_id)
        pos = positions.get(pid)
        if task is None or pos is None:
            corrections.append(f"dropped unknown assignment {task_id} -> {pid}")
            continue
        if _eligible(pos, task, held[pid]):
            kept[task_id] = pid
            held[pid] += 1
            load[pid] += personal_disutility(task, pos)
        else:
            corrections.append(
                f"{pos.name} cannot take {task_id} ({task.weekday}, {task.type})"
            )

    # Re-place everything that was stripped or never assigned, cheapest first.
    for task in circle.tasks:
        if task.id in kept:
            continue
        best_pid, best_score = None, None
        for pid, pos in positions.items():
            if not _eligible(pos, task, held[pid]):
                continue
            cost = personal_disutility(task, pos)
            projected = (load[pid] + cost) / pos.capacity if pos.capacity > 0 else 1e9
            if best_score is None or projected < best_score:
                best_pid, best_score = pid, projected
        if best_pid is not None:
            kept[task.id] = best_pid
            held[best_pid] += 1
            load[best_pid] += personal_disutility(task, positions[best_pid])

    return (
        Allocation(
            period=allocation.period,
            round_number=allocation.round_number,
            assignments=kept,
            rationale=allocation.rationale,
        ),
        corrections,
    )


# ---------------------------------------------------------------------------
# LLM revision
# ---------------------------------------------------------------------------


def _fairness_brief(report: FairnessReport) -> str:
    lines = [
        f"  {b.name:<8} {b.task_count:>2} tasks  "
        f"{b.weighted_burden:>6.1f} weighted hours  "
        f"capacity {b.capacity}  adjusted share {b.adjusted_share:>6.2f}"
        for b in report.burdens
    ]
    lines.append(
        f"  circle mean adjusted share {report.mean_adjusted_share}, "
        f"worst deviation {report.max_deviation} "
        f"(tolerance is exceeded above 0.15)"
    )
    if report.unassigned_tasks:
        lines.append(f"  UNASSIGNED: {', '.join(report.unassigned_tasks)}")
    if report.hard_violations:
        lines.append("  HARD CONSTRAINT BREAKS:")
        lines.extend(f"    {v}" for v in report.hard_violations)
    return "\n".join(lines)


def fairness_brief(report: FairnessReport) -> str:
    return _fairness_brief(report)


def revise_allocation(
    agent: Agent,
    circle: Circle,
    allocation: Allocation,
    report: FairnessReport,
    critiques: list[Critique],
    round_number: int,
) -> Allocation:
    """Ask the Convener to fix what the last round got wrong."""
    from shoulder.agents.principal import positions_brief

    objections = "\n".join(
        f"  {c.principal_id}: {c.verdict.upper()} ({c.reason_class})"
        + (f" contests {', '.join(c.contested_task_ids)}" if c.contested_task_ids else "")
        + f' - "{c.message}"'
        for c in critiques
    )

    # Show only who currently holds what, grouped by person, so the model reasons
    # about bundles rather than a flat list of 26 lines.
    by_person: list[str] = []
    for p in circle.principals:
        held = allocation.bundle(p.id)
        lines = []
        for tid in sorted(held):
            t = circle.task(tid)
            if t:
                lines.append(
                    f"      {t.id}  {t.weekday}  {t.title}  "
                    f"[{t.type}, {t.duration_min} min]"
                )
        by_person.append(f"  {p.name} ({p.id}) holds {len(held)}:\n" + "\n".join(lines))
    current = "\n".join(by_person)

    overloaded = max(report.burdens, key=lambda b: b.adjusted_share)
    underloaded = min(report.burdens, key=lambda b: b.adjusted_share)

    # Work out which of the overloaded person's tasks could legally move, and to
    # whom. Eligibility is a rule, not a judgement, so the model should not be
    # spending its reasoning on it: it gets the legal options and chooses between
    # them. Earlier rounds without this had the Convener repeatedly proposing
    # Friday work for a sibling who had said she was unavailable on Fridays.
    positions = {p.principal_id: p for p in circle.positions()}
    held_counts: dict[str, int] = {
        pid: len(allocation.bundle(pid)) for pid in positions
    }
    movable: list[str] = []
    for tid in sorted(allocation.bundle(overloaded.principal_id)):
        task = circle.task(tid)
        if task is None:
            continue
        takers = [
            pos.name
            for pid, pos in positions.items()
            if pid != overloaded.principal_id
            and _eligible(pos, task, held_counts[pid])
        ]
        if takers:
            movable.append(
                f"      {task.id}  {task.weekday}  {task.title} "
                f"[{task.type}]  can move to: {', '.join(takers)}"
            )
    movable_block = (
        "\n".join(movable)
        if movable
        else "      Nothing that anyone else is allowed to take."
    )

    prompt = f"""Round {round_number}. The previous split did not settle.

WHO CAN DO WHAT
{positions_brief(circle.principals)}

CURRENT SPLIT
{current}

WHAT THE FAIRNESS TOOLS SAY
{_fairness_brief(report)}

WHAT THE SIBLINGS SAID
{objections}

Right now {overloaded.name} carries the most at an adjusted share of
{overloaded.adjusted_share}, and {underloaded.name} the least at
{underloaded.adjusted_share}. The circle mean is {report.mean_adjusted_share}.

THE ONLY MOVES AVAILABLE TO YOU
These are {overloaded.name}'s tasks that someone else is actually allowed to take,
with the people who can legally take them. Every other move breaks a stated limit
and will be reversed.

{movable_block}

Choose at most four of these moves. Pick the ones that shift the most weight off
{overloaded.name}, preferring tasks that are heavy for {overloaded.name} and
lighter for whoever takes them. Do not invent a move that is not listed above.

If nothing on that list meaningfully closes the gap, return no moves at all and
say so in the rationale. Proposing a move you know will not help is worse than
admitting the limits do not allow one.
"""

    proposed = with_retry(
        lambda: agent.structured_output(ProposedRevision, prompt),
        label=f"convener revision round {round_number}",
        fallback=lambda: ProposedRevision(moves=[], rationale="No revision this round."),
    )

    assignments = dict(allocation.assignments)
    applied = 0
    for move in proposed.moves[:6]:
        if circle.task(move.task_id) is None:
            continue
        if circle.principal(move.to_principal_id) is None:
            continue
        if assignments.get(move.task_id) == move.to_principal_id:
            continue
        assignments[move.task_id] = move.to_principal_id
        applied += 1

    rationale = clean(proposed.rationale)
    return Allocation(
        period=circle.period,
        round_number=round_number,
        assignments=assignments,
        rationale=rationale or f"Applied {applied} move(s).",
    )


def attempt_remedies(
    agent: Agent,
    circle: Circle,
    allocation: Allocation,
    report: FairnessReport,
) -> str:
    """Out of rounds: give the Convener one chance to act beyond moving tasks.

    This is where the authority envelope earns its place. The Convener has tools
    that act in the world, and some of them would genuinely close the gap, like
    booking paid help for the overnight stays. Whether it is allowed to is not
    its call. Whatever it reaches for goes through the envelope hook: routine
    actions run and are ledgered, the rest come back as "not done, raised with
    the family" and become escalation cards of their own.

    Runs through the agent loop, not structured output, because tools only run
    inside the loop. The conversation is cleared afterwards so the structured
    calls that follow start clean.
    """
    from shoulder.agents.principal import positions_brief

    current = "\n".join(
        f"  {p.name} ({p.id}) holds: "
        + ", ".join(
            f"{t.id} {t.weekday} {t.title} [{t.type}]"
            for t in (circle.task(x) for x in sorted(allocation.bundle(p.id)))
            if t is not None
        )
        for p in circle.principals
    )
    prompt = f"""The negotiation rounds are over and the split is still outside the
fairness limit. Before this goes back to the family, consider whether anything
beyond moving tasks between them would help.

WHO CAN DO WHAT
{positions_brief(circle.principals)}

CURRENT SPLIT
{current}

WHAT THE FAIRNESS TOOLS SAY
{_fairness_brief(report)}

You have tools that act, not only tools that measure. If one action would
genuinely help this family close the gap, take the single most helpful one. If
none would, take no action.

Before you act, check with the fairness tools that the action would actually
bring every share closer to the limit. For an action that removes tasks from the
family's load, call fairness_report on the current assignments without those
tasks and compare max_deviation with the figure above. An action that would not
help is worse than no action at all.

Then say in one or two plain sentences what you did and why.
"""
    try:
        reply = with_retry(
            lambda: str(agent(prompt)),
            label="convener remedies",
            fallback=lambda: "",
        )
    finally:
        agent.messages.clear()
    return clean(reply.strip())


def write_escalation(
    agent: Agent,
    circle: Circle,
    allocation: Allocation,
    report: FairnessReport,
    critiques: list[Critique],
    attempts: list[str],
) -> EscalationCard:
    """Compose the one thing that asks a human for something.

    The Convener has already done everything it is allowed to do. This is where
    it stops and says so.
    """
    kind = "fairness_breach"
    if report.unassigned_tasks:
        kind = "capacity_shortfall"
    elif any(c.verdict == "veto" for c in critiques):
        kind = "irreducible_conflict"

    prompt = f"""You could not settle this fairly, and you are out of rounds.

WHERE IT ENDED
{_fairness_brief(report)}

WHAT YOU TRIED
{chr(10).join('  - ' + a for a in attempts)}

WHAT THE SIBLINGS SAID
{chr(10).join(f'  {c.principal_id}: {c.verdict} ({c.reason_class}) - {c.message}' for c in critiques)}

Write the escalation card for the family.

  headline: one sentence, factual, naming who is carrying more and by how much.
  what_i_tried: the concrete moves you attempted, in plain language.
  the_tension: why it cannot be closed, in terms of stated limits only. Never
    speculate about anyone's reasons.
  options: two or three real choices, each with its honest consequence. Include
    the option of leaving it as it stands.
  what_i_will_not_decide: say clearly that choosing between these is theirs, and
    why you are not the right one to choose.

Set kind to "{kind}". Never suggest that anyone is not pulling their weight. One
of them may be carrying something you cannot see.
"""

    card = with_retry(
        lambda: agent.structured_output(EscalationCard, prompt),
        label="escalation card",
        fallback=lambda: EscalationCard(
            id=f"esc-{circle.id}-{circle.period}",
            period=circle.period,
            kind=kind,
            headline=report.headline(),
            what_i_tried=attempts,
            the_tension="The stated limits do not leave room for a proportional split.",
            what_i_will_not_decide="Which limit to revisit is the family's decision, not mine.",
        ),
    )
    card.period = circle.period
    card.kind = kind  # type: ignore[assignment]
    if not card.id:
        card.id = f"esc-{circle.id}-{circle.period}"

    card.headline = clean(card.headline) or report.headline()
    card.the_tension = clean(card.the_tension)
    card.what_i_will_not_decide = clean(card.what_i_will_not_decide)
    card.what_i_tried = clean_all(card.what_i_tried)
    for option in card.options:
        option.label = clean(option.label)
        option.consequence = clean(option.consequence)
    return card
