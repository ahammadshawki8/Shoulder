"""The privacy guard: a principal's private facts never leave its agent.

CLAUDE.md is explicit that this is enforced by a hook, not by prompt wording. The
principal's system prompt already asks the model to keep a secret; this module is
what happens when the model does not. It runs in code, on every message the
agent produces, and it does not care what the model was told.

Detection is deterministic, in three layers, per private constraint:

  phrases   the private reason, and every clause of it
  terms     the constraint's `sensitive_terms`, matched as word prefixes, so
            "chemo" also catches "chemotherapy"
  shingles  any three consecutive content words from one sentence of the
            reason, in order, which catches a reworded sentence that still
            carries the substance ("the only responsible adult overnight")

What is not screened: the constraint's summary. For a private constraint the
summary describes only its effect ("Unavailable Friday and Saturday"), and the
effect is exactly what the Position shares with the circle on purpose. The
Convener saying "Farah is unavailable Friday and Saturday" is the system working.
Screening it made the family ledger fail its own audit in the first full run.

Every check runs twice: on normalised text (lower case, punctuation to spaces)
and on squashed text with everything but letters and digits removed. The second
pass exists because a streamed reply can arrive split mid-word ("Chemo\\ntherapy")
and a whole-word check alone would wave it through.

And every check runs over several views of the text, because the Tier 7
adversarial eval showed each of these walking straight past the plain one:

  folded     compatibility forms, accents and invisible characters removed, and
             common lookalike letters mapped to Latin ("\\u0441hemo" with a
             Cyrillic c, full-width letters, "che\\u200bmo")
  joined     line breaks removed, since a stream can split inside a short word
  despaced   single letters run together ("c h e m o", "c.h.e.m.o")
  leet       digits and symbols read as letters ("ch3m0")
  reversed   and ROT13, the two rewrites that need no key
  decoded    the strings inside any JSON object, with escapes resolved (over
             A2A a reply is JSON, and a newline inside a JSON string reaches
             the guard as a backslash and an "n"), and any base64 or hex run
             that decodes to text

When something matches, the whole piece of free text it appeared in is withheld
and replaced with a note that a private detail was removed. Structured fields
around it (a verdict, a reason class, task ids) still go through, so the
negotiation keeps working.

Whole text, not the offending sentence, because of the first live run. With the
leaking sentences cut out, the sentence left behind read "She needs to be able to
get help quickly if she develops any complications, so overnight solo care isn't
safe for her right now." Not one private word in it, and it points straight at
the secret. A model that let one fact slip has written everything around it in
the same breath. The guard fails closed.
"""

from __future__ import annotations

import base64
import binascii
import codecs
import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Iterable

from strands.hooks import (
    AfterModelCallEvent,
    BeforeToolCallEvent,
    HookProvider,
    HookRegistry,
)

from shoulder.models.core import Constraint, Principal

WITHHELD = "(a private detail was removed before sending)"

_SHINGLE = 3
_MIN_SQUASHED = 6

_STOPWORDS = {
    "a", "about", "after", "again", "all", "also", "am", "an", "and",
    "any", "are", "as", "at", "be", "because", "been", "before", "being", "but",
    "by", "can", "cannot", "could", "did", "do", "does", "doing", "each", "for",
    "from", "had", "has", "have", "he", "her", "here", "hers", "him", "his",
    "how", "i", "if", "in", "into", "is", "it", "its", "just", "me", "mean",
    "more", "most", "my", "no", "nor", "not", "of", "off", "on", "once", "one",
    "only", "or", "other", "our", "out", "over", "own", "same", "she", "should",
    "so", "some", "such", "than", "that", "the", "their", "them", "then",
    "there", "these", "they", "this", "those", "to", "too", "up", "very", "was",
    "we", "were", "what", "when", "where", "which", "who", "why", "will",
    "with", "would", "you", "your",
}


