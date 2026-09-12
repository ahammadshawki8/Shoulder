"""Actions: what the Convener can do in the world, as opposed to what it computes.

Every call passes through the authority envelope hook first
(`shoulder.hooks.authority`). Routine actions run unattended and are written to
the ledger. Everything else is refused before the tool body runs and becomes an
escalation card for the family instead. So the bodies below only ever execute
for actions inside the envelope.

The tools that are always refused are offered on purpose. The envelope is a
policy about authority, not a list of what the agent happens to be able to
reach. In production a booking tool would exist behind a gateway; what stops the
agent using it alone is the hook, not its absence.

Reminder delivery is wired to AgentCore Gateway in Tier 8. Until then a reminder
is recorded as queued, which is an honest description of what happened.
"""

from __future__ import annotations

from strands import tool


@tool
def send_reminder(principal_id: str, task_ids: list[str], note: str) -> dict:
    """Remind one person about care tasks they already hold in the current rota.

    Args:
        principal_id: the person to remind.
        task_ids: the tasks to remind them about. They must already hold them.
        note: one short, warm sentence to include with the reminder.

    Returns:
        Whether the reminder was queued.
    """
    return {"status": "queued", "principal_id": principal_id, "task_ids": task_ids}


@tool
def arrange_paid_help(task_ids: list[str], reason: str) -> dict:
    """Book a paid professional carer to cover specific care tasks this month.

    Args:
        task_ids: the tasks the carer would cover.
        reason: why this would help the family.

    Returns:
        The booking.
    """
    return {"status": "booked", "task_ids": task_ids}


@tool
def drop_task(task_id: str, reason: str) -> dict:
    """Remove a care task from this month's plan so that nobody has to do it.

    Args:
        task_id: the task to remove.
        reason: why removing it would help.

    Returns:
        Whether the task was removed.
    """
    return {"status": "removed", "task_id": task_id}


@tool
def change_capacity(principal_id: str, new_capacity: float, reason: str) -> dict:
    """Change the capacity a person declared, so the fair split is recalculated.

    Args:
        principal_id: whose capacity to change.
        new_capacity: the new capacity, between 0.05 and 1.0.
        reason: why the change would help.

    Returns:
        Whether the capacity was changed.
    """
    return {"status": "changed", "principal_id": principal_id}


ACTION_TOOLS = [send_reminder, arrange_paid_help, drop_task, change_capacity]
