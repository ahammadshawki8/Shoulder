"""The negotiation, as a Strands Graph.

The graph is genuinely cyclic: propose, critique, evaluate, and back to propose
until the fairness invariant holds or the rounds run out. Strands supports this
through reset_on_revisit, with set_max_node_executions as the hard stop.

Three of the five nodes are deterministic. They are real graph nodes rather than
helper functions because the fairness verdict has to sit inside the negotiation,
not beside it: the model must not be able to route around the arithmetic.

  recall     deterministic: what changed since last period, and every precedent
             the family's past decisions created, applied with provenance
  propose    LLM, except round one which is a deterministic seed
  critique   LLM, one call per principal, each with only their own private view
  evaluate   deterministic, no model
  settle     deterministic, no model
  escalate   LLM: one chance to act (through the authority envelope), then the
             card the family will read

Everything the negotiation does without asking is written to the ledger as it
happens, in words the family can read. Two hooks guard the edges: a privacy
guard on every principal agent, and the authority envelope on the Convener.
"""

from __future__ import annotations

from typing import Any

from strands.multiagent import GraphBuilder
from strands.multiagent.base import MultiAgentBase, MultiAgentResult, Status

from shoulder.agents.convener import (
    attempt_remedies,
    build_convener_agent,
    fairness_brief,
    repair_allocation,
    revise_allocation,
    seed_allocation,
    write_escalation,
)
from shoulder.agents.principal import (
    build_critique_prompt,
    build_principal_agent,
    critique_allocation,
)
from shoulder.config import FAIRNESS_TOLERANCE, MAX_ROUNDS
from shoulder.hooks.authority import AuthorityGuard, EnvelopeContext, decide, describe_done
from shoulder.ledger import Ledger, private_scope
from shoulder.models.core import (
    Allocation,
    Circle,
    Critique,
    EscalationCard,
    FairnessReport,
    NegotiationOutcome,
    NegotiationRound,
    Precedent,
)
from shoulder.precedent import accepting, recall
from shoulder.tools.fairness import build_fairness_report, set_active_circle


_VERDICT_WORDS = {
    "accept": "it works",
    "counter": "some of it needs to move",
    "veto": "it breaks a hard limit",
}


def _pct(value: float) -> str:
    return f"{round(value * 100)} percent"


def _rank(report: FairnessReport) -> tuple[int, int, float]:
    """How good a split is, lower first: limits broken, care left undone, spread.

    A circle where some task cannot be covered by anyone still needs the fairest
    split of everything else. Ranking only feasible splits meant such a circle
    never kept any, and the family was handed whatever the last round tried: in
    the Tier 7 fairness eval, a spread of 222 percent where the opening split
    had 68.
    """
    return (len(report.hard_violations), len(report.unassigned_tasks), report.max_deviation)


def _feasible(report: FairnessReport) -> bool:
    return not report.hard_violations and not report.unassigned_tasks


def _moves(circle: Circle, before: Allocation, after: Allocation) -> list[str]:
    """Each task that changed hands, in words: "Weekend visit (Sat) from Amina to Rian"."""
    names = {p.id: p.name for p in circle.principals}
    out: list[str] = []
    for task_id, pid in sorted(after.assignments.items()):
        was = before.assignments.get(task_id)
        if was == pid:
            continue
        task = circle.task(task_id)
        label = f"{task.title} ({task.weekday})" if task else task_id
        out.append(
            f"{label} from {names.get(was, 'nobody')} to {names.get(pid, pid)}"
        )
    return out


