"""Central configuration for Shoulder.

Model IDs are pinned here so a future session does not have to rediscover which
ones this AWS account can actually invoke.
"""

from __future__ import annotations

import os

REGION = os.getenv("SHOULDER_REGION", "us-east-1")

# Verified invokable on account 897545289507 in us-east-1 on 2026-09-09.
# claude-sonnet-5 is listed in the catalogue but returns AccessDenied until model
# access is enabled in the Bedrock console. Switch REASONING_MODEL to
# "us.anthropic.claude-sonnet-5" once that is done.
REASONING_MODEL = os.getenv(
    "SHOULDER_REASONING_MODEL", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
)
FAST_MODEL = os.getenv(
    "SHOULDER_FAST_MODEL", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
)

# Negotiation limits. Bounded rounds are a product decision, not a cost decision:
# an agent that cannot settle within the bound must escalate rather than grind.
MAX_ROUNDS = int(os.getenv("SHOULDER_MAX_ROUNDS", "4"))

# Fairness invariant. A capacity-adjusted share may deviate from the circle mean
# by at most this fraction before the allocation is considered unfair.
FAIRNESS_TOLERANCE = float(os.getenv("SHOULDER_FAIRNESS_TOLERANCE", "0.15"))

# Weighted envy-freeness slack, to avoid flagging trivial differences.
ENVY_EPSILON = float(os.getenv("SHOULDER_ENVY_EPSILON", "0.05"))

# Travel burden: minutes of load added per kilometre, applied round trip, for any
# task that requires physical presence.
TRAVEL_MINUTES_PER_KM = 1.2

# Travel is capped per task. Someone who lives far away makes one long journey
# and does several things while they are there; charging them the full round trip
# against every single task would make distance look like an impossible burden
# rather than an expensive one.
TRAVEL_CAP_MINUTES = 180.0

# Effort weights by task type. These convert clock time into felt load: a night
# awake with a parent is not the same hour as an hour of paperwork.
EFFORT_WEIGHTS: dict[str, float] = {
    "appointment": 1.3,
    "medication": 1.0,
    "night": 2.0,
    "transport": 1.1,
    "admin": 0.8,
    "finance": 0.7,
    "visit": 0.9,
    "household": 1.0,
}

# Task types that can be done from anywhere. This is what lets a distant sibling
# carry real load instead of being written off as unavailable.
REMOTE_CAPABLE: set[str] = {"admin", "finance"}

FIXTURES_DIR = os.getenv("SHOULDER_FIXTURES_DIR", "fixtures")
