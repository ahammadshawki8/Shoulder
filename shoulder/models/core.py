"""Core domain models for Shoulder.

The single most important type here is Position. A Principal holds everything a
person told their own agent, including things they would never say to their
family. A Position is the only thing that is ever allowed to leave that agent.
Keeping those two types separate is what makes the privacy boundary structural
rather than a promise.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class _Lenient(BaseModel):
    """Base for anything a model fills in through structured output.

    Models routinely return null for an empty list or an omitted string. That is
    not worth failing a whole negotiation over, so coerce it rather than raise.
    """

    @field_validator("*", mode="before")
    @classmethod
    def _null_to_default(cls, value, info):
        if value is not None:
            return value
        field = cls.model_fields.get(info.field_name)
        if field is None:
            return value
        annotation = str(field.annotation)
        if "list" in annotation.lower():
            return []
        if annotation == "<class 'str'>":
            return ""
        return value


TaskType = Literal[
    "appointment",
    "medication",
    "night",
    "transport",
    "admin",
    "finance",
    "visit",
    "household",
]

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class Tier(str, Enum):
    """Whether a fact may leave the principal's own agent."""

    SHAREABLE = "shareable"
    PRIVATE = "private"


class Constraint(BaseModel):
    """Something a person told their agent about what they can and cannot do.

    `effect` is the machine-readable part that the negotiation acts on.
    `reason` is why, in their own words. A private reason never leaves.

    For a private constraint, `summary` must describe only the effect ("Cannot do
    overnight care"), never the why. The effect reaches the circle anyway through
    the Position; the reason is the secret, and it belongs in `reason`.
    """

    id: str
    summary: str
    tier: Tier
    hardness: Literal["hard", "soft"] = "hard"
    reason: str | None = None

    blocks_weekdays: list[str] = Field(default_factory=list)
    blocks_task_types: list[TaskType] = Field(default_factory=list)
    max_tasks_per_period: int | None = None
    requires_remote: bool = False

    # Whether the blocked weekdays also rule out work that needs no travel.
    # A sibling who cannot drive across the country on a workday can still do
    # the paperwork that evening. Modelling that difference is what lets a
    # distant person carry real load instead of being written off.
    applies_to_remote: bool = True

    # Words that would give a private reason away even inside a sentence nobody
    # has written before ("chemo", "oncology"). The privacy guard treats any of
    # them in an outbound message as a leak. Like the reason itself, this list
    # never leaves the principal's own agent.
    sensitive_terms: list[str] = Field(default_factory=list)

    def is_private(self) -> bool:
        return self.tier == Tier.PRIVATE


class Principal(BaseModel):
    """One person in the care circle, as their own agent knows them."""

    id: str
    name: str
    capacity: float = Field(ge=0.05, le=1.0)
    distance_km: float = 0.0
    constraints: list[Constraint] = Field(default_factory=list)
    aversions: dict[str, float] = Field(default_factory=dict)
    endpoint: str | None = None

    def private_texts(self) -> list[str]:
        """Every private reason: the text that must never appear outbound.

        Summaries are not included. A private constraint's summary describes its
        effect, which the Position shares with the circle by design. The full
        detector, with sensitive terms and paraphrase matching, is
        `shoulder.hooks.privacy.PrivacyScreen`; use that for any audit.
        """
        return [c.reason for c in self.constraints if c.is_private() and c.reason]

    def to_position(self) -> "Position":
        """Project this principal down to what the circle is allowed to see.

        This is the privacy boundary in one function. Private constraints still
        shape the position (their days are still blocked) but their text and
        their reason are dropped on the floor.
        """
        unavailable: set[str] = set()
        unavailable_onsite: set[str] = set()
        refused: set[str] = set()
        caps: list[int] = []
        remote_only = False
        notes: list[str] = []

        for c in self.constraints:
            if c.applies_to_remote:
                unavailable.update(c.blocks_weekdays)
            else:
                unavailable_onsite.update(c.blocks_weekdays)
            refused.update(c.blocks_task_types)
            if c.max_tasks_per_period is not None:
                caps.append(c.max_tasks_per_period)
            if c.requires_remote:
                remote_only = True
            if not c.is_private():
                notes.append(c.summary)

        return Position(
            principal_id=self.id,
            name=self.name,
            capacity=self.capacity,
            distance_km=self.distance_km,
            unavailable_weekdays=sorted(unavailable, key=WEEKDAYS.index),
            unavailable_weekdays_onsite=sorted(
                unavailable_onsite - unavailable, key=WEEKDAYS.index
            ),
            refused_task_types=sorted(refused),
            max_tasks_per_period=min(caps) if caps else None,
            remote_only=remote_only,
            shareable_notes=notes,
            aversions=dict(self.aversions),
        )