def normalise(text: str) -> str:
    """Lower case, every run of non-alphanumerics collapsed to one space."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def squash(text: str) -> str:
    """Lower case with everything but letters and digits removed."""
    return re.sub(r"[^a-z0-9]+", "", text.lower())


# Letters that pass for Latin ones, after lower casing. Not every confusable in
# Unicode, just enough that swapping one character does not hide a word.
_CONFUSABLES = str.maketrans({
    "а": "a", "в": "b", "е": "e", "ё": "e", "і": "i", "ј": "j", "к": "k",
    "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "ѕ": "s", "т": "t",
    "у": "y", "х": "x", "ԁ": "d", "ɡ": "g", "ո": "n",
    "α": "a", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p",
    "τ": "t", "υ": "u", "χ": "x",
})
_LEET = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
    "@": "a", "$": "s", "!": "i", "|": "l",
})
_SPACED = re.compile(r"(?<![a-z0-9])(?:[a-z0-9] ){2,}[a-z0-9](?![a-z0-9])")
_BASE64 = re.compile(r"[A-Za-z0-9+/]{12,}={0,2}")
_HEX = re.compile(r"(?<![0-9A-Fa-f])(?:[0-9A-Fa-f]{2}){8,}(?![0-9A-Fa-f])")


def fold(text: str) -> str:
    """Lower case, with compatibility forms, accents, invisible characters and
    lookalike letters resolved to plain Latin."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(
        ch for ch in text
        if not unicodedata.combining(ch) and unicodedata.category(ch) != "Cf"
    )
    return text.lower().translate(_CONFUSABLES)


def _readable(raw: bytes) -> str | None:
    text = raw.decode("utf-8", "ignore")
    if len(text) < 4 or sum(ch.isprintable() for ch in text) < 0.9 * len(text):
        return None
    return text


