"""Text hygiene for anything a model wrote that a person will read.

Project rule: no emojis and no em dashes, anywhere. Models produce both without
being asked, so every piece of generated prose passes through here before it is
stored or shown.
"""

from __future__ import annotations

import re

_EM_DASH = "—"
_EN_DASH = "–"

_EMOJI = re.compile(
    "["
    "\U0001f300-\U0001faff"
    "\U00002600-\U000027bf"
    "\U0001f1e6-\U0001f1ff"
    "\U0000fe00-\U0000fe0f"
    "\U00002190-\U000021ff"
    "]+",
    flags=re.UNICODE,
)


def clean(text: str) -> str:
    """Strip emojis and normalise dashes in generated prose."""
    if not text:
        return text
    out = text.replace(f" {_EM_DASH} ", ", ")
    out = out.replace(_EM_DASH, ", ")
    out = out.replace(f" {_EN_DASH} ", " to ")
    out = _EMOJI.sub("", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\s+([,.;:])", r"\1", out)
    return out.strip()


def clean_all(texts: list[str]) -> list[str]:
    return [clean(t) for t in texts]