class Position(BaseModel):
    """What a principal's agent tells the circle.

    Deliberately has no field that could carry a reason. If you find yourself
    wanting to add one, you are about to break the product's core promise.
    """

    principal_id: str
    name: str
    capacity: float
    distance_km: float
    unavailable_weekdays: list[str] = Field(default_factory=list)
    unavailable_weekdays_onsite: list[str] = Field(default_factory=list)
    refused_task_types: list[str] = Field(default_factory=list)
    max_tasks_per_period: int | None = None
    remote_only: bool = False
    shareable_notes: list[str] = Field(default_factory=list)
    aversions: dict[str, float] = Field(default_factory=dict)


class CareTask(BaseModel):
    """One unit of care work in the period."""

    id: str
    title: str
    type: TaskType
    on_date: date
    weekday: str
    duration_min: int
    requires_presence: bool = True
    notes: str | None = None


class Circle(BaseModel):
    """A family unit and the period being negotiated."""

    id: str
    care_recipient: str
    period: str
    principals: list[Principal]
    tasks: list[CareTask]

    def principal(self, pid: str) -> Principal | None:
        return next((p for p in self.principals if p.id == pid), None)

    def task(self, tid: str) -> CareTask | None:
        return next((t for t in self.tasks if t.id == tid), None)

    def positions(self) -> list[Position]:
        return [p.to_position() for p in self.principals]


class Allocation(BaseModel):
    """A mapping of care tasks to the people who will do them."""

    period: str
    round_number: int = 0
    assignments: dict[str, str] = Field(default_factory=dict)
    rationale: str = ""

    def bundle(self, principal_id: str) -> list[str]:
        return [t for t, p in self.assignments.items() if p == principal_id]


class PrincipalBurden(BaseModel):
    principal_id: str
    name: str
    task_count: int
    raw_hours: float
    weighted_burden: float
    capacity: float
    adjusted_share: float
    percent_of_total: float


class EnvyPair(BaseModel):
    envious: str
    envied: str
    magnitude: float


class FairnessReport(BaseModel):
    """The deterministic verdict on an allocation. No LLM touches these numbers."""

    period: str
    round_number: int
    burdens: list[PrincipalBurden]
    total_weighted_burden: float
    mean_adjusted_share: float
    max_deviation: float
    proportional: bool
    envy_free: bool
    envy_pairs: list[EnvyPair] = Field(default_factory=list)
    unassigned_tasks: list[str] = Field(default_factory=list)
    hard_violations: list[str] = Field(default_factory=list)

    @property
    def settled(self) -> bool:
        return (
            self.proportional
            and not self.unassigned_tasks
            and not self.hard_violations
        )

    def headline(self) -> str:
        worst = max(self.burdens, key=lambda b: b.adjusted_share, default=None)
        best = min(self.burdens, key=lambda b: b.adjusted_share, default=None)
        if not worst or not best or worst.principal_id == best.principal_id:
            return "Load is even across the circle."
        if best.adjusted_share <= 0:
            return f"{worst.name} is carrying the entire load."
        gap = (worst.adjusted_share / best.adjusted_share - 1.0) * 100
        return f"{worst.name} is carrying {gap:.0f} percent more than {best.name}."


class Critique(_Lenient):
    """A principal agent's response to a proposed allocation.

    `reason_class` is a category, never free text about why. That distinction is
    the whole point: the circle learns that a constraint exists, not what it is.
    """

    principal_id: str
    verdict: Literal["accept", "counter", "veto"]
    reason_class: Literal[
        "none",
        "hard_constraint",
        "over_capacity",
        "task_type_refused",
        "distance",
        "unfair_share",
    ] = "none"
    contested_task_ids: list[str] = Field(default_factory=list)
    message: str = ""