def _json_strings(text: str) -> list[str]:
    """Every key and value inside the JSON object in `text`, escapes resolved."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return []
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []
    out: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, str):
            out.append(node)
        elif isinstance(node, dict):
            for key, value in node.items():
                out.append(str(key))
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(data)
    return out


def _decoded(text: str) -> list[str]:
    out = _json_strings(text)
    for token in _BASE64.findall(text):
        try:
            raw = base64.b64decode(token + "=" * (-len(token) % 4), validate=True)
        except (binascii.Error, ValueError):
            continue
        if (found := _readable(raw)) is not None:
            out.append(found)
    for token in _HEX.findall(text):
        if (found := _readable(bytes.fromhex(token))) is not None:
            out.append(found)
    return out


def views(text: str) -> list[str]:
    """Every reading of `text` the detector checks. See the module docstring."""
    out: list[str] = []
    for source in [text, *_decoded(text)]:
        folded = fold(source)
        despaced = _SPACED.sub(lambda m: m.group(0).replace(" ", ""), normalise(folded))
        out.extend([
            folded,
            # A streamed reply splits anywhere, including inside a short word.
            re.sub(r"[\r\n]+", "", folded),
            despaced,
            folded.translate(_LEET),
            folded[::-1],
            codecs.decode(folded, "rot13"),
        ])
    return list(dict.fromkeys(v for v in out if v))


def _stem(word: str) -> str:
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _content_words(text: str) -> list[str]:
    words = [_stem(w) for w in normalise(text).split()]
    return [w for w in words if len(w) > 1 and w not in _STOPWORDS]


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]


def _clauses(text: str) -> list[str]:
    return [c.strip() for c in re.split(r"[.,;:!?]", text) if c.strip()]


@dataclass(frozen=True)
class Finding:
    """One private fact found in a piece of text. Never leaves the principal."""

    constraint_id: str
    layer: str
    matched: str


@dataclass
class _Rule:
    constraint: Constraint
    phrases: list[str] = field(default_factory=list)
    terms: list[str] = field(default_factory=list)
    shingles: list[tuple[str, ...]] = field(default_factory=list)


class PrivacyScreen:
    """Deterministic detector for one principal's private facts."""

    def __init__(self, principal: Principal) -> None:
        self.principal = principal
        self._rules: list[_Rule] = []
        for c in principal.constraints:
            if not c.is_private():
                continue
            rule = _Rule(constraint=c)
            if c.reason:
                rule.phrases.append(normalise(c.reason))
                rule.phrases.extend(
                    normalise(clause)
                    for clause in _clauses(c.reason)
                    if len(clause.split()) >= 3
                )
                for sentence in _sentences(c.reason):
                    words = _content_words(sentence)
                    rule.shingles.extend(
                        tuple(words[i : i + _SHINGLE])
                        for i in range(len(words) - _SHINGLE + 1)
                    )
            rule.terms = [normalise(t) for t in c.sensitive_terms if normalise(t)]
            rule.phrases = sorted({p for p in rule.phrases if p})
            self._rules.append(rule)

    @property
    def active(self) -> bool:
        return bool(self._rules)

    def findings(self, text: str) -> list[Finding]:
        if not text or not self._rules:
            return []
        out: list[Finding] = []
        for view in views(text):
            out.extend(self._findings_in(view))
        return list(dict.fromkeys(out))

    def _findings_in(self, text: str) -> list[Finding]:
        norm = normalise(text)
        flat = squash(text)
        words = _content_words(text)
        out: list[Finding] = []

        for rule in self._rules:
            cid = rule.constraint.id
            for phrase in rule.phrases:
                squashed = phrase.replace(" ", "")
                if f" {phrase} " in f" {norm} " or (
                    len(squashed) >= _MIN_SQUASHED * 2 and squashed in flat
                ):
                    out.append(Finding(cid, "phrase", phrase))
            for term in rule.terms:
                if re.search(rf"(?<![a-z0-9]){re.escape(term)}", norm) or (
                    len(term.replace(" ", "")) >= _MIN_SQUASHED
                    and term.replace(" ", "") in flat
                ):
                    out.append(Finding(cid, "term", term))
            for gram in rule.shingles:
                n = len(gram)
                if any(tuple(words[i : i + n]) == gram for i in range(len(words) - n + 1)):
                    out.append(Finding(cid, "shingle", " ".join(gram)))

        return list(dict.fromkeys(out))

    # -- redaction ---------------------------------------------------------

    def redact_value(self, value: Any) -> tuple[Any, list[Finding]]:
        """Screen every string inside a JSON-like value, keeping its shape.

        A string carrying a private fact is withheld whole. Strings that carry
        nothing, like a verdict, pass through untouched. A key carrying one is
        dropped with its value: a key cannot be replaced by the withheld note
        without colliding with the next, and nothing legitimate is named that.
        """
        if isinstance(value, str):
            found = self.findings(value)
            return (WITHHELD, found) if found else (value, [])
        if isinstance(value, dict):
            out, found = {}, []
            for key, item in value.items():
                in_key = self.findings(str(key))
                if in_key:
                    found.extend(in_key)
                    continue
                out[key], f = self.redact_value(item)
                found.extend(f)
            return out, found
        if isinstance(value, list):
            items, found = [], []
            for item in value:
                cleaned, f = self.redact_value(item)
                items.append(cleaned)
                found.extend(f)
            return items, found
        return value, []

    def redact_text(self, text: str) -> tuple[str, list[Finding]]:
        """Screen a whole reply.

        A JSON object inside the reply keeps its structure: only the fields that
        carry a private fact are withheld. Prose around it that carries one is
        dropped. Anything else that matches is withheld entirely.
        """
        found = self.findings(text)
        if not found:
            return text, []

        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                data = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                data = None
            if isinstance(data, dict):
                prefix, suffix = text[:start], text[end + 1 :]
                cleaned, _ = self.redact_value(data)
                result = "".join([
                    "" if self.findings(prefix) else prefix,
                    json.dumps(cleaned, indent=2, ensure_ascii=False),
                    "" if self.findings(suffix) else suffix,
                ])
                if not self.findings(result):
                    return result, found

        return WITHHELD, found


@dataclass
class Catch:
    """A message the guard stopped. Kept on the principal's side only."""

    channel: str
    draft: str
    sent: str
    findings: list[Finding]


