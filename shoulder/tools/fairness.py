"""Deterministic fair division.

Nothing in this module calls a model. Every number the product shows a family is
computed here, the same way every time, and can be recomputed by hand from the
inputs. The agents negotiate and explain; they do not decide what is fair.

Fairness notions implemented:

  Capacity-adjusted proportionality
      Each person's weighted burden divided by their declared capacity should sit
      within FAIRNESS_TOLERANCE of the circle mean. Equal split is not fair when
      one sibling has a newborn and another is between jobs, so entitlement is
      scaled by declared capacity rather than by headcount.

  Weighted envy-freeness (WEF)
      Person i envies person j when i's own disutility for i's bundle, scaled by
      i's capacity, exceeds i's disutility for j's bundle scaled by j's capacity.
      Disutility is personal: an hour of night care is not the same load to
      everyone, so each principal carries their own aversion multipliers.

References for the approach:
  Aziz et al., Fair and Efficient Allocation of Indivisible Chores, IJCAI 2023
  Distribution of Chores with Information Asymmetry, arXiv:2305.02986
  Repeated Fair Allocation of Indivisible Items, AAAI 2024
"""

from __future__ import annotations

from strands import tool

from shoulder.config import (
    EFFORT_WEIGHTS,
    ENVY_EPSILON,
    FAIRNESS_TOLERANCE,
    REMOTE_CAPABLE,
    TRAVEL_CAP_MINUTES,
    TRAVEL_MINUTES_PER_KM,
)
from shoulder.models.core import (
    Allocation,
    CareTask,
    Circle,
    EnvyPair,
    FairnessReport,
    Position,
    PrincipalBurden,
)


def needs_travel(task: CareTask) -> bool:
    """Does this task actually put someone in the room?

    Paperwork and bills do not, which is the whole reason a sibling three hundred
    kilometres away can still carry a real share.
    """
    return task.requires_presence and task.type not in REMOTE_CAPABLE


def task_load(task: CareTask, distance_km: float) -> float:
    """Felt load of one task in weighted hours, for someone at a given distance.

    Clock time multiplied by how heavy that kind of work is, plus a round trip
    for anything that needs a body in the room.
    """
    weight = EFFORT_WEIGHTS.get(task.type, 1.0)
    minutes = task.duration_min * weight
    if needs_travel(task):
        minutes += min(
            2 * distance_km * TRAVEL_MINUTES_PER_KM, TRAVEL_CAP_MINUTES
        )
    return minutes / 60.0


def personal_disutility(task: CareTask, position: Position) -> float:
    """What this task costs this particular person.

    Same task, different people, different numbers. That asymmetry is what makes
    a negotiated allocation better than an even split.
    """
    base = task_load(task, position.distance_km)
    return base * position.aversions.get(task.type, 1.0)


def compute_burdens(
    circle: Circle, allocation: Allocation
) -> list[PrincipalBurden]:
    """Per-person load under a proposed allocation."""
    positions = {p.principal_id: p for p in circle.positions()}
    burdens: list[PrincipalBurden] = []

    weighted_by_pid: dict[str, float] = {}
    for pid, pos in positions.items():
        raw = 0.0
        weighted = 0.0
        count = 0
        for task_id in allocation.bundle(pid):
            task = circle.task(task_id)
            if task is None:
                continue
            count += 1
            raw += task.duration_min / 60.0
            weighted += personal_disutility(task, pos)
        weighted_by_pid[pid] = weighted
        burdens.append(
            PrincipalBurden(
                principal_id=pid,
                name=pos.name,
                task_count=count,
                raw_hours=round(raw, 2),
                weighted_burden=round(weighted, 3),
                capacity=pos.capacity,
                adjusted_share=round(weighted / pos.capacity, 3)
                if pos.capacity > 0
                else 0.0,
                percent_of_total=0.0,
            )
        )

    total = sum(weighted_by_pid.values())
    for b in burdens:
        b.percent_of_total = (
            round(100.0 * weighted_by_pid[b.principal_id] / total, 1)
            if total > 0
            else 0.0
        )
    return burdens


