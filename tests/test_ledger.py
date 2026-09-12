"""Tests for the agent ledger."""

from __future__ import annotations

from shoulder.ledger import FAMILY, Ledger, private_scope
from shoulder.store.sqlite import LedgerStore, store_path_for


def test_every_entry_has_a_time_an_order_and_a_reason():
    ledger = Ledger("2026-10")
    entry = ledger.record("seeded_rota", "Drew up a split.", justification="Routine.")
    assert entry.at and entry.seq == 1
    assert entry.justification == "Routine."
    assert entry.scope == FAMILY


def test_private_entries_never_appear_in_the_family_view():
    ledger = Ledger("2026-10")
    ledger.record("measured_fairness", "Measured.")
    ledger.record("withheld_private_detail", "Held back X.", scope=private_scope("farah"))
    assert [e.summary for e in ledger.entries()] == ["Measured."]
    assert [e.summary for e in ledger.private("farah")] == ["Held back X."]


def test_summaries_follow_the_house_style():
    ledger = Ledger("2026-10")
    entry = ledger.record("measured_fairness", "Measured it \u2014 twice \U0001F600")
    assert "\u2014" not in entry.summary
    assert "\U0001F600" not in entry.summary


def test_persisted_entries_survive_a_restart(tmp_path):
    ledger = Ledger("2026-10", persist=True, state_dir=str(tmp_path))
    ledger.record("seeded_rota", "Drew up a split.")
    ledger.record("withheld_private_detail", "Held back X.", scope=private_scope("farah"))

    family = LedgerStore(store_path_for(FAMILY, str(tmp_path))).load("2026-10")
    private = LedgerStore(store_path_for("private:farah", str(tmp_path))).load()
    assert [e.summary for e in family] == ["Drew up a split."]
    assert [e.summary for e in private] == ["Held back X."]


def test_each_principal_keeps_their_own_private_file(tmp_path):
    assert store_path_for("private:farah", str(tmp_path)) != store_path_for(
        FAMILY, str(tmp_path)
    )
    assert "farah" in store_path_for("private:farah", str(tmp_path))