class NegotiationState:
    """Shared state threaded through the graph.

    The graph controls what runs next; this holds what everyone is arguing about.
    """

    def __init__(
        self,
        circle: Circle,
        max_rounds: int = MAX_ROUNDS,
        transport: str = "local",
        ledger: Ledger | None = None,
        precedents: list[Precedent] | None = None,
        changes: dict[str, tuple[list[str], list[str]]] | None = None,
        models: dict[str, Any] | None = None,
        starting: Allocation | None = None,
        instructions: dict[str, str] | None = None,
        locked: dict[str, str] | None = None,
    ) -> None:
        # `starting` is a plan the family already has (the family app passes its
        # current rota), used in place of the greedy opening split. `locked` is
        # work already done: it counts towards each person's load and never moves.
        self.starting = starting
        self.locked = dict(locked or {})
        # Moves a round proposed that made the split worse, so they are not offered again.
        self.rejected_moves: list[str] = []
        self.instructions = instructions or {}
        # `full_circle` is every task this period. `circle` becomes what the
        # family actually splits, once recall has taken out what precedents cover.
        self.full_circle = circle
        self.circle = circle
        self.max_rounds = max_rounds
        self.transport = transport
        self.round_number = 0
        self.tasks_by_id = {t.id: t for t in circle.tasks}
        self.ledger = ledger or Ledger(circle.period)
        self.precedents = list(precedents or [])
        self.changes = changes or {}
        models = models or {}
        self.covered: dict[str, str] = {}
        self.applied: list[str] = []
        self.settled_by_precedent: str | None = None
        # What the current round proposed, before the hill climb judged it.
        self.round_tried: FairnessReport | None = None
        self.round_moves: list[str] = []
        self.round_kept = True

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

        # The envelope judges each action against the rota as it stands at that
        # moment: the best legal split found so far.
        self.authority = AuthorityGuard(
            ledger=self.ledger,
            context=self.envelope_context,
            on_escalation=self.escalations.append,
            precedents=self.precedents,
            echo=True,
        )
        self.convener = build_convener_agent(
            hooks=[self.authority], model=models.get("convener")
        )

        # Over A2A each principal already runs in its own process, with its own
        # privacy guard and its own private ledger, so no local agents are built
        # here. That is the point: the Convener can only reach them across a
        # boundary it does not control.
        if transport == "a2a":
            from shoulder.a2a.client import A2ATransport, reset_wire_log

            reset_wire_log()
            self.principal_agents = {}
            self.a2a = A2ATransport([p.id for p in circle.principals])
        else:
            self.a2a = None
            self.principal_agents = {
                p.id: build_principal_agent(
                    p,
                    ledger=self.ledger,
                    model=models.get(p.id),
                    echo=True,
                    instructions=self.instructions.get(p.id, ""),
                    recipient=circle.care_recipient,
                )
                for p in circle.principals
            }

    def envelope_context(self) -> EnvelopeContext | None:
        allocation = self.best_allocation or self.allocation
        report = self.best_report or self.report
        if allocation is None or report is None:
            return None
        return EnvelopeContext(
            circle=self.circle,
            allocation=allocation,
            report=report,
            round_number=self.round_number,
        )

    def consider(self, allocation: Allocation, report: FairnessReport) -> None:
        """Keep this split if it is the best one we have found (see `_rank`)."""
        if self.best_report is None or _rank(report) < _rank(self.best_report):
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
            covered=self.covered,
            applied_precedents=self.applied,
            settled_by_precedent=self.settled_by_precedent,
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


class RecallNode(_Node):
    """Start from everything the family has already said. Deterministic.

    Two kinds of memory come in here. What each person changed since last period
    (their own session), and what the family decided last time (precedents).
    Precedents that shape the load are applied before anyone negotiates, each
    one checked against the authority envelope and written to the ledger with
    the decision it rests on.
    """

    def run(self) -> None:
        s = self.state
        for pid, (public, private) in s.changes.items():
            for change in public:
                print(f"  [recall]   {change}")
                s.ledger.record(
                    "noted_change",
                    f"Noted a change since last month: {change}",
                    actor=f"agent:{pid}",
                    justification=(
                        "People's limits change. Nobody should have to start again "
                        "each month to say so."
                    ),
                )
            for change in private:
                s.ledger.record(
                    "noted_change",
                    change,
                    actor=f"agent:{pid}",
                    scope=private_scope(pid),
                    justification="This stays with your agent. Your family sees only the effect.",
                )

        if not s.precedents:
            return
        reduced, covered = recall(s.full_circle, s.precedents)
        if not covered:
            return

        report = build_fairness_report(s.full_circle, seed_allocation(s.full_circle))
        ctx = EnvelopeContext(s.full_circle, seed_allocation(s.full_circle), report, 0)
        by_precedent: dict[str, list[str]] = {}
        for task_id, p in covered.items():
            by_precedent.setdefault(p.id, []).append(task_id)
        for pid, task_ids in by_precedent.items():
            p = next(x for x in s.precedents if x.id == pid)
            tool = "arrange_paid_help" if p.kind == "paid_help" else "drop_task"
            args = {"task_ids": task_ids} if tool == "arrange_paid_help" else {"task_id": task_ids[0]}
            decision = decide(tool, args, ctx, s.precedents)
            if not decision.allowed:
                continue
            summary = describe_done(tool, {"task_ids": task_ids}, ctx)
            print(f"  [recall]   {summary} ({p.provenance()})")
            s.ledger.record(
                "applied_precedent",
                summary,
                justification=decision.why,
                details={"precedent_id": p.id, "task_ids": task_ids},
            )
            for task_id in task_ids:
                s.covered[task_id] = p.id
            s.applied.append(p.id)

        s.circle = reduced.model_copy(
            update={"tasks": [t for t in s.full_circle.tasks if t.id not in s.covered]}
        )
        s.tasks_by_id = {t.id: t for t in s.circle.tasks}
        set_active_circle(s.circle)


