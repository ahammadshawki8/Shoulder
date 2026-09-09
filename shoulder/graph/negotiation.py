"""The negotiation, as a Strands Graph.

The graph is genuinely cyclic: propose, critique, evaluate, and back to propose
until the fairness invariant holds or the rounds run out. Strands supports this
through reset_on_revisit, with set_max_node_executions as the hard stop.

Three of the five nodes are deterministic. They are real graph nodes rather than
helper functions because the fairness verdict has to sit inside the negotiation,
not beside it: the model must not be able to route around the arithmetic.

  propose    LLM, except round one which is a deterministic seed
  critique   LLM, one call per principal, each with only their own private view
  evaluate   deterministic, no model
  settle     deterministic, no model
  escalate   LLM, writes the card the family will read
"""

from __future__ import annotations

from typing import Any

from strands.multiagent import GraphBuilder
from strands.multiagent.base import MultiAgentBase, MultiAgentResult, Status

from shoulder.agents.convener import (
    build_convener_agent,
    fairness_brief,
    repair_allocation,
    revise_allocation,
    seed_allocation,
    write_escalation,
)
from shoulder.agents.principal import build_principal_agent, critique_allocation
from shoulder.config import MAX_ROUNDS
from shoulder.models.core import (
    Allocation,
    Circle,
    Critique,
    EscalationCard,
    FairnessReport,
    NegotiationOutcome,
    NegotiationRound,
)
from shoulder.tools.fairness import build_fairness_report, set_active_circle


class NegotiationState:
    """Shared state threaded through the graph.

    The graph controls what runs next; this holds what everyone is arguing about.
    """

    def __init__(self, circle: Circle, max_rounds: int = MAX_ROUNDS) -> None:
        self.circle = circle
        self.max_rounds = max_rounds
        self.round_number = 0
        self.tasks_by_id = {t.id: t for t in circle.tasks}

        self.allocation: Allocation | None = None
        self.report: FairnessReport | None = None
        self.critiques: list[Critique] = []

        # The best feasible split seen so far. A later round is allowed to be
        # worse; it is not allowed to be what the family ends up with. Publishing
        # the last thing tried rather than the best thing found would be a bug
        # with real consequences for whoever the rota lands on.
        self.best_allocation: Allocation | None = None
        self.best_report: FairnessReport | None = None

        self.rounds: list[NegotiationRound] = []
        self.attempts: list[str] = []
        self.escalations: list[EscalationCard] = []
        self.settled = False
        self.exhausted = False

        self.convener = build_convener_agent()
        self.principal_agents = {
            p.id: build_principal_agent(p) for p in circle.principals
        }

    def consider(self, allocation: Allocation, report: FairnessReport) -> None:
        """Keep this split if it is the best legal one we have found."""
        feasible = not report.hard_violations and not report.unassigned_tasks
        if not feasible:
            return
        if (
            self.best_report is None
            or report.max_deviation < self.best_report.max_deviation
        ):
            self.best_allocation = allocation
            self.best_report = report

    def outcome(self) -> NegotiationOutcome:
        return NegotiationOutcome(
            circle_id=self.circle.id,
            period=self.circle.period,
            settled=self.settled,
            rounds=self.rounds,
            final_allocation=self.best_allocation or self.allocation,
            final_report=self.best_report or self.report,
            escalations=self.escalations,
        )


