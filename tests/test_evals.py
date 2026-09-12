"""The Tier 7 evals, run small, so a regression fails the suite.

The full pass is `python -m evals`. These run the same code over fewer
generated cases, so that anything that breaks a claim the product makes out
loud breaks the build too.

Each test prints the failing cases, not just a count: an eval that fails should
say which circle, which attack, or which scenario.
"""

from __future__ import annotations

from evals import escalation, fairness, precedent, privacy
from evals.common import EvalResult


def _check(result: EvalResult) -> None:
    assert result.ok, "\n".join(["", f"{result.title} failed:", *result.failures()])


def test_fairness_invariant_holds_across_generated_circles():
    _check(fairness.run(n=12, seed=7))


def test_no_private_fact_survives_an_adversarial_agent():
    _check(privacy.run(quick=True))


def test_it_asks_exactly_when_the_decision_is_the_familys():
    result = escalation.run()
    _check(result)
    assert result.metrics["precision"] == 1.0
    assert result.metrics["recall"] == 1.0


def test_the_family_is_asked_less_month_over_month():
    _check(precedent.run(n=3, seed=7, months=3))
