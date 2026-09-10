"""Tests for the deterministic fair division engine.

These matter more than they look. Every number a family sees comes from this
module, and none of it is checked by a model. If proportionality is wrong, the
product tells someone they are carrying a fair share when they are not.
"""

from __future__ import annotations

import pytest

from shoulder.agents.convener import repair_allocation, seed_allocation
from shoulder.models.core import (
    Allocation,
    CareTask,
    Circle,
    Constraint,
    Principal,
    Tier,
)
from shoulder.seed.demo_circle import build_circle
from shoulder.tools.fairness import (
    build_fairness_report,
    check_envy_freeness,
    check_proportionality,
    compute_burdens,
    find_hard_violations,
    needs_travel,
    task_load,
)


def _task(tid: str, ttype: str, weekday: str, minutes: int, presence: bool = True):
    from datetime import date

    return CareTask(
        id=tid,
        title=tid,
        type=ttype,  # type: ignore[arg-type]
        on_date=date(2026, 10, 1),
        weekday=weekday,
        duration_min=minutes,
        requires_presence=presence,
    )


def _simple_circle() -> Circle:
    return Circle(
        id="test",
        care_recipient="test parent",
        period="2026-10",
        principals=[
            Principal(id="a", name="A", capacity=1.0, distance_km=0.0),
            Principal(id="b", name="B", capacity=1.0, distance_km=0.0),
        ],
        tasks=[
            _task("T1", "visit", "Mon", 60),
            _task("T2", "visit", "Tue", 60),
        ],
    )


class TestTaskLoad:
    def test_effort_weight_is_applied(self):
        night = _task("N", "night", "Mon", 60)
        admin = _task("A", "admin", "Mon", 60)
        # A night hour is heavier than an admin hour. If this ever inverts, the
        # whole notion of burden is broken.
        assert task_load(night, 0.0) > task_load(admin, 0.0)

    def test_remote_work_ignores_distance(self):
        admin = _task("A", "admin", "Mon", 60, presence=False)
        assert task_load(admin, 0.0) == task_load(admin, 500.0)

    def test_travel_is_capped(self):
        visit = _task("V", "visit", "Mon", 60)
        far = task_load(visit, 500.0)
        further = task_load(visit, 5000.0)
        assert far == further, "travel must be capped, not unbounded"

    def test_needs_travel_excludes_remote_types(self):
        assert needs_travel(_task("V", "visit", "Mon", 60)) is True
        assert needs_travel(_task("F", "finance", "Mon", 60)) is False


class TestProportionality:
    def test_even_split_is_proportional(self):
        circle = _simple_circle()
        alloc = Allocation(period="2026-10", assignments={"T1": "a", "T2": "b"})
        burdens = compute_burdens(circle, alloc)
        ok, _mean, dev = check_proportionality(burdens)
        assert ok
        assert dev == pytest.approx(0.0)

    def test_one_person_carrying_everything_is_not_proportional(self):
        circle = _simple_circle()
        alloc = Allocation(period="2026-10", assignments={"T1": "a", "T2": "a"})
        burdens = compute_burdens(circle, alloc)
        ok, _mean, dev = check_proportionality(burdens)
        assert not ok
        assert dev == pytest.approx(1.0)

    def test_capacity_changes_what_counts_as_fair(self):
        """Half the capacity should mean half the load, not half the tasks.

        This is the difference between Shoulder and an even split, so it is the
        single most important behaviour in the engine.
        """
        circle = _simple_circle()
        circle.principals[1].capacity = 0.5
        equal = Allocation(period="2026-10", assignments={"T1": "a", "T2": "b"})
        burdens = compute_burdens(circle, equal)
        ok, _mean, _dev = check_proportionality(burdens)
        assert not ok, "an even split is unfair when capacities differ"


class TestEnvyFreeness:
    def test_equal_bundles_are_envy_free(self):
        circle = _simple_circle()
        alloc = Allocation(period="2026-10", assignments={"T1": "a", "T2": "b"})
        envy_free, pairs = check_envy_freeness(circle, alloc)
        assert envy_free
        assert pairs == []

    def test_carrying_everything_creates_envy(self):
        circle = _simple_circle()
        alloc = Allocation(period="2026-10", assignments={"T1": "a", "T2": "a"})
        envy_free, pairs = check_envy_freeness(circle, alloc)
        assert not envy_free
        assert any(p.envious == "a" and p.envied == "b" for p in pairs)


