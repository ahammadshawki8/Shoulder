"""One period of Shoulder, start to finish, with memory.

This is what the weekly schedule will run (Tier 8). It is the whole longitudinal
loop in one place:

  1. load what the family decided before (precedents)
  2. load each person's profile from last period, and note what changed
  3. negotiate, with both applied by the recall node
  4. record the rota and queue any new escalations for the family

Between two calls, the family answers the queue (`python -m shoulder.decide`, or
the escalation inbox). Those answers become the precedents step 1 loads next
time. That is the whole of "it learns": nothing is learned that a person did not
decide.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from shoulder.agents.principal import positions_payload
from shoulder.config import FIXTURES_DIR, STATE_DIR
from shoulder.ledger import Ledger
from shoulder.models.core import Circle, NegotiationOutcome
from shoulder.seed.demo_circle import PERIOD, build_circle
from shoulder.store.family import FamilyStore
from shoulder.store.principal import PrincipalStore, drift


@dataclass
class PeriodRun:
    circle: Circle
    outcome: NegotiationOutcome
    ledger: Ledger
    changes: dict[str, tuple[list[str], list[str]]]


def run_period(
    period: str = PERIOD,
    *,
    circle: Circle | None = None,
    state_dir: str = STATE_DIR,
    models: dict[str, Any] | None = None,
) -> PeriodRun:
    from shoulder.graph.negotiation import negotiate

    circle = circle or build_circle(period)
    family = FamilyStore(state_dir)

    changes: dict[str, tuple[list[str], list[str]]] = {}
    for principal in circle.principals:
        store = PrincipalStore(principal.id, state_dir)
        previous = store.before(period)
        if previous is not None:
            public, private = drift(previous, principal)
            if public or private:
                changes[principal.id] = (public, private)
        store.save(period, principal)

    ledger = Ledger(period, persist=True, state_dir=state_dir)
    outcome = negotiate(
        circle,
        ledger=ledger,
        precedents=family.precedents(),
        changes=changes,
        models=models,
    )
    family.record_outcome(circle, outcome)
    return PeriodRun(circle, outcome, ledger, changes)


def fixtures_dir_for(period: str, root: str = FIXTURES_DIR) -> str:
    """The seed period writes to the fixtures root (the UI's default month);
    any other period gets its own folder."""
    return root if period == PERIOD else os.path.join(root, period)


def _write(path: str, payload: Any) -> str:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    return path


def write_fixtures(run: PeriodRun, root: str = FIXTURES_DIR) -> list[str]:
    folder = fixtures_dir_for(run.circle.period, root)
    outcome = run.outcome
    written = [
        _write(f"{folder}/circle.json", run.circle.model_dump(mode="json")),
        _write(f"{folder}/outcome.json", outcome.model_dump(mode="json")),
        _write(f"{folder}/positions.json", json.loads(positions_payload(run.circle.principals))),
        # The family's view only. Private-scope entries stay with each person's
        # agent (in .shoulder/private/) and are never written here.
        _write(f"{folder}/ledger.json", run.ledger.dump()),
    ]
    if outcome.final_report:
        written.append(_write(
            f"{folder}/fairness_report.json", outcome.final_report.model_dump(mode="json")
        ))
    written.append(_write(
        f"{folder}/escalations.json", [c.model_dump(mode="json") for c in outcome.escalations]
    ))
    return written


def write_family(state_dir: str = STATE_DIR, root: str = FIXTURES_DIR) -> str:
    """History, every card and its status, resolutions and precedents."""
    return _write(f"{root}/family.json", FamilyStore(state_dir).export())
