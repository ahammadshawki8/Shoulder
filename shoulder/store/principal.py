"""Each person's own session: what they told their agent, month by month.

Preferences drift. Someone takes on a new job, a treatment changes, a child
starts school. Nobody should have to redo intake every month, and the agent
should notice what changed. So every period, each principal's profile is saved
to their own private SQLite file (the one their private ledger lives in), and
compared with the last one.

The comparison comes back in two halves, because what changed is itself
private or not:

  public   changes to the Position: capacity, days, refused work, caps. The
           circle sees positions anyway, so the family ledger may note these.
  private  changes to private constraints or their reasons. These stay in the
           person's own ledger. The family never learns that a secret changed.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone

from shoulder.config import STATE_DIR
from shoulder.models.core import Principal, Position
from shoulder.store.sqlite import store_path_for

_SCHEMA = """CREATE TABLE IF NOT EXISTS profiles (
    period TEXT PRIMARY KEY, principal TEXT NOT NULL, saved_at TEXT NOT NULL)"""


class PrincipalStore:
    def __init__(self, principal_id: str, state_dir: str = STATE_DIR) -> None:
        self.principal_id = principal_id
        self.path = store_path_for(f"private:{principal_id}", state_dir)
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with self._connect() as db:
            db.execute(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def save(self, period: str, principal: Principal) -> None:
        with self._connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO profiles VALUES (?, ?, ?)",
                (period, principal.model_dump_json(),
                 datetime.now(timezone.utc).isoformat(timespec="seconds")),
            )

    def before(self, period: str) -> Principal | None:
        """The most recent profile saved for an earlier period."""
        with self._connect() as db:
            row = db.execute(
                "SELECT principal FROM profiles WHERE period < ? ORDER BY period DESC LIMIT 1",
                (period,),
            ).fetchone()
        return Principal.model_validate_json(row["principal"]) if row else None

    def periods(self) -> list[str]:
        with self._connect() as db:
            return [r["period"] for r in db.execute("SELECT period FROM profiles ORDER BY period")]


def _days(days: list[str]) -> str:
    return ", ".join(days) if days else "none"


def drift(previous: Principal, current: Principal) -> tuple[list[str], list[str]]:
    """What changed since last time, split into (public, private)."""
    public: list[str] = []
    a: Position = previous.to_position()
    b: Position = current.to_position()
    name = current.name

    if a.capacity != b.capacity:
        public.append(f"{name}'s capacity changed from {a.capacity} to {b.capacity}.")
    if a.unavailable_weekdays != b.unavailable_weekdays:
        public.append(
            f"{name}'s unavailable days changed from {_days(a.unavailable_weekdays)} "
            f"to {_days(b.unavailable_weekdays)}."
        )
    if a.unavailable_weekdays_onsite != b.unavailable_weekdays_onsite:
        public.append(
            f"The days {name} cannot travel changed from "
            f"{_days(a.unavailable_weekdays_onsite)} to {_days(b.unavailable_weekdays_onsite)}."
        )
    if a.refused_task_types != b.refused_task_types:
        public.append(
            f"The kinds of work {name} does not take changed from "
            f"{_days(a.refused_task_types)} to {_days(b.refused_task_types)}."
        )
    if a.max_tasks_per_period != b.max_tasks_per_period:
        public.append(
            f"{name}'s monthly limit changed from {a.max_tasks_per_period or 'none'} "
            f"to {b.max_tasks_per_period or 'none'}."
        )
    if a.remote_only != b.remote_only:
        public.append(f"{name} {'now' if b.remote_only else 'no longer'} works remotely only.")
    for note in b.shareable_notes:
        if note not in a.shareable_notes:
            public.append(f"{name} added: {note}")
    for note in a.shareable_notes:
        if note not in b.shareable_notes:
            public.append(f"{name} no longer says: {note}")

    private: list[str] = []
    old = {c.id: c for c in previous.constraints if c.is_private()}
    new = {c.id: c for c in current.constraints if c.is_private()}
    for cid in new.keys() - old.keys():
        private.append(f"You added a private limit: {new[cid].summary}")
    for cid in old.keys() - new.keys():
        private.append(f"You removed a private limit: {old[cid].summary}")
    for cid in new.keys() & old.keys():
        if new[cid] != old[cid]:
            private.append(f"You changed a private limit: {new[cid].summary}")
    return public, private