class PrivacyGuard(HookProvider):
    """Strands hook that screens everything a principal's agent produces.

    Registered on every Principal Agent. Two interception points:

      AfterModelCallEvent   the finished model message, text and tool input,
                            before it is added to history or returned
      BeforeToolCallEvent   the input of any tool about to run, including the
                            structured output tool that carries a Critique

    Both rewrite in place. The second is belt and braces: it finds nothing when
    the first has already done its job, and it costs nothing when it does.

    `reply` says what actually leaves the agent. Over A2A the reply is text. In
    process it is the structured Critique, and any text the model writes around
    it is working notes that never leave: in the first live run they quoted her
    constraints back to herself every round ("checking against Unavailable
    Friday and Saturday"). Working notes are still scrubbed, silently, so they
    cannot surface later, but only a reply that was about to leave is recorded
    as a catch. Otherwise the family's ledger would announce, every round, that
    Farah has something private, which is its own small leak.

    Note for anyone serving this agent over A2A: the stock executor streams text
    chunks to the caller as the model produces them, which is before this hook
    ever sees the finished message. `shoulder.a2a.serve` holds the stream for
    that reason. Do not remove one without the other.
    """

    def __init__(
        self,
        principal: Principal,
        *,
        reply: str = "text",
        ledger: Any = None,
        echo: bool = False,
    ) -> None:
        if reply not in ("text", "structured"):
            raise ValueError("reply must be 'text' or 'structured'")
        self.principal = principal
        self.screen = PrivacyScreen(principal)
        self.reply = reply
        self.ledger = ledger
        self.echo = echo
        self.caught: list[Catch] = []

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(AfterModelCallEvent, self._screen_model_output)
        registry.add_callback(BeforeToolCallEvent, self._screen_tool_input)

    def _screen_model_output(self, event: AfterModelCallEvent) -> None:
        response = event.stop_response
        if response is None or not self.screen.active:
            return
        for block in response.message.get("content", []):
            if "text" in block:
                draft = block["text"]
                cleaned, found = self.screen.redact_text(draft)
                if found:
                    block["text"] = cleaned
                    if self.reply == "text":
                        self._caught("reply", draft, cleaned, found)
            elif "toolUse" in block:
                draft = block["toolUse"].get("input")
                cleaned, found = self.screen.redact_value(draft)
                if found:
                    block["toolUse"]["input"] = cleaned
                    self._caught("structured", _dumps(draft), _dumps(cleaned), found)

    def _screen_tool_input(self, event: BeforeToolCallEvent) -> None:
        if not self.screen.active:
            return
        draft = event.tool_use.get("input")
        cleaned, found = self.screen.redact_value(draft)
        if found:
            event.tool_use["input"] = cleaned
            self._caught("tool", _dumps(draft), _dumps(cleaned), found)

    def _caught(self, channel: str, draft: str, sent: str, found: list[Finding]) -> None:
        self.caught.append(Catch(channel, draft, sent, found))
        p = self.principal
        if self.echo:
            print(f"  [privacy]  {p.name}'s agent: a private detail was held back "
                  f"before sending")
        if self.ledger is None:
            return

        from shoulder.ledger import private_scope

        # The family sees that the guard acted, never what it caught.
        self.ledger.record(
            "withheld_private_detail",
            f"{p.name}'s agent held back a private detail before a message left.",
            actor=f"agent:{p.id}",
            justification=(
                "Private details never leave a person's own agent. A check in code "
                "reads every outbound message, whatever the model was told."
            ),
            details={"principal_id": p.id, "withheld": len(found)},
        )
        constraints = {c.id: c for c in p.constraints}
        about = sorted({constraints[f.constraint_id].summary.rstrip(".") for f in found})
        self.ledger.record(
            "withheld_private_detail",
            f"Stopped a message that would have revealed: {'; '.join(about)}.",
            actor="guard:privacy",
            scope=private_scope(p.id),
            justification="This stays on your side. Your family only sees that a check ran.",
            details={
                "channel": channel,
                "draft": draft,
                "sent": sent,
                "matched": [f.matched for f in found],
                "constraints": sorted({f.constraint_id for f in found}),
            },
        )


def _dumps(value: Any) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


@dataclass(frozen=True)
class Leak:
    principal_id: str
    principal_name: str
    constraint_id: str
    layer: str
    matched: str


def scan_for_leaks(texts: Iterable[str], principals: list[Principal]) -> list[Leak]:
    """Audit arbitrary text (a wire log, a ledger) for anyone's private facts.

    This is the auditor's view, with the ground truth in hand. The A2A demo runs
    it over every byte that crossed the wire, and the Tier 7 privacy eval should
    too. It uses the same detector as the guard, so it also catches a fact that
    was split across streamed chunks.
    """
    screens = [PrivacyScreen(p) for p in principals]
    leaks: list[Leak] = []
    for text in texts:
        for screen in screens:
            for f in screen.findings(text):
                leaks.append(
                    Leak(
                        screen.principal.id,
                        screen.principal.name,
                        f.constraint_id,
                        f.layer,
                        f.matched,
                    )
                )
    return list(dict.fromkeys(leaks))
