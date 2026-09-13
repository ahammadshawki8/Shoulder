"""The Principal Agent: one per person in the circle.

This agent is the only thing in the system that ever sees what its person
actually said. It reasons with the whole truth and speaks only in positions.

The separation is enforced three ways, deliberately overlapping:
  1. Structurally, because Critique has no field that can carry a reason.
  2. By instruction, in the system prompt below.
  3. In code, by the PrivacyGuard hook (`shoulder.hooks.privacy`) registered on
     every principal agent. It screens every message the model produces, and it
     is the layer that does not depend on the model behaving.
"""

from __future__ import annotations

import json
from typing import Any

from strands import Agent
from strands.models import BedrockModel
from strands.models.model import Model

from shoulder.config import REASONING_MODEL, REGION
from shoulder.hooks.privacy import PrivacyGuard
from shoulder.resilience import with_retry
from shoulder.text import clean
from shoulder.models.core import Allocation, CareTask, Critique, Principal
from shoulder.agents.brief import (  # noqa: F401  re-exported
    INSTRUCTIONS,
    SYSTEM_PROMPT,
    WIRE_FORMAT,
    _private_block,
    _public_block,
    build_system_prompt,
)

def build_principal_agent(
    principal: Principal,
    wire_format: bool = False,
    *,
    ledger: Any = None,
    model: Model | None = None,
    system_prompt: str | None = None,
    echo: bool = False,
) -> Agent:
    """Construct the agent that speaks for one person.

    `wire_format` is for the A2A transport, where the agent must answer in JSON
    because structured output does not cross the protocol boundary.

    The privacy guard is always attached. There is deliberately no way to build
    a principal agent without it. `model` and `system_prompt` exist so the leak
    demo can stand in a misbehaving model; the guard does not change with them.
    """
    guard = PrivacyGuard(
        principal,
        # Over the wire the reply is text; in process it is the Critique object.
        reply="text" if wire_format else "structured",
        ledger=ledger,
        echo=echo,
    )
    return Agent(
        model=model or BedrockModel(model_id=REASONING_MODEL, region_name=REGION),
        system_prompt=system_prompt or build_system_prompt(principal, wire_format),
        hooks=[guard],
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


def build_critique_prompt(
    principal: Principal,
    allocation: Allocation,
    tasks_by_id: dict[str, CareTask],
    fairness_summary: str,
    round_number: int,
) -> str:
    """The question put to a principal's agent.

    Shared by both transports so that running over A2A asks exactly the same
    thing as running in process. If the two ever drift, the privacy eval stops
    testing what the demo actually does.
    """
    my_task_ids = allocation.bundle(principal.id)
    my_tasks = [tasks_by_id[t] for t in my_task_ids if t in tasks_by_id]
    public = _public_block(principal)

    return f"""Round {round_number}. Here is what the Convener proposes for you.

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


def critique_allocation(
    agent: Agent,
    principal: Principal,
    allocation: Allocation,
    tasks_by_id: dict[str, CareTask],
    fairness_summary: str,
    round_number: int,
) -> Critique:
    """Ask one principal's agent what it thinks of the proposed share, in process."""
    prompt = build_critique_prompt(
        principal, allocation, tasks_by_id, fairness_summary, round_number
    )

    def _ask() -> Critique:
        # Each round is judged fresh, as it always has been. What changed is the
        # call: this goes through the agent loop rather than the deprecated
        # structured_output shortcut, which skips the hook registry entirely.
        # Through the loop, the Critique arrives as a tool call and the privacy
        # guard screens it before it exists as an object.
        agent.messages.clear()
        result = agent(prompt, structured_output_model=Critique)
        if result.structured_output is None:
            raise ValueError("no valid tool use: principal returned no critique")
        return result.structured_output  # type: ignore[return-value]

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
    result.message = clean(result.message)
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