class _Node(MultiAgentBase):
    """Base for a graph node that works on shared negotiation state."""

    def __init__(self, state: NegotiationState, name: str) -> None:
        super().__init__()
        self.state = state
        self.name = name

    async def invoke_async(
        self,
        task: str | list[Any],
        invocation_state: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> MultiAgentResult:
        self.run()
        return MultiAgentResult(status=Status.COMPLETED, results={})

    def run(self) -> None:  # pragma: no cover - overridden
        raise NotImplementedError


class ProposeNode(_Node):
    """Round one seeds deterministically; later rounds are the Convener revising."""

    def run(self) -> None:
        s = self.state
        s.round_number += 1

        if s.round_number == 1:
            s.allocation = seed_allocation(s.circle)
            s.attempts.append(
                "Built an opening split from everyone's stated availability, "
                "balanced against declared capacity."
            )
        else:
            assert s.allocation is not None and s.report is not None
            proposed = revise_allocation(
                s.convener,
                s.circle,
                s.allocation,
                s.report,
                s.critiques,
                s.round_number,
            )
            # The model proposes. This decides what is allowed to stand.
            s.allocation, corrections = repair_allocation(s.circle, proposed)
            s.allocation.round_number = s.round_number
            s.attempts.append(
                f"Round {s.round_number}: {s.allocation.rationale.strip()}"
            )
            for c in corrections:
                print(f"  [repair]   {c}")

            # Hill climb. A round is allowed to explore a worse split, but the
            # working rota does not keep it. Without this the negotiation can
            # wander away from a good answer it already had.
            trial = build_fairness_report(s.circle, s.allocation)
            feasible = not trial.hard_violations and not trial.unassigned_tasks
            if (
                s.best_report is not None
                and feasible
                and trial.max_deviation > s.best_report.max_deviation
            ):
                print(f"  [reject]   round {s.round_number} moves made it worse "
                      f"({trial.max_deviation} vs {s.best_report.max_deviation}), "
                      f"keeping the better split")
                s.attempts.append(
                    f"Round {s.round_number}: those moves made the split less "
                    f"even, so they were not kept."
                )
                assert s.best_allocation is not None
                s.allocation = s.best_allocation.model_copy(
                    update={"round_number": s.round_number}
                )
        print(f"  [propose]  round {s.round_number}: "
              f"{len(s.allocation.assignments)}/{len(s.circle.tasks)} tasks assigned")


class CritiqueNode(_Node):
    """Each principal agent judges its own share, and only its own."""

    def run(self) -> None:
        s = self.state
        assert s.allocation is not None
        interim = build_fairness_report(s.circle, s.allocation)
        brief = fairness_brief(interim)

        s.critiques = []
        for principal in s.circle.principals:
            critique = critique_allocation(
                s.principal_agents[principal.id],
                principal,
                s.allocation,
                s.tasks_by_id,
                brief,
                s.round_number,
            )
            s.critiques.append(critique)
            print(f"  [critique] {principal.name}: {critique.verdict} "
                  f"({critique.reason_class})")


class EvaluateNode(_Node):
    """The deterministic verdict. No model runs here, by design."""

    def run(self) -> None:
        s = self.state
        assert s.allocation is not None
        s.report = build_fairness_report(s.circle, s.allocation)
        s.rounds.append(
            NegotiationRound(
                round_number=s.round_number,
                allocation=s.allocation,
                critiques=list(s.critiques),
                report=s.report,
            )
        )

        s.consider(s.allocation, s.report)

        vetoed = any(c.verdict == "veto" for c in s.critiques)
        s.settled = s.report.settled and not vetoed
        s.exhausted = (not s.settled) and s.round_number >= s.max_rounds

        print(f"  [evaluate] proportional={s.report.proportional} "
              f"envy_free={s.report.envy_free} "
              f"violations={len(s.report.hard_violations)} "
              f"unassigned={len(s.report.unassigned_tasks)} "
              f"deviation={s.report.max_deviation}")


class SettleNode(_Node):
    def run(self) -> None:
        print("  [settle]   invariant holds, rota published")


class EscalateNode(_Node):
    """Out of rounds. Hand it back to the humans, with the work shown."""

    def run(self) -> None:
        s = self.state
        # Escalate about the rota the family will actually be given, which is the
        # best legal one found, not whatever the last round happened to try.
        allocation = s.best_allocation or s.allocation
        report = s.best_report or s.report
        assert allocation is not None and report is not None
        card = write_escalation(
            s.convener, s.circle, allocation, report, s.critiques, s.attempts
        )
        s.escalations.append(card)
        print(f"  [escalate] {card.kind}: {card.headline}")


def build_negotiation_graph(state: NegotiationState):
    """Wire the graph, including the revision cycle."""
    builder = GraphBuilder()

    builder.add_node(ProposeNode(state, "propose"), "propose")
    builder.add_node(CritiqueNode(state, "critique"), "critique")
    builder.add_node(EvaluateNode(state, "evaluate"), "evaluate")
    builder.add_node(SettleNode(state, "settle"), "settle")
    builder.add_node(EscalateNode(state, "escalate"), "escalate")

    builder.add_edge("propose", "critique")
    builder.add_edge("critique", "evaluate")

    # Conditions close over the shared state rather than reading GraphState,
    # because what decides the next step is the fairness verdict, not the graph's
    # own bookkeeping.
    builder.add_edge("evaluate", "propose", condition=lambda _s: not state.settled and not state.exhausted)
    builder.add_edge("evaluate", "settle", condition=lambda _s: state.settled)
    builder.add_edge("evaluate", "escalate", condition=lambda _s: state.exhausted)

    builder.set_entry_point("propose")
    builder.reset_on_revisit(True)
    builder.set_max_node_executions(4 * MAX_ROUNDS + 6)
    builder.set_graph_id("shoulder-negotiation")
    return builder.build()


def negotiate(circle: Circle, max_rounds: int = MAX_ROUNDS) -> NegotiationOutcome:
    """Run one full negotiation for a circle and return everything it produced."""
    set_active_circle(circle)
    state = NegotiationState(circle, max_rounds=max_rounds)
    graph = build_negotiation_graph(state)
    graph(
        f"Negotiate the care rota for {circle.care_recipient} "
        f"covering {circle.period}."
    )
    return state.outcome()