class ProposeNode(_Node):
    """Round one seeds deterministically; later rounds are the Convener revising."""

    def run(self) -> None:
        s = self.state
        s.round_number += 1
        s.round_tried, s.round_moves, s.round_kept = None, [], True

        if s.round_number == 1 and s.starting is not None:
            # Start from the family's own plan, with anything no longer legal put back.
            known = {t.id for t in s.circle.tasks}
            current = s.starting.model_copy(
                update={
                    "assignments": {t: p for t, p in s.starting.assignments.items() if t in known},
                    "round_number": 1,
                }
            )
            s.allocation, _corrections = repair_allocation(s.circle, current)
            s.allocation.assignments.update(s.locked)
            s.allocation.round_number = 1
            s.attempts.append("Started from the plan the family already has.")
            open_tasks = [t for t in s.circle.tasks if t.id not in s.locked]
            held = sum(1 for t in open_tasks if t.id in s.allocation.assignments)
            s.ledger.record(
                "seeded_rota",
                f"Started from the family's current plan: {held} of "
                f"{len(open_tasks)} open tasks already have someone.",
                justification=(
                    "The negotiation improves the plan the family is living with. Nothing "
                    "moves until each person's agent has seen their share."
                ),
                round_number=1,
            )
        elif s.round_number == 1:
            s.allocation = seed_allocation(s.circle)
            s.attempts.append(
                "Built an opening split from everyone's stated availability, "
                "balanced against declared capacity."
            )
            s.ledger.record(
                "seeded_rota",
                f"Drew up an opening split of {len(s.allocation.assignments)} of "
                f"{len(s.circle.tasks)} tasks from everyone's stated availability.",
                justification=(
                    "A first draft is routine. It respects every stated limit, and "
                    "nothing stands until each person's agent has seen their share."
                ),
                round_number=1,
            )
        else:
            assert s.allocation is not None and s.report is not None
            previous = s.allocation
            proposed = revise_allocation(
                s.convener,
                s.circle,
                s.allocation,
                s.report,
                s.critiques,
                s.round_number,
                tried=s.rejected_moves,
                locked=set(s.locked),
            )
            # Finished work is not up for negotiation.
            proposed.assignments.update(s.locked)
            moves = _moves(s.circle, previous, proposed)
            s.ledger.record(
                "proposed_moves",
                f"Suggested {len(moves)} move{'s' if len(moves) != 1 else ''}: "
                f"{'; '.join(moves)}."
                if moves
                else "Looked for a move that would even out the load and found none "
                "worth making.",
                justification=(
                    "Suggesting moves inside everyone's stated limits is routine. "
                    "Each one is checked against those limits and by the fairness "
                    "engine before it is kept."
                ),
                round_number=s.round_number,
                details={"rationale": proposed.rationale, "moves": moves},
            )
            # The model proposes. This decides what is allowed to stand.
            s.allocation, corrections = repair_allocation(s.circle, proposed)
            s.allocation.assignments.update(s.locked)
            s.allocation.round_number = s.round_number
            s.attempts.append(
                f"Round {s.round_number}: {s.allocation.rationale.strip()}"
            )
            for c in corrections:
                print(f"  [repair]   {c}")
                s.ledger.record(
                    "reversed_move",
                    f"Put back a suggested move that broke a stated limit: {c}.",
                    justification=(
                        "A rota that breaks someone's stated limit never reaches "
                        "the family. This check is a rule, not a judgement."
                    ),
                    round_number=s.round_number,
                )

            # Hill climb. A round is allowed to explore a worse split, but the
            # working rota does not keep it. Without this the negotiation can
            # wander away from a good answer it already had.
            trial = build_fairness_report(s.circle, s.allocation)
            s.round_tried, s.round_moves = trial, moves
            best = s.best_report
            if best is not None and _rank(trial) > _rank(best):
                s.round_kept = False
                s.rejected_moves.extend(moves)
                print(f"  [reject]   round {s.round_number} moves made it worse "
                      f"({trial.max_deviation} vs {best.max_deviation}), "
                      f"keeping the better split")
                s.attempts.append(
                    f"Round {s.round_number}: those moves made the split less "
                    f"even, so they were not kept."
                )
                worse = (
                    "left more of the care uncovered"
                    if len(trial.unassigned_tasks) > len(best.unassigned_tasks)
                    else f"made the load less even ({_pct(trial.max_deviation)} "
                    f"against {_pct(best.max_deviation)})"
                )
                s.ledger.record(
                    "kept_better_split",
                    f"Tried those moves and they {worse}, so kept the earlier split.",
                    justification="The working rota only ever gets fairer.",
                    round_number=s.round_number,
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
            if s.a2a is not None:
                prompt = build_critique_prompt(
                    principal, s.allocation, s.tasks_by_id, brief, s.round_number
                )
                critique = s.a2a.critique(principal, prompt, s.round_number)
            else:
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
            said = f' "{critique.message}"' if critique.message else ""
            s.ledger.record(
                "asked_for_view",
                f"Asked {principal.name}'s agent whether this share works: "
                f"{_VERDICT_WORDS[critique.verdict]}.{said}",
                actor=f"agent:{principal.id}",
                justification=(
                    "Nothing stands until the person it lands on has had their say, "
                    "through their own agent."
                ),
                round_number=s.round_number,
                details={
                    "principal_id": principal.id,
                    "verdict": critique.verdict,
                    "reason_class": critique.reason_class,
                    "contested_task_ids": critique.contested_task_ids,
                },
            )


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
                tried=s.round_tried,
                moves=s.round_moves,
                kept=s.round_kept,
            )
        )

        s.consider(s.allocation, s.report)

        vetoed = any(c.verdict == "veto" for c in s.critiques)
        s.settled = s.report.settled and not vetoed
        s.exhausted = (not s.settled) and s.round_number >= s.max_rounds

        # Out of rounds, but the family has said before that a split this even
        # may stand. Only after every round was tried, only with every stated
        # limit intact and all the care covered, and only if nobody objects now.
        best = s.best_report
        if s.exhausted and not vetoed and best is not None and _feasible(best):
            accepted = accepting(s.precedents, best.max_deviation)
            if accepted is not None:
                s.settled, s.exhausted = True, False
                s.settled_by_precedent = accepted.id
                s.applied.append(accepted.id)
                print(f"  [recall]   within what the family accepted "
                      f"({accepted.provenance()}), publishing instead of asking")
                s.ledger.record(
                    "applied_precedent",
                    f"Published the fairest split found without asking again. The "
                    f"spread is {_pct(best.max_deviation)}, within what the family "
                    f"already accepted.",
                    justification=f"{accepted.provenance()}: {accepted.text}",
                    round_number=s.round_number,
                    details={"precedent_id": accepted.id},
                )

        print(f"  [evaluate] proportional={s.report.proportional} "
              f"envy_free={s.report.envy_free} "
              f"violations={len(s.report.hard_violations)} "
              f"unassigned={len(s.report.unassigned_tasks)} "
              f"deviation={s.report.max_deviation}")
        s.ledger.record(
            "measured_fairness",
            f"Measured round {s.round_number}: {s.report.headline()} The spread "
            f"is {_pct(s.report.max_deviation)} against a limit of "
            f"{_pct(FAIRNESS_TOLERANCE)}.",
            justification=(
                "Fairness is computed by a fixed rule, never estimated by a model. "
                "Same inputs, same answer, every time."
            ),
            round_number=s.round_number,
            details={
                "max_deviation": s.report.max_deviation,
                "proportional": s.report.proportional,
                "envy_free": s.report.envy_free,
            },
        )


