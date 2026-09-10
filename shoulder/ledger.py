"""The agent ledger: everything Shoulder did without asking.

The product's promise is that it asks for a human rarely. That promise is only
worth something if everything it did in between can be read back afterwards, in
plain words, with the reason it was allowed to act alone. This is that record.

Entries are scoped. `family` entries are the shared audit trail. An entry scoped
`private:<principal_id>` belongs to one person's agent, for example the draft a
privacy guard stopped from leaving, and is never part of the family's view.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from shoulder.models.core import LedgerEntry, LedgerKind
from shoulder.store.sqlite import LedgerStore, store_path_for
from shoulder.text import clean

FAMILY = "family"


def private_scope(principal_id: str) -> str:
    return f"private:{principal_id}"


class Ledger:
    """Append-only record of unattended actions for one period.

    Thread safe, because the A2A servers and the negotiation graph both write to
    it from worker threads.
    """

    def __init__(
        self,
        period: str,
        *,
        persist: bool = False,
        state_dir: str | None = None,
    ) -> None:
        self.period = period
        self._entries: list[LedgerEntry] = []
        self._lock = threading.Lock()
        self._persist = persist
        self._state_dir = state_dir
        self._stores: dict[str, LedgerStore] = {}

    def _store(self, scope: str) -> LedgerStore:
        if scope not in self._stores:
            path = (
                store_path_for(scope, self._state_dir)
                if self._state_dir
                else store_path_for(scope)
            )
            self._stores[scope] = LedgerStore(path)
        return self._stores[scope]

    def record(
        self,
        kind: LedgerKind,
        summary: str,
        *,
        actor: str = "convener",
        justification: str = "",
        round_number: int | None = None,
        scope: str = FAMILY,
        details: dict[str, Any] | None = None,
    ) -> LedgerEntry:
        with self._lock:
            entry = LedgerEntry(
                id=uuid.uuid4().hex[:12],
                seq=len(self._entries) + 1,
                at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                period=self.period,
                round_number=round_number,
                actor=actor,
                kind=kind,
                summary=clean(summary),
                justification=clean(justification),
                scope=scope,
                details=details or {},
            )
            self._entries.append(entry)
            if self._persist:
                self._store(scope).append(entry)
        return entry

    def entries(self, scope: str | None = FAMILY) -> list[LedgerEntry]:
        """Entries in one scope, or every entry when `scope` is None."""
        with self._lock:
            return [e for e in self._entries if scope is None or e.scope == scope]

    def private(self, principal_id: str) -> list[LedgerEntry]:
        return self.entries(private_scope(principal_id))

    def dump(self, scope: str | None = FAMILY) -> list[dict[str, Any]]:
        return [e.model_dump(mode="json") for e in self.entries(scope)]
