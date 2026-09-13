"""The family's agents, working on a family in the app.

This connects the family app to the real negotiation in `shoulder.graph`:
each person's agent is a Strands agent that knows their private reasons and
their own instructions, guarded by the privacy hook, and the Convener proposes,
listens, and hands back what is not its to decide.

Two kinds of work happen here, each on its own background worker:

  negotiation   The whole open plan, renegotiated. Scheduled a short while
                after something changes (a task added for whoever has room,
                someone joining, leaving, or changing their limits), so a burst
                of edits becomes one negotiation. A family can also ask for one.
  handover      Someone asks to give a task to someone else. The receiving
                person's own agent is asked whether it works for them, knowing
                what only they know, and the task moves only if it does.

What stays deterministic, on purpose: whether a person is allowed to take a task
at all (their stated limits), and every fairness number. The agents judge
everything else. Every step they take is written to the family's activity as it
happens, and anything a privacy hook stopped goes only to the person it
protected.

SHOULDER_AGENTS=live runs Claude on Amazon Bedrock. Anything else runs the same
graph with scripted models, which is how tests and machines without AWS access
work. The budget (a cooldown per family and a daily cap) bounds what live runs
can spend.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from shoulder.api import domain
from shoulder.api.db import Database
from shoulder.ledger import FAMILY, Ledger
from shoulder.models.core import Allocation, LedgerEntry, Principal

log = logging.getLogger("shoulder.agents")

LIVE = "live"
SCRIPTED = "scripted"

# Only these detail fields reach the family's activity view. A model's own
# rationale and a refused tool's raw input stay out.
SAFE_DETAILS = ("verdict", "max_deviation", "proportional", "moves", "tool")

# One negotiation at a time across the server: the fairness tools read the
# circle being negotiated from module state.
ENGINE_LOCK = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def safe_details(details: dict[str, Any]) -> dict[str, Any]:
    return {k: details[k] for k in SAFE_DETAILS if k in details}


class AppLedger(Ledger):
    """A negotiation ledger that also hands each entry to the app as it is written."""

    def __init__(self, period: str, on_entry: Callable[[LedgerEntry], None]) -> None:
        super().__init__(period)
        self._on_entry = on_entry

    def record(self, kind, summary, **kwargs) -> LedgerEntry:  # type: ignore[override]
        entry = super().record(kind, summary, **kwargs)
        try:
            self._on_entry(entry)
        except Exception:  # the family's record must never stop a negotiation
            log.exception("Could not write an agent step to the family's activity")
        return entry


def _period(state: dict[str, Any]) -> str:
    return domain.today_of(state)[:7]


def _principal_with_secrets(member: dict[str, Any], secrets_: dict[str, dict[str, Any]]) -> Principal:
    """The whole truth about one person, for their own agent only."""
    principal = domain.to_principal(member)
    for constraint in principal.constraints:
        secret = secrets_.get(constraint.id) or {}
        if secret.get("reason"):
            constraint.reason = secret["reason"]
        if secret.get("sensitive_terms"):
            constraint.sensitive_terms = list(secret["sensitive_terms"])
    return principal


class AgentService:
    def __init__(
        self,
        db: Database,
        *,
        mode: str | None = None,
        delay_s: float | None = None,
        cooldown_s: float | None = None,
        daily_negotiations: int | None = None,
        daily_handovers: int | None = None,
        models_for: Callable[[Any], dict[str, Any]] | None = None,
    ) -> None:
        self.db = db
        self.mode = (mode or os.getenv("SHOULDER_AGENTS", SCRIPTED)).strip().lower()
        if self.mode != LIVE:
            self.mode = SCRIPTED
        self.delay_s = delay_s if delay_s is not None else _env_float("SHOULDER_AGENT_DELAY_S", 90)
        self.cooldown_s = cooldown_s if cooldown_s is not None else _env_float("SHOULDER_AGENT_COOLDOWN_S", 600)
        self.daily_negotiations = int(
            daily_negotiations if daily_negotiations is not None else _env_float("SHOULDER_AGENT_DAILY_NEGOTIATIONS", 30)
        )
        self.daily_handovers = int(
            daily_handovers if daily_handovers is not None else _env_float("SHOULDER_AGENT_DAILY_HANDOVERS", 200)
        )
        self._models_for = models_for

        self._lock = threading.Lock()
        self._status: dict[str, dict[str, Any]] = {}
        self._timers: dict[str, threading.Timer] = {}
        self._negotiations: queue.Queue = queue.Queue()
        self._handovers: queue.Queue = queue.Queue()
        self._workers: list[threading.Thread] = []
        self._busy = 0

    # -- lifecycle ------------------------------------------------------------

    def start(self) -> None:
        for name, jobs, run in (
            ("negotiations", self._negotiations, self._run_negotiation),
            ("handovers", self._handovers, self._run_handover),
        ):
            worker = threading.Thread(target=self._work, args=(jobs, run), name=f"shoulder-{name}", daemon=True)
            worker.start()
            self._workers.append(worker)

    def stop(self) -> None:
        with self._lock:
            for timer in self._timers.values():
                timer.cancel()
            self._timers.clear()
        for jobs in (self._negotiations, self._handovers):
            jobs.put(None)

    def _work(self, jobs: queue.Queue, run: Callable[..., None]) -> None:
        while True:
            job = jobs.get()
            if job is None:
                return
            with self._lock:
                self._busy += 1
            try:
                run(*job)
            except Exception:
                log.exception("An agent job failed")
            finally:
                with self._lock:
                    self._busy -= 1
                jobs.task_done()

    def wait_idle(self, timeout: float = 30.0) -> bool:
        """For tests: wait until nothing is scheduled, queued or running."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                idle = not self._timers and self._busy == 0
            if idle and self._negotiations.unfinished_tasks == 0 and self._handovers.unfinished_tasks == 0:
                return True
            time.sleep(0.05)
        return False

    def _models(self, circle) -> dict[str, Any] | None:
        if self._models_for is not None:
            return self._models_for(circle)
        if self.mode == LIVE:
            return None  # Claude on Amazon Bedrock
        from shoulder.demos.offline import offline_models

        return offline_models(circle)

    # -- what the app shows ---------------------------------------------------

    def view(self, code: str) -> dict[str, Any]:
        with self._lock:
            status = dict(self._status.get(code) or {})
        last = self.db.last_run(code, "negotiation")
        return {
            "mode": self.mode,
            "state": status.get("state", "idle"),
            "scheduled_at": status.get("scheduled_at"),
            "round": status.get("round"),
            "reason": status.get("reason"),
            "last": {
                "status": last["status"],
                "summary": last["summary"],
                "finished_at": last["finished_at"],
                "started_by": last["started_by"],
            }
            if last and last["status"] not in ("queued", "running")
            else None,
        }

    # -- negotiations -----------------------------------------------------------

    def request_negotiation(
        self, code: str, reason: str, by: str | None, *, now: bool = False, after_decision: bool = False
    ) -> None:
        """Schedule a negotiation. A request made while one is waiting joins it.

        `after_decision` is a family's answer to a card that changed the plan: the
        agents look again without waiting out the cooldown (the daily cap still holds).
        """
        last = self.db.last_run(code, "negotiation")
        cooldown_left = 0.0
        if last and last.get("started_at") and not after_decision:
            started = datetime.fromisoformat(last["started_at"])
            cooldown_left = max(0.0, self.cooldown_s - (_now() - started).total_seconds())

        if now and cooldown_left > 0:
            minutes = max(1, round(cooldown_left / 60))
            raise domain.DomainError(
                f"The agents negotiated a few minutes ago. You can ask again in about {minutes} minute"
                f"{'s' if minutes != 1 else ''}.",
                429,
            )

        with self._lock:
            status = self._status.get(code, {})
            if status.get("state") in ("queued", "running"):
                # Whatever changed will be picked up by one more pass afterwards.
                status["again"] = {"reason": reason, "by": by}
                return
            delay = 0.0 if now else max(self.delay_s, cooldown_left)
            if code in self._timers:
                if not now:
                    return  # already scheduled; this change joins it
                self._timers.pop(code).cancel()
            at = _now() + timedelta(seconds=delay)
            self._status[code] = {"state": "scheduled", "scheduled_at": at.isoformat(), "reason": reason, "by": by}
            timer = threading.Timer(delay, self._enqueue_negotiation, args=(code,))
            timer.daemon = True
            self._timers[code] = timer
            timer.start()

    def _enqueue_negotiation(self, code: str) -> None:
        with self._lock:
            status = self._status.get(code) or {}
            status["state"] = "queued"
            reason, by = status.get("reason", ""), status.get("by")
        run_id = f"run-{secrets.token_hex(5)}"
        self.db.create_run(run_id, code, "negotiation", reason, by, self.mode)
        self._negotiations.put((code, run_id, reason, by))
        with self._lock:
            # Only now, so there is never a moment when it is neither timed nor queued.
            self._timers.pop(code, None)

    def _finish_status(self, code: str) -> None:
        with self._lock:
            status = self._status.pop(code, {})
        again = status.get("again")
        if again:
            try:
                self.request_negotiation(code, again["reason"], again["by"])
            except domain.DomainError:
                pass

    def _write_step(self, code: str, generation: Any, run_id: str, entry: LedgerEntry) -> None:
        if entry.round_number:
            with self._lock:
                if code in self._status:
                    self._status[code]["round"] = entry.round_number

        if entry.scope == FAMILY:
            who = entry.actor.split(":", 1)[1] if entry.actor.startswith("agent:") else "convener"
            with self.db.write() as conn:
                state = self.db.load_state(conn, code)
                if state is None or state.get("generation") != generation:
                    return
                state["ledger"].insert(
                    0,
                    {
                        "id": f"led-{entry.id}",
                        "at": entry.at,
                        "summary": entry.summary,
                        "justification": entry.justification,
                        "who": who,
                        "kind": entry.kind,
                        "round": entry.round_number,
                        "details": safe_details(entry.details),
                        "run": run_id,
                    },
                )
                del state["ledger"][500:]
                self.db.save_state(conn, code, state)
            return

        # A private entry: what a privacy hook stopped, for the person it protected.
        if entry.kind == "withheld_private_detail" and entry.scope.startswith("private:"):
            member_id = entry.scope.split(":", 1)[1]
            details = entry.details
            with self.db.write() as conn:
                if self.db.load_state(conn, code) is None or not self.db.member_ids(conn, code).count(member_id):
                    return
                self.db.put_catch(
                    conn,
                    code,
                    member_id,
                    f"catch-{entry.id}",
                    entry.at,
                    {
                        "asked": "",
                        "draft": _message_of(details.get("draft", "")),
                        "sent": _message_of(details.get("sent", "")),
                        "matched": list(details.get("matched") or []),
                        "live": self.mode == LIVE,
                    },
                )

    def _snapshot(self, code: str) -> tuple[dict[str, Any], dict[str, Principal], dict[str, str]] | None:
        state = self.db.read_state(code)
        if state is None or not state["members"]:
            return None
        rows = self.db.secret_rows(code)
        principals = {m["id"]: _principal_with_secrets(m, rows.get(m["id"], {})) for m in state["members"]}
        instructions = {m["id"]: self.db.instructions_for(code, m["id"]) for m in state["members"]}
        return state, principals, instructions

    def _run_negotiation(self, code: str, run_id: str, reason: str, by: str | None) -> None:
        from shoulder.graph.negotiation import negotiate
        from shoulder.models.core import Circle

        with self._lock:
            if code in self._status:
                self._status[code]["state"] = "running"
                self._status[code]["round"] = None

        try:
            if self.db.runs_since("negotiation", _now() - timedelta(days=1)) > self.daily_negotiations:
                self.db.mark_run(run_id, "skipped", "The agents reached today's negotiation budget.")
                self._note(code, "The agents have done all the negotiating they can today",
                           "A daily budget keeps what the agents cost in check. The plan stays as it is until tomorrow.")
                return

            snap = self._snapshot(code)
            if snap is None:
                self.db.mark_run(run_id, "skipped", "Nobody in the family yet.")
                return
            state, principals, instructions = snap
            generation = state.get("generation")
            done = set(state["completed"])
            in_play = domain.in_play(state)
            tasks = [
                t for t in state["tasks"]
                if t["id"] not in state["covered"] and (t["id"] not in done or t["id"] in in_play)
            ]
            open_ids = {t["id"] for t in tasks if t["id"] not in done}
            if not open_ids:
                self.db.mark_run(run_id, "skipped", "Nothing left to negotiate this month.")
                return

            self.db.mark_run(run_id, "running")
            circle = Circle(
                id=code,
                care_recipient=state["recipient"]["name"],
                period=_period(state),
                principals=list(principals.values()),
                tasks=[domain.to_care_task(t) for t in tasks],
            )
            starting = {t: p for t, p in in_play.items() if t in open_ids and p in principals}
            locked = {t: p for t, p in in_play.items() if t in done and p in principals}
            opened_by = domain.short_name(state, by) if by else "Shoulder"
            self._note(
                code,
                f"The agents started negotiating the plan ({reason})" if reason else "The agents started negotiating the plan",
                f"Asked by {opened_by}. Each person's agent reads their own limits, reasons and instructions; "
                "the family only ever sees positions.",
                who=by,
                run=run_id,
                generation=generation,
            )

            ledger = AppLedger(circle.period, lambda e: self._write_step(code, generation, run_id, e))
            with ENGINE_LOCK:
                outcome = negotiate(
                    circle,
                    ledger=ledger,
                    models=self._models(circle),
                    starting=Allocation(period=circle.period, assignments={**starting, **locked}),
                    instructions=instructions,
                    locked=locked,
                )

            summary = self._apply(code, run_id, generation, state, outcome, open_ids)
            self.db.mark_run(run_id, "done", summary)
        except Exception as error:
            log.exception("Negotiation failed for %s", code)
            self.db.mark_run(run_id, "failed", "The agents could not finish this time.")
            self._note(code, "The agents could not finish negotiating this time",
                       "Nothing was changed. " + _plain_error(error), run=run_id)
        finally:
            self._finish_status(code)

    def _apply(self, code, run_id, generation, snapshot, outcome, open_ids) -> str:
        final = (outcome.final_allocation.assignments if outcome.final_allocation else {})
        with self.db.write() as conn:
            state = self.db.load_state(conn, code)
            if state is None or state.get("generation") != generation:
                return "The family changed underneath the negotiation, so nothing was applied."
            before = dict(snapshot["assignments"])
            moved: list[str] = []
            for task_id, pid in final.items():
                if task_id not in open_ids or task_id in state["completed"] or task_id in state["covered"]:
                    continue
                task = next((t for t in state["tasks"] if t["id"] == task_id), None)
                if task is None or state["assignments"].get(task_id) != before.get(task_id):
                    continue  # someone changed this by hand while the agents talked: theirs stands
                if state["assignments"].get(task_id) == pid or domain.can_take(state, pid, task) is not None:
                    continue
                state["assignments"][task_id] = pid
                who = domain.short_name(state, pid)
                state["why"][task_id] = (
                    f"The agents agreed {who} should take this, after hearing from everyone's agent."
                )
                moved.append(f"{task['title']} to {who}")

            # This negotiation is now the family's current question, if it has one.
            for card in state["escalations"]:
                if card.get("status", "open") == "open":
                    card["status"] = "superseded"
            # What the family already decided is not asked again: a split they accepted
            # (unless it has since widened or left care uncovered), and an action they declined.
            _circle, _allocation, report = domain.fairness(state)
            accepted = state.get("accepted_spread")
            within_accepted = (
                accepted is not None
                and report.max_deviation <= accepted + 1e-9
                and not domain.unassigned(state)
            )
            declined = set(state.get("declined_actions") or [])
            asked_cards = []
            for card in outcome.escalations:
                raw = card.model_dump(mode="json")
                if raw["kind"] == "fairness_breach" and within_accepted:
                    continue
                actions = {(o.get("effect") or {}).get("action") for o in raw.get("options", [])}
                if raw["kind"] == "authority_exceeded" and actions & declined:
                    continue
                asked_cards.append(raw)
            for index, raw in enumerate(asked_cards):
                raw.update({"id": f"{run_id}-{index + 1}", "status": "open", "source": "agents"})
                state["escalations"].append(raw)

            view = domain.fairness_view(state)
            asked = len(asked_cards)
            if outcome.settled:
                headline = "The agents settled the plan"
            elif asked:
                headline = f"The agents need the family for {asked} decision{'s' if asked != 1 else ''}"
            else:
                headline = "The agents finished negotiating"
            detail = (
                f"Moved {len(moved)} task{'s' if len(moved) != 1 else ''}: {'; '.join(moved)}."
                if moved
                else "No task needed to move."
            )
            summary = f"{headline}. {detail} The split is now {view['spread_pct']}% apart."
            domain.add_ledger(state, summary, "Every move was checked against everyone's limits before it stood.",
                              None, kind="took_action")
            state["ledger"][0]["run"] = run_id
            self.db.save_state(conn, code, state)
        return summary

    def _note(self, code: str, summary: str, why: str, *, who: str | None = None, run: str | None = None,
              generation: Any = ...) -> None:
        with self.db.write() as conn:
            state = self.db.load_state(conn, code)
            if state is None or (generation is not ... and state.get("generation") != generation):
                return
            domain.add_ledger(state, summary, why, who, kind="took_action")
            if run:
                state["ledger"][0]["run"] = run
            self.db.save_state(conn, code, state)

    # -- handovers --------------------------------------------------------------

    def request_handover(self, code: str, task_id: str, to_id: str, by: str) -> bool:
        """Queue a handover for the receiving agent to judge. False when the budget is spent."""
        if self.db.runs_since("handover", _now() - timedelta(days=1)) >= self.daily_handovers:
            return False
        run_id = f"hand-{secrets.token_hex(5)}"
        self.db.create_run(run_id, code, "handover", f"{task_id} to {to_id}", by, self.mode)
        self._handovers.put((code, run_id, task_id, to_id, by))
        return True

    def _run_handover(self, code: str, run_id: str, task_id: str, to_id: str, by: str) -> None:
        from shoulder.agents.convener import fairness_brief
        from shoulder.agents.principal import build_principal_agent, critique_allocation
        from shoulder.models.core import Circle
        from shoulder.tools.fairness import build_fairness_report

        self.db.mark_run(run_id, "running")
        try:
            snap = self._snapshot(code)
            if snap is None:
                self.db.mark_run(run_id, "skipped")
                return
            state, principals, instructions = snap
            generation = state.get("generation")
            task = next((t for t in state["tasks"] if t["id"] == task_id), None)
            principal = principals.get(to_id)
            if task is None or principal is None:
                self._clear_pending(code, task_id, "That handover no longer applies.", by)
                self.db.mark_run(run_id, "skipped")
                return

            tasks = [t for t in state["tasks"] if t["id"] not in state["covered"]]
            circle = Circle(
                id=code,
                care_recipient=state["recipient"]["name"],
                period=_period(state),
                principals=list(principals.values()),
                tasks=[domain.to_care_task(t) for t in tasks],
            )
            proposed = {**domain.in_play(state), task_id: to_id}
            allocation = Allocation(period=circle.period, assignments=proposed)
            report = build_fairness_report(circle, allocation)
            ledger = AppLedger(circle.period, lambda e: self._write_step(code, generation, run_id, e))
            models = self._models(circle) or {}
            agent = build_principal_agent(
                principal,
                ledger=ledger,
                model=models.get(to_id),
                instructions=instructions.get(to_id, ""),
                recipient=circle.care_recipient,
            )
            critique = critique_allocation(
                agent, principal, allocation, {t.id: t for t in circle.tasks}, fairness_brief(report), 1
            )
            agreed = critique.verdict == "accept" or (
                critique.verdict == "counter" and task_id not in (critique.contested_task_ids or [])
                and critique.message != "No response from this agent in time for this round."
            )
            summary = self._settle_handover(code, run_id, generation, task_id, to_id, by, agreed, critique)
            self.db.mark_run(run_id, "done", summary)
        except Exception as error:
            log.exception("Handover failed for %s", code)
            self._clear_pending(code, task_id, "The handover could not be asked about this time. " + _plain_error(error), by)
            self.db.mark_run(run_id, "failed")

    def _settle_handover(self, code, run_id, generation, task_id, to_id, by, agreed, critique) -> str:
        with self.db.write() as conn:
            state = self.db.load_state(conn, code)
            if state is None or state.get("generation") != generation:
                return "The family changed, so the handover was dropped."
            pending = (state.get("pending_handovers") or {}).pop(task_id, None)
            task = next((t for t in state["tasks"] if t["id"] == task_id), None)
            to_name, by_name = domain.short_name(state, to_id), domain.short_name(state, by)
            said = f' "{critique.message}"' if critique.message else ""
            if task is None or pending is None or state["assignments"].get(task_id) != pending.get("from"):
                summary = f"{task['title'] if task else 'A task'} had already changed hands, so the handover was dropped."
            elif not agreed:
                summary = f"{to_name}'s agent said {task['title']} does not work for {to_name} right now.{said}"
            elif domain.can_take(state, to_id, task) is not None:
                summary = f"{task['title']} can no longer go to {to_name}: it is outside their stated limits."
            else:
                state["covered"].pop(task_id, None)
                state["assignments"][task_id] = to_id
                state["why"][task_id] = f"{by_name} asked to hand this over, and {to_name}'s agent agreed."
                summary = f"{to_name}'s agent agreed to take {task['title']} from {by_name}.{said}"
            state["ledger"].insert(
                0,
                {
                    "id": f"led-{secrets.token_hex(6)}",
                    "at": domain.now_iso(),
                    "summary": summary,
                    "justification": "Work only moves to someone once their own agent has had its say.",
                    "who": to_id,
                    "kind": "asked_for_view",
                    "round": None,
                    "details": {"verdict": critique.verdict},
                    "run": run_id,
                },
            )
            self.db.save_state(conn, code, state)
        return summary

    def _clear_pending(self, code: str, task_id: str, summary: str, by: str | None) -> None:
        with self.db.write() as conn:
            state = self.db.load_state(conn, code)
            if state is None:
                return
            (state.get("pending_handovers") or {}).pop(task_id, None)
            domain.add_ledger(state, summary, "Nothing was changed.", by)
            self.db.save_state(conn, code, state)


def _message_of(text: str) -> str:
    """A structured critique arrives as JSON; the family-facing part is its message."""
    try:
        value = json.loads(text)
    except (TypeError, ValueError):
        return text
    if isinstance(value, dict) and "message" in value:
        return str(value.get("message") or "")
    return text


def _plain_error(error: Exception) -> str:
    name = type(error).__name__
    if "Credential" in name or "AccessDenied" in str(error) or "Unrecognized" in str(error):
        return "The agents could not reach the model service."
    return "Something went wrong while the agents were talking."
