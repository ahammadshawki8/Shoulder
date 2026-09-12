"""Deterministic answers to "what would this option actually do?"

Every number on an escalation card comes from here or from the fairness engine
it wraps. A model may write the words of an option; the consequence it carries
is computed, the same way every time. Before this existed, the model filled in
`fairness_delta` itself, which broke the rule that fairness never goes through
an LLM (every one it wrote was 0.0).
"""

from __future__ import annotations

from itertools import combinations

from shoulder.models.core import Allocation, Circle, FairnessReport, OptionEffect
from shoulder.tools.fairness import build_fairness_report


def fairness_without(
    circle: Circle, allocation: Allocation, task_ids: set[str]
) -> FairnessReport:
    """The fairness report if these tasks left the family's plan entirely."""
    reduced = circle.model_copy(
        update={"tasks": [t for t in circle.tasks if t.id not in task_ids]}
    )
    remaining = Allocation(
        period=allocation.period,
        round_number=allocation.round_number,
        assignments={t: p for t, p in allocation.assignments.items() if t not in task_ids},
    )
    return build_fairness_report(reduced, remaining)


def valid_task_ids(circle: Circle, task_ids: list[str]) -> list[str]:
    known = {t.id for t in circle.tasks}
    return [t for t in dict.fromkeys(task_ids) if t in known]


def price_effect(
    effect: OptionEffect | None,
    circle: Circle,
    allocation: Allocation,
    report: FairnessReport,
) -> float:
    """Change in worst deviation if this option were chosen. Negative is fairer."""
    if effect is None or effect.kind not in ("paid_help", "remove_tasks"):
        return 0.0
    ids = set(valid_task_ids(circle, effect.task_ids))
    if not ids:
        return 0.0
    after = fairness_without(circle, allocation, ids).max_deviation
    return round(after - report.max_deviation, 3)


def best_paid_help(
    circle: Circle,
    allocation: Allocation,
    report: FairnessReport,
    max_tasks: int = 2,
) -> tuple[list[str], float] | None:
    """The smallest set of tasks whose cover would make the split fairest.

    Searches every set of up to `max_tasks` tasks. Returns None unless the best
    one actually lowers the worst deviation: suggesting paid help that makes the
    split less fair is worse than suggesting nothing.
    """
    best: tuple[float, int, list[str]] | None = None
    ids = sorted(allocation.assignments)
    for size in range(1, max_tasks + 1):
        for combo in combinations(ids, size):
            dev = fairness_without(circle, allocation, set(combo)).max_deviation
            key = (dev, size, list(combo))
            if best is None or key < best:
                best = key
    if best is None or best[0] >= report.max_deviation:
        return None
    return best[2], best[0]