class SettleNode(_Node):
    def run(self) -> None:
        s = self.state
        if s.settled_by_precedent:
            print("  [settle]   rota published under a past decision")
            return  # the precedent entry above already says what was published and why
        print("  [settle]   invariant holds, rota published")
        s.ledger.record(
            "published_rota",
            f"Published the rota for {s.circle.period}. Every share is within the "
            f"fairness limit.",
            justification="A fair rota inside everyone's limits is routine to publish.",
            round_number=s.round_number,
        )


class EscalateNode(_Node):
    """Out of rounds. Hand it back to the humans, with the work shown."""

    def run(self) -> None:
        s = self.state
        # Escalate about the rota the family will actually be given, which is the
        # best legal one found, not whatever the last round happened to try.
        allocation = s.best_allocation or s.allocation
        report = s.best_report or s.report
        assert allocation is not None and report is not None

        # One chance to act beyond moving tasks. Anything it reaches for passes
        # through the authority envelope, and whatever is not its to do comes
        # back as a card of its own, appended to s.escalations by the hook.
        queue_position = len(s.escalations)
        cards_before = len(s.authority.cards)
        remedy = attempt_remedies(s.convener, s.circle, allocation, report)
        if remedy:
            print(f"  [remedy]   {remedy}")
        for raised in s.authority.cards[cards_before:]:
            s.attempts.append(
                "Stopped short of an action that is the family's call, and raised "
                f"it as its own decision: {raised.headline}"
            )

        card = write_escalation(
            s.convener, s.circle, allocation, report, s.critiques, s.attempts
        )
        # The fairness question is the one the family came for, so it leads the
        # queue; anything the envelope raised follows it.
        s.escalations.insert(queue_position, card)
        s.ledger.record(
            "raised_escalation",
            f"Handed a decision to the family: {card.headline}",
            justification=(
                "When a fair split cannot be reached inside everyone's limits, the "
                "choice belongs to the people it affects."
            ),
            round_number=s.round_number,
            details={"escalation_id": card.id, "kind": card.kind},
        )
        print(f"  [escalate] {card.kind}: {card.headline}")


