"""Retries for structured output.

Bedrock occasionally returns a response with no usable tool call, which surfaces
as "No valid tool use or tool use input was found". It is transient and it will
happen during a live demo if it can happen at all, so every structured call goes
through here.

A negotiation that dies because one of sixteen model calls came back malformed is
not a negotiation anyone can trust with something that matters.
"""

from __future__ import annotations

import time
from typing import Callable, TypeVar

T = TypeVar("T")

RETRYABLE = (
    "no valid tool use",
    "throttl",
    "timeout",
    "serviceunavailable",
    "modelerror",
    "internalserver",
)


def is_retryable(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in RETRYABLE)


def with_retry(
    call: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 1.5,
    label: str = "model call",
    fallback: Callable[[], T] | None = None,
) -> T:
    """Run `call`, retrying transient model failures with a backoff.

    If every attempt fails and a fallback is given, the fallback is used and the
    run continues. Degrading is better than collapsing: the fairness engine is
    deterministic, so a missing critique costs nuance, not correctness.
    """
    last: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except Exception as exc:  # noqa: BLE001 - deliberately broad, see docstring
            last = exc
            if not is_retryable(exc) or attempt == attempts:
                break
            delay = base_delay * attempt
            print(f"  [retry]    {label} failed ({type(exc).__name__}), "
                  f"retrying in {delay:.1f}s")
            time.sleep(delay)

    if fallback is not None:
        print(f"  [fallback] {label} did not succeed, continuing without it")
        return fallback()
    raise last if last else RuntimeError(f"{label} failed")
