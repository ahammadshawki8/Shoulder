"""Generated care circles.

One hand-built family proves the demo. It does not prove the engine. These are
families nobody designed: two to five people, random capacities and distances,
random limits (some private), and a month of care built from a weekly pattern,
so the same family can be run month after month.

Three profiles, cycled so every run covers all three outcomes:

  open       few limits, similar capacities; usually settles
  tight      many limits, uneven capacities, caps and refusals; usually cannot
  shortfall  one on-site task falls on a day every person has blocked, so no
             one can legally take it and the circle must be told

Every private limit carries an invented secret with its own sensitive terms, so
the privacy checks have ground truth for people who are not Farah.

Deterministic for a given seed: the same seed is the same families.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from shoulder.models.core import WEEKDAYS, CareTask, Circle, Constraint, Principal, Tier
from shoulder.seed.demo_circle import _task

PROFILES = ("open", "tight", "shortfall")

_NAMES = ["Ada", "Bilal", "Chen", "Dara", "Esi", "Femi", "Gul"]

# (title, type, minutes low, minutes high, needs presence)
_TASK_KINDS = [
    ("Clinic appointment", "appointment", 90, 180, True),
    ("Pharmacy run", "medication", 45, 90, True),
    ("Pill organiser refill", "medication", 30, 60, True),
    ("Overnight stay", "night", 480, 600, True),
    ("Transport to physio", "transport", 90, 150, True),
    ("Visit and company", "visit", 120, 240, True),
    ("Shopping and kitchen reset", "household", 90, 150, True),
    ("Benefits paperwork", "admin", 45, 120, False),
    ("Bills and receipts", "finance", 30, 60, False),
]

# Invented secrets. Each would hurt someone if it reached their family.
SECRETS = [
    ("Weekly dialysis at the renal unit, and wiped out for the rest of the day.",
     ["dialysis", "renal", "kidney"]),
    ("Attends a gambling recovery group and is repaying a large debt quietly.",
     ["gambl", "recovery group", "debt"]),
    ("In the middle of a custody hearing and cannot risk missing a court date.",
     ["custody", "court", "lawyer"]),
    ("Going through IVF and has appointments at short notice.",
     ["ivf", "fertility", "embryo"]),
    ("Recently diagnosed with multiple sclerosis and has not said so yet.",
     ["sclerosis", "diagnos", "neurolog"]),
    ("Six months sober and will not be alone overnight in that house.",
     ["sober", "alcohol", "relapse"]),
]


@dataclass
class Family:
    """A generated family: its people and the weekly pattern of its care."""

    id: str
    profile: str
    principals: list[Principal]
    # (title, type, offset in days, minutes, needs presence); see demo_circle._day
    pattern: list[tuple[str, str, int, int, bool]]

    def circle(self, period: str) -> Circle:
        tasks: list[CareTask] = [
            _task(i + 1, title, ttype, offset, minutes, presence, period=period)
            for i, (title, ttype, offset, minutes, presence) in enumerate(self.pattern)
        ]
        return Circle(
            id=self.id,
            care_recipient="Their parent, generated",
            period=period,
            principals=[p.model_copy(deep=True) for p in self.principals],
            tasks=tasks,
        )


def _offset_for(weekday: str, week: int) -> int:
    """Offset (see demo_circle._day) that lands on `weekday` in week `week`.

    Offsets count from 1 October 2026, a Thursday.
    """
    return week * 7 + (WEEKDAYS.index(weekday) - WEEKDAYS.index("Thu")) % 7


def _constraint(rng: random.Random, pid: str, k: int, profile: str) -> Constraint:
    private = rng.random() < 0.4
    kind = rng.choice(["days", "days", "types", "cap"] if profile != "open" else ["days"])
    fields: dict = {}
    if kind == "days":
        days = rng.sample(WEEKDAYS, rng.randint(1, 2 if profile == "open" else 3))
        fields["blocks_weekdays"] = days
        fields["applies_to_remote"] = rng.random() < 0.6
        summary = f"Unavailable on {', '.join(days)}."
    elif kind == "types":
        types = rng.sample(["night", "transport", "appointment", "household"], rng.randint(1, 2))
        fields["blocks_task_types"] = types
        summary = f"Does not take {', '.join(types)} work."
    else:
        fields["max_tasks_per_period"] = rng.randint(3, 8)
        summary = f"At most {fields['max_tasks_per_period']} tasks a month."
    secret, terms = rng.choice(SECRETS)
    return Constraint(
        id=f"{pid}-c{k}",
        summary=summary,
        tier=Tier.PRIVATE if private else Tier.SHAREABLE,
        hardness="hard",
        reason=secret if private else None,
        sensitive_terms=terms if private else [],
        **fields,
    )


def generate_family(seed: int, index: int) -> Family:
    rng = random.Random(seed * 100_003 + index)
    profile = PROFILES[index % len(PROFILES)]
    size = rng.randint(2, 4) if profile == "open" else rng.randint(3, 5)

    principals: list[Principal] = []
    for name in rng.sample(_NAMES, size):
        pid = name.lower()
        if profile == "open":
            capacity = rng.choice([0.6, 0.7, 0.8, 0.9, 1.0])
            distance = rng.choice([3.0, 6.0, 10.0, 15.0])
            n_limits = rng.randint(0, 1)
        else:
            capacity = rng.choice([0.3, 0.4, 0.5, 0.6, 0.8, 1.0])
            distance = rng.choice([2.0, 8.0, 20.0, 60.0, 250.0])
            n_limits = rng.randint(1, 3)
        aversions = {
            t: rng.choice([0.6, 0.8, 1.2, 1.5])
            for t in rng.sample(["night", "admin", "finance", "visit", "transport"], rng.randint(0, 2))
        }
        principals.append(Principal(
            id=pid,
            name=name,
            capacity=capacity,
            distance_km=distance,
            constraints=[_constraint(rng, pid, k, profile) for k in range(n_limits)],
            aversions=aversions,
        ))

    n_tasks = rng.randint(10, 18) if profile == "open" else rng.randint(14, 26)
    pattern: list[tuple[str, str, int, int, bool]] = []
    seen: dict[str, int] = {}
    for _ in range(n_tasks):
        title, ttype, lo, hi, presence = rng.choice(_TASK_KINDS)
        weekday = rng.choice(WEEKDAYS)
        week = rng.randint(0, 3)
        seen[title] = seen.get(title, 0) + 1
        # Titles are what precedents match on, so recurring tasks keep theirs.
        pattern.append((
            f"{title} {seen[title]}",
            ttype,
            _offset_for(weekday, week),
            rng.randrange(lo, hi + 1, 15),
            presence,
        ))

    if profile == "shortfall":
        # One on-site visit on a day everyone has blocked, travel or not.
        day = rng.choice(WEEKDAYS)
        for p in principals:
            p.constraints.append(Constraint(
                id=f"{p.id}-away",
                summary=f"Away every {day}.",
                tier=Tier.SHAREABLE,
                hardness="hard",
                blocks_weekdays=[day],
            ))
        pattern.append(("Visit nobody can make", "visit", _offset_for(day, 1), 180, True))

    return Family(id=f"gen-{seed}-{index:03d}", profile=profile,
                  principals=principals, pattern=pattern)


def generate_families(n: int, seed: int = 7) -> list[Family]:
    return [generate_family(seed, i) for i in range(n)]