def build_negotiation_graph(state: NegotiationState):
    """Wire the graph, including the revision cycle."""
    builder = GraphBuilder()

    builder.add_node(RecallNode(state, "recall"), "recall")
    builder.add_node(ProposeNode(state, "propose"), "propose")
    builder.add_node(CritiqueNode(state, "critique"), "critique")
    builder.add_node(EvaluateNode(state, "evaluate"), "evaluate")
    builder.add_node(SettleNode(state, "settle"), "settle")
    builder.add_node(EscalateNode(state, "escalate"), "escalate")

    builder.add_edge("recall", "propose")
    builder.add_edge("propose", "critique")
    builder.add_edge("critique", "evaluate")

    # Conditions close over the shared state rather than reading GraphState,
    # because what decides the next step is the fairness verdict, not the graph's
    # own bookkeeping.
    builder.add_edge("evaluate", "propose", condition=lambda _s: not state.settled and not state.exhausted)
    builder.add_edge("evaluate", "settle", condition=lambda _s: state.settled)
    builder.add_edge("evaluate", "escalate", condition=lambda _s: state.exhausted)

    builder.set_entry_point("recall")
    builder.reset_on_revisit(True)
    builder.set_max_node_executions(4 * MAX_ROUNDS + 7)
    builder.set_graph_id("shoulder-negotiation")
    return builder.build()


def negotiate(
    circle: Circle,
    max_rounds: int = MAX_ROUNDS,
    transport: str = "local",
    ledger: Ledger | None = None,
    precedents: list[Precedent] | None = None,
    changes: dict[str, tuple[list[str], list[str]]] | None = None,
    models: dict[str, Any] | None = None,
    starting: Allocation | None = None,
    instructions: dict[str, str] | None = None,
    locked: dict[str, str] | None = None,
) -> NegotiationOutcome:
    """Run one full negotiation for a circle and return everything it produced.

    Pass a `ledger` to keep the record of what was done unattended; the CLI
    persists it and writes the family's view to fixtures. `precedents` are the
    family's past decisions and `changes` what each person changed since last
    period; both are applied by the recall node. `models` replaces the Bedrock
    model for the Convener ("convener") or a principal (by id), which is how the
    offline demos and tests run the real graph with no network.
    """
    set_active_circle(circle)
    state = NegotiationState(
        circle,
        max_rounds=max_rounds,
        transport=transport,
        ledger=ledger,
        precedents=precedents,
        changes=changes,
        models=models,
        starting=starting,
        instructions=instructions,
        locked=locked,
    )
    graph = build_negotiation_graph(state)
    graph(
        f"Negotiate the care rota for {circle.care_recipient} "
        f"covering {circle.period}."
    )
    return state.outcome()