EffectKind = Literal[
    "accept_split",
    "paid_help",
    "remove_tasks",
    "decline_action",
    "none",
]


class OptionEffect(_Lenient):
    """What choosing an option would actually do, in terms code can apply.

    This is what makes a human decision reusable. The label is prose for the
    family; the effect is the part the fairness engine can price today and the
    precedent system can apply next month without asking again.

      accept_split    the current split stands despite the spread
      paid_help       paid help covers `task_ids`
      remove_tasks    `task_ids` come off the plan
      decline_action  do not take `action` (and do not suggest it again)
      none            nothing the system can apply, like a conversation
    """

    kind: EffectKind = "none"
    task_ids: list[str] = Field(default_factory=list)
    action: str = ""
    principal_id: str = ""


class EscalationOption(_Lenient):
    label: str
    consequence: str
    # Computed by the fairness engine from `effect`, never taken from a model.
    fairness_delta: float = 0.0
    effect: OptionEffect | None = None


class EscalationCard(_Lenient):
    """The only thing that ever asks a human for anything."""

    id: str
    period: str
    kind: Literal[
        "irreducible_conflict",
        "capacity_shortfall",
        "fairness_breach",
        "authority_exceeded",
    ]
    headline: str
    what_i_tried: list[str] = Field(default_factory=list)
    the_tension: str = ""
    options: list[EscalationOption] = Field(default_factory=list)
    what_i_will_not_decide: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")
    )


class Resolution(BaseModel):
    """A human's answer to an escalation card."""

    escalation_id: str
    period: str
    option_index: int
    option_label: str
    decided_by: str
    decided_at: str
    note: str = ""


PrecedentKind = Literal["paid_help", "remove_tasks", "accept_split", "decline_action"]


class Precedent(BaseModel):
    """A resolved escalation turned into a rule the agent applies without asking.

    Built by code from the effect of the option a human chose, never written by a
    model. `text` is the decision in the family's terms. `provenance()` is how
    the agent cites it back to them every time it is applied.

    Recurring tasks are matched by title, because task ids restart each period
    and "the Wednesday overnight stay" is what the family actually decided about.
    """

    id: str
    kind: PrecedentKind
    text: str
    task_titles: list[str] = Field(default_factory=list)
    action: str = ""
    principal_id: str = ""
    max_deviation: float | None = None
    source_escalation_id: str
    period_decided: str
    decided_by: str
    decided_at: str
    active: bool = True

    def provenance(self) -> str:
        # Stored in UTC, shown in the reader's local time: a family decides on
        # their own date, not Greenwich's.
        when = datetime.fromisoformat(self.decided_at).astimezone()
        return f"{self.decided_by} decided this on {when.day} {when.strftime('%b')}"


LedgerKind = Literal[
    "seeded_rota",
    "applied_precedent",
    "noted_change",
    "proposed_moves",
    "reversed_move",
    "kept_better_split",
    "asked_for_view",
    "measured_fairness",
    "published_rota",
    "raised_escalation",
    "withheld_private_detail",
    "blocked_action",
    "took_action",
]


class LedgerEntry(BaseModel):
    """One thing the agent did without asking anyone.

    `summary` is what the family reads. `justification` is why the agent was
    allowed to do it unattended. Entries scoped to one person
    (`scope="private:farah"`) stay with that person's agent and are never part
    of the family's ledger.
    """

    id: str
    seq: int
    at: str
    period: str
    round_number: int | None = None
    actor: str
    kind: LedgerKind
    summary: str
    justification: str = ""
    scope: str = "family"
    details: dict[str, Any] = Field(default_factory=dict)


class NegotiationRound(BaseModel):
    round_number: int
    allocation: Allocation
    critiques: list[Critique]
    report: FairnessReport


class NegotiationOutcome(BaseModel):
    """Everything a session produced. This is what gets written to fixtures."""

    circle_id: str
    period: str
    settled: bool
    rounds: list[NegotiationRound] = Field(default_factory=list)
    final_allocation: Allocation | None = None
    final_report: FairnessReport | None = None
    escalations: list[EscalationCard] = Field(default_factory=list)
    # Tasks taken out of the family's split by a precedent, and by which one.
    covered: dict[str, str] = Field(default_factory=dict)
    applied_precedents: list[str] = Field(default_factory=list)
    settled_by_precedent: str | None = None