def check_proportionality(
    burdens: list[PrincipalBurden], tolerance: float = FAIRNESS_TOLERANCE
) -> tuple[bool, float, float]:
    """Is every capacity-adjusted share close enough to the circle mean?

    Returns (is_proportional, mean_adjusted_share, max_relative_deviation).
    """
    if not burdens:
        return True, 0.0, 0.0
    shares = [b.adjusted_share for b in burdens]
    mean = sum(shares) / len(shares)
    if mean <= 0:
        return True, 0.0, 0.0
    max_dev = max(abs(s - mean) / mean for s in shares)
    return max_dev <= tolerance, round(mean, 3), round(max_dev, 3)


def check_envy_freeness(
    circle: Circle, allocation: Allocation, epsilon: float = ENVY_EPSILON
) -> tuple[bool, list[EnvyPair]]:
    """Weighted envy-freeness over chores.

    i envies j when i would rather carry j's bundle than their own, after both
    are scaled by the capacity each person declared.
    """
    positions = {p.principal_id: p for p in circle.positions()}
    pairs: list[EnvyPair] = []

    for i_id, i_pos in positions.items():
        if i_pos.capacity <= 0:
            continue
        own = sum(
            personal_disutility(t, i_pos)
            for t in (circle.task(x) for x in allocation.bundle(i_id))
            if t is not None
        )
        own_scaled = own / i_pos.capacity

        for j_id, j_pos in positions.items():
            if i_id == j_id or j_pos.capacity <= 0:
                continue
            # i values j's bundle using i's own aversions and i's own distance.
            theirs = sum(
                personal_disutility(t, i_pos)
                for t in (circle.task(x) for x in allocation.bundle(j_id))
                if t is not None
            )
            theirs_scaled = theirs / j_pos.capacity
            if own_scaled > theirs_scaled * (1.0 + epsilon):
                pairs.append(
                    EnvyPair(
                        envious=i_id,
                        envied=j_id,
                        magnitude=round(own_scaled - theirs_scaled, 3),
                    )
                )

    return (not pairs), pairs


def find_hard_violations(circle: Circle, allocation: Allocation) -> list[str]:
    """Assignments that contradict a stated hard constraint.

    Note that private constraints are enforced here too. The engine sees that a
    day is blocked; it never sees why, and neither does the family.
    """
    violations: list[str] = []
    positions = {p.principal_id: p for p in circle.positions()}
    counts: dict[str, int] = {pid: 0 for pid in positions}

    for task_id, pid in allocation.assignments.items():
        task = circle.task(task_id)
        pos = positions.get(pid)
        if task is None:
            violations.append(f"unknown task {task_id}")
            continue
        if pos is None:
            violations.append(f"task {task_id} assigned to unknown person {pid}")
            continue

        counts[pid] += 1

        if task.weekday in pos.unavailable_weekdays:
            violations.append(
                f"{pos.name} is unavailable on {task.weekday} but holds {task.id}"
            )
        elif task.weekday in pos.unavailable_weekdays_onsite and needs_travel(task):
            violations.append(
                f"{pos.name} cannot be there in person on {task.weekday} "
                f"but holds on-site {task.id}"
            )
        if task.type in pos.refused_task_types:
            violations.append(
                f"{pos.name} does not take {task.type} work but holds {task.id}"
            )
        if pos.remote_only and task.type not in REMOTE_CAPABLE:
            violations.append(
                f"{pos.name} can only take remote work but holds on-site {task.id}"
            )

    for pid, count in counts.items():
        pos = positions[pid]
        if pos.max_tasks_per_period is not None and count > pos.max_tasks_per_period:
            violations.append(
                f"{pos.name} is capped at {pos.max_tasks_per_period} tasks but holds {count}"
            )

    return violations