class TestHardConstraints:
    def test_blocked_weekday_is_a_violation(self):
        circle = _simple_circle()
        circle.principals[0].constraints.append(
            Constraint(
                id="c", summary="not Mondays", tier=Tier.SHAREABLE,
                blocks_weekdays=["Mon"],
            )
        )
        alloc = Allocation(period="2026-10", assignments={"T1": "a"})
        assert find_hard_violations(circle, alloc)

    def test_private_constraint_is_enforced_the_same_as_a_public_one(self):
        """A secret limit still binds. Privacy must not cost someone protection."""
        circle = _simple_circle()
        circle.principals[0].constraints.append(
            Constraint(
                id="c", summary="not Mondays", tier=Tier.PRIVATE,
                reason="something they have not told anyone",
                blocks_weekdays=["Mon"],
            )
        )
        alloc = Allocation(period="2026-10", assignments={"T1": "a"})
        assert find_hard_violations(circle, alloc)

    def test_remote_work_survives_a_travel_only_block(self):
        circle = _simple_circle()
        circle.tasks.append(_task("T3", "admin", "Mon", 60, presence=False))
        circle.principals[0].constraints.append(
            Constraint(
                id="c", summary="cannot travel Mondays", tier=Tier.SHAREABLE,
                blocks_weekdays=["Mon"], applies_to_remote=False,
            )
        )
        alloc = Allocation(period="2026-10", assignments={"T3": "a"})
        assert find_hard_violations(circle, alloc) == []


class TestPrivacyBoundary:
    def test_position_never_carries_a_private_reason(self):
        circle = build_circle()
        farah = circle.principal("farah")
        assert farah is not None
        secrets = farah.private_texts()
        assert secrets, "the demo circle must contain a private constraint"

        payload = farah.to_position().model_dump_json()
        for secret in secrets:
            assert secret not in payload

    def test_private_constraint_still_shapes_the_position(self):
        """The circle learns the shape of the limit, never its substance."""
        circle = build_circle()
        farah = circle.principal("farah")
        assert farah is not None
        pos = farah.to_position()
        assert "Fri" in pos.unavailable_weekdays
        assert "night" in pos.refused_task_types
        assert pos.shareable_notes == []


class TestSeedAndRepair:
    def test_seed_respects_every_hard_constraint(self):
        circle = build_circle()
        alloc = seed_allocation(circle)
        assert find_hard_violations(circle, alloc) == []

    def test_seed_assigns_every_task(self):
        circle = build_circle()
        alloc = seed_allocation(circle)
        assert len(alloc.assignments) == len(circle.tasks)

    def test_repair_reverses_an_illegal_assignment(self):
        """The model may propose anything. Only legal splits are allowed to stand."""
        circle = build_circle()
        alloc = seed_allocation(circle)
        friday = next(t for t in circle.tasks if t.weekday == "Fri")
        broken = Allocation(
            period=circle.period,
            assignments={**alloc.assignments, friday.id: "farah"},
        )
        assert find_hard_violations(circle, broken)

        repaired, corrections = repair_allocation(circle, broken)
        assert find_hard_violations(circle, repaired) == []
        assert corrections
        assert repaired.assignments[friday.id] != "farah"

    def test_repair_leaves_no_task_behind(self):
        circle = build_circle()
        empty = Allocation(period=circle.period, assignments={})
        repaired, _ = repair_allocation(circle, empty)
        assert len(repaired.assignments) == len(circle.tasks)


class TestDemoCircle:
    @pytest.mark.parametrize("period", ["2026-10", "2026-11", "2027-02"])
    def test_every_task_lands_on_the_weekday_its_title_claims(self, period):
        """Guards a real bug: a 'Saturday overnight' that fell on a Tuesday and
        became impossible for anyone to do. Holds for every month, because the
        schedule is a weekly pattern."""
        circle = build_circle(period)
        assert all(t.on_date.strftime("%Y-%m") == period for t in circle.tasks)
        names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        for task in circle.tasks:
            assert task.weekday == names[task.on_date.weekday()]
            for day in names:
                if day.lower() in task.title.lower():
                    assert task.weekday == day, f"{task.id} says {day}"

    def test_scenario_is_feasible_but_not_fair(self):
        """The demo depends on this exact shape.

        A rota exists that breaks nobody's limits, and no rota exists that is
        also proportional. That gap is the whole point of the product: the agent
        does everything it can, and what remains is a human decision.
        """
        circle = build_circle()
        report = build_fairness_report(circle, seed_allocation(circle))
        assert report.hard_violations == []
        assert report.unassigned_tasks == []
        assert not report.proportional
