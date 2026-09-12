"""The family's session: what was agreed, what was asked, what was decided.

Persists across runs, so the next period starts from everything the family has
already told it: the rota history, every escalation card, every resolution, and
the precedents those resolutions became. Lives in the family's SQLite file next
to the family ledger. Private material never comes here.

Tier 8 swaps this for AgentCore Memory; the interface is what the rest of the
code depends on.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any

from shoulder.config import STATE_DIR
from shoulder.models.core import (
    Circle,
    EscalationCard,
    NegotiationOutcome,
    OptionEffect,
    Precedent,
    Resolution,
)
from shoulder.precedent import extract, same_rule
from shoulder.store.sqlite import store_path_for

_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS rotas (
        period TEXT PRIMARY KEY, circle_id TEXT NOT NULL, circle TEXT NOT NULL,
        outcome TEXT NOT NULL, recorded_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS escalations (
        id TEXT PRIMARY KEY, period TEXT NOT NULL, card TEXT NOT NULL,
        status TEXT NOT NULL, recorded_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS resolutions (
        escalation_id TEXT PRIMARY KEY, resolution TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS precedents (
        id TEXT PRIMARY KEY, precedent TEXT NOT NULL, active INTEGER NOT NULL)""",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class FamilyStore:
    def __init__(self, state_dir: str = STATE_DIR) -> None:
        self.path = store_path_for("family", state_dir)
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with self._connect() as db:
            for statement in _SCHEMA:
                db.execute(statement)

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    # -- rotas and escalations ----------------------------------------------

    def record_outcome(self, circle: Circle, outcome: NegotiationOutcome) -> None:
        """Keep a period's rota and queue its escalations for the family.

        Re-running a period replaces its rota and its still-open cards. A card
        someone has already answered is never overwritten.
        """
        now = _now()
        with self._connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO rotas VALUES (?, ?, ?, ?, ?)",
                (outcome.period, outcome.circle_id, circle.model_dump_json(),
                 outcome.model_dump_json(), now),
            )
            db.execute(
                "DELETE FROM escalations WHERE period = ? AND status = 'open'",
                (outcome.period,),
            )
            for card in outcome.escalations:
                db.execute(
                    "INSERT OR IGNORE INTO escalations VALUES (?, ?, ?, 'open', ?)",
                    (card.id, outcome.period, card.model_dump_json(), now),
                )

    def rota(self, period: str) -> tuple[Circle, NegotiationOutcome] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM rotas WHERE period = ?", (period,)).fetchone()
        if row is None:
            return None
        return (
            Circle.model_validate_json(row["circle"]),
            NegotiationOutcome.model_validate_json(row["outcome"]),
        )

    def periods(self) -> list[str]:
        with self._connect() as db:
            return [r["period"] for r in db.execute("SELECT period FROM rotas ORDER BY period")]

    def escalations(
        self, period: str | None = None, status: str | None = None
    ) -> list[tuple[EscalationCard, str]]:
        query, args = "SELECT * FROM escalations WHERE 1 = 1", []
        if period:
            query += " AND period = ?"
            args.append(period)
        if status:
            query += " AND status = ?"
            args.append(status)
        query += " ORDER BY period, recorded_at, rowid"
        with self._connect() as db:
            rows = db.execute(query, args).fetchall()
        return [(EscalationCard.model_validate_json(r["card"]), r["status"]) for r in rows]

    # -- decisions ----------------------------------------------------------

    def resolve(
        self,
        escalation_id: str,
        option_index: int,
        decided_by: str = "The family",
        note: str = "",
    ) -> tuple[Resolution, Precedent | None, list[str]]:
        """Record a human's answer and turn it into a precedent if it is one.

        Returns the resolution, the precedent (if any), and the ids of any other
        open cards this same decision also answered. The fairness card and the
        envelope's paid-help card can both offer "paid help for these tasks";
        choosing it on one answers both, so nobody is asked the same thing twice.
        """
        with self._connect() as db:
            row = db.execute(
                "SELECT * FROM escalations WHERE id = ?", (escalation_id,)
            ).fetchone()
        if row is None:
            raise KeyError(f"no escalation {escalation_id}")
        if row["status"] != "open":
            raise ValueError(f"{escalation_id} has already been decided")
        card = EscalationCard.model_validate_json(row["card"])
        if not 0 <= option_index < len(card.options):
            raise IndexError(f"{escalation_id} has {len(card.options)} options")

        resolution = Resolution(
            escalation_id=card.id,
            period=row["period"],
            option_index=option_index,
            option_label=card.options[option_index].label,
            decided_by=decided_by,
            decided_at=_now(),
            note=note,
        )
        stored = self.rota(row["period"])
        precedent = None
        if stored is not None:
            circle, outcome = stored
            deviation = outcome.final_report.max_deviation if outcome.final_report else None
            precedent = extract(card, resolution, circle, deviation)

        self._record(resolution)
        also: list[str] = []
        chosen = card.options[option_index].effect
        if precedent is not None and chosen is not None:
            self._keep(precedent)
            for other, _status in self.escalations(period=row["period"], status="open"):
                index = next(
                    (i for i, o in enumerate(other.options) if _same_effect(o.effect, chosen)),
                    None,
                )
                if index is None:
                    continue
                self._record(resolution.model_copy(update={
                    "escalation_id": other.id,
                    "option_index": index,
                    "option_label": other.options[index].label,
                    "note": f"Answered by the same decision on {card.id}.",
                }))
                also.append(other.id)
        return resolution, precedent, also

    def _record(self, resolution: Resolution) -> None:
        with self._connect() as db:
            db.execute(
                "INSERT INTO resolutions VALUES (?, ?)",
                (resolution.escalation_id, resolution.model_dump_json()),
            )
            db.execute(
                "UPDATE escalations SET status = 'resolved' WHERE id = ?",
                (resolution.escalation_id,),
            )

    def _keep(self, precedent: Precedent) -> None:
        """Store a precedent. One that says the same as an older one replaces it."""
        with self._connect() as db:
            for existing in self.precedents():
                if same_rule(existing, precedent):
                    db.execute("UPDATE precedents SET active = 0 WHERE id = ?", (existing.id,))
            db.execute(
                "INSERT INTO precedents VALUES (?, ?, 1)",
                (precedent.id, precedent.model_dump_json()),
            )

    def resolutions(self) -> list[Resolution]:
        with self._connect() as db:
            rows = db.execute("SELECT resolution FROM resolutions ORDER BY rowid").fetchall()
        return [Resolution.model_validate_json(r["resolution"]) for r in rows]

    def precedents(self, active_only: bool = True) -> list[Precedent]:
        query = "SELECT * FROM precedents"
        if active_only:
            query += " WHERE active = 1"
        with self._connect() as db:
            rows = db.execute(query + " ORDER BY rowid").fetchall()
        out = []
        for r in rows:
            p = Precedent.model_validate_json(r["precedent"])
            p.active = bool(r["active"])
            out.append(p)
        return out

    def retire(self, precedent_id: str) -> None:
        """The family changed its mind. The rule stops applying; its record stays."""
        with self._connect() as db:
            db.execute("UPDATE precedents SET active = 0 WHERE id = ?", (precedent_id,))

    # -- the story so far ---------------------------------------------------

    def history(self) -> list[dict[str, Any]]:
        """One line per period: the numbers the "it learns" beat is built on."""
        out = []
        for period in self.periods():
            stored = self.rota(period)
            assert stored is not None
            _circle, outcome = stored
            cards = self.escalations(period)
            out.append({
                "period": period,
                "settled": outcome.settled,
                "settled_by_precedent": outcome.settled_by_precedent,
                "max_deviation": outcome.final_report.max_deviation if outcome.final_report else None,
                "escalations": len(cards),
                "resolved": sum(1 for _c, status in cards if status == "resolved"),
                "applied_precedents": outcome.applied_precedents,
                "covered_tasks": len(outcome.covered),
            })
        return out

    def export(self) -> dict[str, Any]:
        """Everything the product surface needs, as plain JSON."""
        return {
            "history": self.history(),
            "escalations": [
                {"period": card.period, "status": status, "card": card.model_dump(mode="json")}
                for card, status in self.escalations()
            ],
            "resolutions": [r.model_dump(mode="json") for r in self.resolutions()],
            "precedents": [
                {**p.model_dump(mode="json"), "provenance": p.provenance()}
                for p in self.precedents(active_only=False)
            ],
        }


def _same_effect(a: OptionEffect | None, b: OptionEffect) -> bool:
    if a is None or a.kind != b.kind or b.kind in ("none", "accept_split"):
        return False
    return (
        sorted(a.task_ids) == sorted(b.task_ids)
        and a.action == b.action
        and a.principal_id == b.principal_id
    )


def dumps(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)
