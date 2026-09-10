"""Local persistence in SQLite.

Append-only by design. The ledger is an audit trail, and an audit trail that can
be edited after the fact is not one. Nothing here updates or deletes a row.
"""

from __future__ import annotations

import json
import os
import sqlite3

from shoulder.config import STATE_DIR
from shoulder.models.core import LedgerEntry

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ledger (
    id            TEXT PRIMARY KEY,
    seq           INTEGER NOT NULL,
    at            TEXT NOT NULL,
    period        TEXT NOT NULL,
    round_number  INTEGER,
    actor         TEXT NOT NULL,
    kind          TEXT NOT NULL,
    scope         TEXT NOT NULL,
    summary       TEXT NOT NULL,
    justification TEXT NOT NULL,
    details       TEXT NOT NULL
)
"""


class LedgerStore:
    """One SQLite file holding ledger entries for one scope."""

    def __init__(self, path: str) -> None:
        self.path = path
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with self._connect() as db:
            db.execute(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=10)

    def append(self, entry: LedgerEntry) -> None:
        with self._connect() as db:
            db.execute(
                "INSERT INTO ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    entry.id,
                    entry.seq,
                    entry.at,
                    entry.period,
                    entry.round_number,
                    entry.actor,
                    entry.kind,
                    entry.scope,
                    entry.summary,
                    entry.justification,
                    json.dumps(entry.details, ensure_ascii=False),
                ),
            )

    def load(self, period: str | None = None) -> list[LedgerEntry]:
        query = "SELECT * FROM ledger"
        args: tuple = ()
        if period is not None:
            query += " WHERE period = ?"
            args = (period,)
        query += " ORDER BY at, seq"
        with self._connect() as db:
            db.row_factory = sqlite3.Row
            rows = db.execute(query, args).fetchall()
        return [
            LedgerEntry(**{**dict(row), "details": json.loads(row["details"])})
            for row in rows
        ]


def store_path_for(scope: str, state_dir: str = STATE_DIR) -> str:
    """Where a scope's ledger lives on disk.

    The family ledger is shared. A private ledger sits in its own file under
    `private/`, standing in for the principal's own device.
    """
    if scope.startswith("private:"):
        principal_id = scope.split(":", 1)[1]
        return os.path.join(state_dir, "private", f"{principal_id}.db")
    return os.path.join(state_dir, "family.db")
