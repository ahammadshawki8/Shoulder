"""SQLite storage for the family app.

Three decisions shape this file, each so that one mistake elsewhere cannot leak
something private or let one person act as another.

  Private reasons live in their own table. The family document never contains
  a reason, so nothing that reads the family can hand one out by accident. They
  are joined back in for their owner only, in `projection.py`.

  A session token is stored as its SHA-256 hash. A copy of this database file
  cannot be replayed as anyone's logged-in session.

  Every write runs inside BEGIN IMMEDIATE. Two siblings changing the plan at the
  same moment are serialised, so neither silently overwrites the other.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

DEFAULT_DB = os.getenv("SHOULDER_DB", ".shoulder/shoulder.db")
SESSION_DAYS = 30

SCHEMA = """
CREATE TABLE IF NOT EXISTS families (
    code        TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    state       TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS members (
    family_code TEXT NOT NULL REFERENCES families(code) ON DELETE CASCADE,
    member_id   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (family_code, member_id)
);

CREATE TABLE IF NOT EXISTS member_secrets (
    family_code     TEXT NOT NULL,
    member_id       TEXT NOT NULL,
    constraint_id   TEXT NOT NULL,
    reason          TEXT NOT NULL DEFAULT '',
    sensitive_terms TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (family_code, member_id, constraint_id),
    FOREIGN KEY (family_code, member_id)
        REFERENCES members(family_code, member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS privacy_catches (
    family_code TEXT NOT NULL,
    member_id   TEXT NOT NULL,
    catch_id    TEXT NOT NULL,
    at          TEXT NOT NULL,
    body        TEXT NOT NULL,
    PRIMARY KEY (family_code, member_id, catch_id),
    FOREIGN KEY (family_code, member_id)
        REFERENCES members(family_code, member_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    family_code TEXT NOT NULL,
    member_id   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    FOREIGN KEY (family_code, member_id)
        REFERENCES members(family_code, member_id) ON DELETE CASCADE
);
"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class Database:
    def __init__(self, path: str = DEFAULT_DB) -> None:
        self.path = path
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._shared: sqlite3.Connection | None = None
        if path == ":memory:":
            # One connection for the life of the process, or every connect()
            # would open a fresh empty database.
            self._shared = self._open()
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    def _open(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = self._shared or self._open()
        try:
            yield conn
        finally:
            if self._shared is None:
                conn.close()

    @contextmanager
    def write(self) -> Iterator[sqlite3.Connection]:
        """One serialised transaction. Commits on success, rolls back on error."""
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise

    # -- families ------------------------------------------------------------

    def family_exists(self, code: str) -> bool:
        with self.connect() as conn:
            row = conn.execute("SELECT 1 FROM families WHERE code = ?", (code,)).fetchone()
        return row is not None

    def load_state(self, conn: sqlite3.Connection, code: str) -> dict[str, Any] | None:
        row = conn.execute("SELECT state FROM families WHERE code = ?", (code,)).fetchone()
        return json.loads(row["state"]) if row else None

    def read_state(self, code: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            return self.load_state(conn, code)

    def insert_family(self, conn: sqlite3.Connection, code: str, state: dict[str, Any]) -> None:
        conn.execute(
            "INSERT INTO families (code, created_at, state) VALUES (?, ?, ?)",
            (code, _now().isoformat(), json.dumps(state)),
        )

    def save_state(self, conn: sqlite3.Connection, code: str, state: dict[str, Any]) -> None:
        conn.execute(
            "UPDATE families SET state = ?, version = version + 1 WHERE code = ?",
            (json.dumps(state), code),
        )

    def delete_family(self, conn: sqlite3.Connection, code: str) -> None:
        # Children first: SQLite only cascades when foreign keys were on at
        # insert time, and being explicit costs nothing.
        conn.execute("DELETE FROM sessions WHERE family_code = ?", (code,))
        conn.execute("DELETE FROM privacy_catches WHERE family_code = ?", (code,))
        conn.execute("DELETE FROM member_secrets WHERE family_code = ?", (code,))
        conn.execute("DELETE FROM members WHERE family_code = ?", (code,))
        conn.execute("DELETE FROM families WHERE code = ?", (code,))

    # -- members -------------------------------------------------------------

    def member_exists(self, family_code: str, member_id: str) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM members WHERE family_code = ? AND member_id = ?",
                (family_code, member_id),
            ).fetchone()
        return row is not None

    def insert_member(self, conn: sqlite3.Connection, family_code: str, member_id: str) -> None:
        conn.execute(
            "INSERT INTO members (family_code, member_id, created_at) VALUES (?, ?, ?)",
            (family_code, member_id, _now().isoformat()),
        )

    def delete_member(self, conn: sqlite3.Connection, family_code: str, member_id: str) -> None:
        for table in ("sessions", "member_secrets", "privacy_catches", "members"):
            conn.execute(
                f"DELETE FROM {table} WHERE family_code = ? AND member_id = ?",
                (family_code, member_id),
            )

    # -- secrets -------------------------------------------------------------

    def put_secret(
        self,
        conn: sqlite3.Connection,
        family_code: str,
        member_id: str,
        constraint_id: str,
        reason: str,
        sensitive_terms: list[str] | None = None,
    ) -> None:
        conn.execute(
            """INSERT INTO member_secrets
                   (family_code, member_id, constraint_id, reason, sensitive_terms)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (family_code, member_id, constraint_id)
               DO UPDATE SET reason = excluded.reason""",
            (family_code, member_id, constraint_id, reason, json.dumps(sensitive_terms or [])),
        )

    def secrets_for(self, family_code: str, member_id: str) -> dict[str, dict[str, Any]]:
        """Only ever called with the logged-in member's own id."""
        with self.connect() as conn:
            rows = conn.execute(
                """SELECT constraint_id, reason, sensitive_terms FROM member_secrets
                   WHERE family_code = ? AND member_id = ?""",
                (family_code, member_id),
            ).fetchall()
        return {
            r["constraint_id"]: {
                "reason": r["reason"],
                "sensitive_terms": json.loads(r["sensitive_terms"]),
            }
            for r in rows
        }

    # -- privacy catches -----------------------------------------------------
    #
    # A catch quotes the message the privacy hook stopped, which means it quotes
    # the private reason. It is kept apart from the family for the same reason
    # the reason is, and handed only to the person it protected.

    def put_catch(self, conn: sqlite3.Connection, family_code: str, member_id: str, catch_id: str, at: str, body: dict[str, Any]) -> None:
        conn.execute(
            "INSERT OR REPLACE INTO privacy_catches (family_code, member_id, catch_id, at, body) VALUES (?, ?, ?, ?, ?)",
            (family_code, member_id, catch_id, at, json.dumps(body)),
        )

    def catches_for(self, family_code: str, member_id: str) -> list[dict[str, Any]]:
        """Only ever called with the logged-in member's own id."""
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT at, body FROM privacy_catches WHERE family_code = ? AND member_id = ? ORDER BY at DESC",
                (family_code, member_id),
            ).fetchall()
        return [{"at": r["at"], **json.loads(r["body"])} for r in rows]

    def all_secret_texts(self, family_code: str) -> dict[str, list[str]]:
        """Every member's reasons and terms. For tests and audits only."""
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT member_id, reason, sensitive_terms FROM member_secrets WHERE family_code = ?",
                (family_code,),
            ).fetchall()
        out: dict[str, list[str]] = {}
        for r in rows:
            texts = [r["reason"]] if r["reason"] else []
            texts += json.loads(r["sensitive_terms"])
            out.setdefault(r["member_id"], []).extend(texts)
        return out

    # -- sessions ------------------------------------------------------------

    def create_session(self, conn: sqlite3.Connection, token: str, family_code: str, member_id: str) -> None:
        now = _now()
        conn.execute(
            """INSERT INTO sessions (token_hash, family_code, member_id, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?)""",
            (
                hash_token(token),
                family_code,
                member_id,
                now.isoformat(),
                (now + timedelta(days=SESSION_DAYS)).isoformat(),
            ),
        )

    def session(self, token: str) -> tuple[str, str] | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT family_code, member_id, expires_at FROM sessions WHERE token_hash = ?",
                (hash_token(token),),
            ).fetchone()
        if row is None:
            return None
        if datetime.fromisoformat(row["expires_at"]) < _now():
            self.end_session(token)
            return None
        return row["family_code"], row["member_id"]

    def end_session(self, token: str) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
