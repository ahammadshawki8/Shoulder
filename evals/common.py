"""What every eval returns, and a way to run the graph without its chatter."""

from __future__ import annotations

import contextlib
import io
from dataclasses import dataclass, field
from typing import Any, Iterator


@dataclass
class Check:
    """One property, measured over many cases."""

    name: str
    claim: str
    passed: int = 0
    failures: list[str] = field(default_factory=list)
    # A measured limit, reported but not gated. Known, written down, and pinned
    # so that a change in either direction is noticed.
    gated: bool = True

    @property
    def total(self) -> int:
        return self.passed + len(self.failures)

    @property
    def ok(self) -> bool:
        return not self.gated or not self.failures

    def record(self, ok: bool, case: str, detail: str = "") -> bool:
        if ok:
            self.passed += 1
        else:
            self.failures.append(f"{case}: {detail}" if detail else case)
        return ok

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "claim": self.claim,
            "gated": self.gated,
            "passed": self.passed,
            "total": self.total,
            "failures": self.failures[:20],
        }


@dataclass
class EvalResult:
    name: str
    title: str
    checks: list[Check] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)

    def check(self, name: str, claim: str, *, gated: bool = True) -> Check:
        c = Check(name, claim, gated=gated)
        self.checks.append(c)
        return c

    @property
    def ok(self) -> bool:
        return all(c.ok for c in self.checks)

    def failures(self) -> list[str]:
        return [f"{c.name}: {f}" for c in self.checks if c.gated for f in c.failures]

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "ok": self.ok,
            "metrics": self.metrics,
            "checks": [c.as_dict() for c in self.checks],
        }


@contextlib.contextmanager
def quiet() -> Iterator[None]:
    """The graph narrates every step to stdout. An eval runs it hundreds of times."""
    with contextlib.redirect_stdout(io.StringIO()):
        yield


def ratio(num: int, den: int) -> float | None:
    return round(num / den, 3) if den else None
