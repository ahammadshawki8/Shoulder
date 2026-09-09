"""The Principal Agent: one per person in the circle.

This agent is the only thing in the system that ever sees what its person
actually said. It reasons with the whole truth and speaks only in positions.

The separation is enforced three ways, deliberately overlapping:
  1. Structurally, because Critique has no field that can carry a reason.
  2. By instruction, in the system prompt below.
  3. At runtime, by a redaction guard on the way out (Tier 4 replaces this with a
     proper Strands hook; this is the floor, not the ceiling).
"""

from __future__ import annotations

import json

from strands import Agent
from strands.models import BedrockModel

from shoulder.config import REASONING_MODEL, REGION
from shoulder.resilience import with_retry
from shoulder.text import clean
from shoulder.models.core import Allocation, CareTask, Critique, Principal

SYSTEM_PROMPT = """You are the private agent for {name}, one of several adult \
siblings arranging care for their mother.

You are on {name}'s side. You are not a mediator and not a scheduler. Your job is
to judge whether a proposed share of the care load is something {name} can
actually do, and to say so.

WHAT YOU KNOW THAT NOBODY ELSE DOES

{private_block}

THE ONE RULE YOU MAY NEVER BREAK

The other siblings, and the Convener that coordinates them, must never learn the
private information above. Not the wording, not a paraphrase, not a hint, not an
explanation that would let anyone infer it. If a private constraint makes an
assignment impossible, you refuse the assignment and give the category of the
problem, never the substance. "I cannot take Friday" is correct. Any sentence
that gestures at why is a failure, and it is the kind of failure that would cause
real harm to {name}.

HOW TO RESPOND

Return a verdict:
  accept  - this share is workable
  counter - mostly workable, but specific tasks must move
  veto    - a hard constraint is broken and this cannot stand

Pick the reason_class that matches, list the task ids you contest, and write one
short neutral sentence for `message`. That sentence is read by the whole family.
Write it as {name} would want it read: plain, unapologetic, no excuses offered
and none demanded.
"""

_PUBLIC_ONLY = "You are holding nothing private this month."


def _private_block(principal: Principal) -> str:
    lines: list[str] = []
    for c in principal.constraints:
        if c.is_private():
            lines.append(f"- {c.summary}")
            if c.reason:
                lines.append(f"  Because: {c.reason}")
    if not lines:
        return _PUBLIC_ONLY
    lines.append(
        "\nEverything above is private. It shapes what you accept. It never "
        "appears in what you say."
    )
    return "\n".join(lines)


def _public_block(principal: Principal) -> str:
    lines = [
        f"- {c.summary}"
        for c in principal.constraints
        if not c.is_private()
    ]
    return "\n".join(lines) if lines else "- Nothing stated publicly."


def build_principal_agent(principal: Principal) -> Agent:
    """Construct the agent that speaks for one person."""
    return Agent(
        model=BedrockModel(model_id=REASONING_MODEL, region_name=REGION),
        system_prompt=SYSTEM_PROMPT.format(
            name=principal.name, private_block=_private_block(principal)
        ),
        callback_handler=None,
    )


def _describe_bundle(tasks: list[CareTask]) -> str:
    if not tasks:
        return "  (nothing assigned to you this round)"
    return "\n".join(
        f"  {t.id}  {t.weekday} {t.on_date}  {t.title}  "
        f"[{t.type}, {t.duration_min} min]"
        for t in sorted(tasks, key=lambda x: x.on_date)
    )


def redact(text: str, principal: Principal) -> tuple[str, bool]:
    """Last line of defence before a principal's words leave the agent.

    Returns the text and whether anything had to be removed. Tier 4 promotes this
    into a Strands hook that also writes to the ledger.
    """
    leaked = False
    cleaned = text
    for secret in principal.private_texts():
        for fragment in {secret, secret.rstrip(".")}:
            if fragment and fragment.lower() in cleaned.lower():
                cleaned = cleaned.replace(fragment, "[withheld]")
                leaked = True
    return cleaned, leaked


def critique_allocation(
    agent: Agent,
    principal: Principal,
    allocation: Allocation,
    tasks_by_id: dict[str, CareTask],
    fairness_summary: str,
    round_number: int,
) -> Critique:
    """Ask one principal's agent what it thinks of the proposed share."""
    my_task_ids = allocation.bundle(principal.id)
    my_tasks = [tasks_by_id[t] for t in my_task_ids if t in tasks_by_id]

    public = _public_block(principal)
    prompt = f"""Round {round_number}. Here is what the Convener proposes for you.

YOUR SHARE ({len(my_tasks)} tasks)
{_describe_bundle(my_tasks)}

WHAT THE CIRCLE ALREADY KNOWS ABOUT YOUR AVAILABILITY
{public}

HOW THE LOAD IS SPLIT RIGHT NOW
{fairness_summary}

Judge this share. If a hard constraint of yours is broken, veto it and name the
task ids. If it is close but wrong, counter. If you can do it, accept, even if
someone else is carrying more than you: that is not yours to fix.
"""

    def _ask() -> Critique:
        return agent.structured_output(Critique, prompt)

    def _silent() -> Critique:
        # If a principal's agent cannot be reached, the safe reading is silence,
        # not consent. Record that we did not hear from them rather than
        # inventing an acceptance on their behalf.
        return Critique(
            principal_id=principal.id,
            verdict="counter",
            reason_class="none",
            message="No response from this agent in time for this round.",
        )

    result = with_retry(_ask, label=f"{principal.name} critique", fallback=_silent)
    result.principal_id = principal.id
    cleaned, leaked = redact(clean(result.message), principal)
    result.message = cleaned
    if leaked:
        result.message = (
            f"{result.message} (a private detail was removed before sending)"
        )
    return result


def positions_brief(principals: list[Principal]) -> str:
    """The circle's shared view of who can do what. Positions only, never people."""
    out: list[str] = []
    for p in principals:
        pos = p.to_position()
        bits = [f"capacity {pos.capacity}", f"{pos.distance_km:.0f} km away"]
        if pos.unavailable_weekdays:
            bits.append("unavailable " + ", ".join(pos.unavailable_weekdays))
        if pos.unavailable_weekdays_onsite:
            bits.append(
                "cannot be there in person on "
                + ", ".join(pos.unavailable_weekdays_onsite)
                + " (remote admin and finance still fine)"
            )
        if pos.refused_task_types:
            bits.append("does not take " + ", ".join(pos.refused_task_types))
        if pos.max_tasks_per_period is not None:
            bits.append(f"at most {pos.max_tasks_per_period} tasks")
        out.append(f"- {pos.name} ({pos.principal_id}): " + "; ".join(bits))
    return "\n".join(out)


def positions_payload(principals: list[Principal]) -> str:
    """Machine-readable positions, for logging and for the privacy eval."""
    return json.dumps(
        [p.to_position().model_dump(mode="json") for p in principals], indent=2
    )