def build_fairness_report(circle: Circle, allocation: Allocation) -> FairnessReport:
    """Full deterministic verdict on an allocation."""
    burdens = compute_burdens(circle, allocation)
    proportional, mean, max_dev = check_proportionality(burdens)
    envy_free, envy_pairs = check_envy_freeness(circle, allocation)
    assigned = set(allocation.assignments)
    unassigned = [t.id for t in circle.tasks if t.id not in assigned]

    return FairnessReport(
        period=circle.period,
        round_number=allocation.round_number,
        burdens=burdens,
        total_weighted_burden=round(sum(b.weighted_burden for b in burdens), 3),
        mean_adjusted_share=mean,
        max_deviation=max_dev,
        proportional=proportional,
        envy_free=envy_free,
        envy_pairs=envy_pairs,
        unassigned_tasks=unassigned,
        hard_violations=find_hard_violations(circle, allocation),
    )


# ---------------------------------------------------------------------------
# Strands tool wrappers.
#
# The agents call these to check their own work. The functions above are the
# implementation; these are the surface the model is allowed to touch. The model
# can ask whether something is fair. It cannot decide that it is.
# ---------------------------------------------------------------------------


_ACTIVE_CIRCLE: Circle | None = None


def set_active_circle(circle: Circle) -> None:
    """Bind the circle the tools operate on for this negotiation."""
    global _ACTIVE_CIRCLE
    _ACTIVE_CIRCLE = circle


def _require_circle() -> Circle:
    if _ACTIVE_CIRCLE is None:
        raise RuntimeError("no active circle bound; call set_active_circle first")
    return _ACTIVE_CIRCLE


@tool
def compute_burden(assignments: dict[str, str]) -> dict:
    """Compute each person's care load under a proposed assignment.

    Args:
        assignments: mapping of task id to the principal id who would do it.

    Returns:
        Per-person task count, raw hours, weighted burden, declared capacity and
        capacity-adjusted share.
    """
    circle = _require_circle()
    allocation = Allocation(period=circle.period, assignments=assignments)
    return {"burdens": [b.model_dump() for b in compute_burdens(circle, allocation)]}


@tool
def check_allocation_is_proportional(assignments: dict[str, str]) -> dict:
    """Check whether an assignment satisfies capacity-adjusted proportionality.

    Args:
        assignments: mapping of task id to the principal id who would do it.

    Returns:
        Whether it is proportional, the circle mean adjusted share, and the worst
        relative deviation from that mean.
    """
    circle = _require_circle()
    allocation = Allocation(period=circle.period, assignments=assignments)
    burdens = compute_burdens(circle, allocation)
    ok, mean, dev = check_proportionality(burdens)
    return {
        "proportional": ok,
        "mean_adjusted_share": mean,
        "max_deviation": dev,
        "tolerance": FAIRNESS_TOLERANCE,
    }


@tool
def check_allocation_is_envy_free(assignments: dict[str, str]) -> dict:
    """Check weighted envy-freeness: would anyone rather have someone else's load?

    Args:
        assignments: mapping of task id to the principal id who would do it.

    Returns:
        Whether the allocation is envy free, and every envying pair with the size
        of the gap.
    """
    circle = _require_circle()
    allocation = Allocation(period=circle.period, assignments=assignments)
    ok, pairs = check_envy_freeness(circle, allocation)
    return {"envy_free": ok, "envy_pairs": [p.model_dump() for p in pairs]}


@tool
def fairness_report(assignments: dict[str, str]) -> dict:
    """Full fairness verdict on a proposed assignment.

    Args:
        assignments: mapping of task id to the principal id who would do it.

    Returns:
        Burdens, proportionality, envy-freeness, unassigned tasks and any
        assignment that breaks a stated hard constraint.
    """
    circle = _require_circle()
    allocation = Allocation(period=circle.period, assignments=assignments)
    return build_fairness_report(circle, allocation).model_dump(mode="json")


FAIRNESS_TOOLS = [
    compute_burden,
    check_allocation_is_proportional,
    check_allocation_is_envy_free,
    fairness_report,
]
