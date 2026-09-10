"""Stand-in models for running the real negotiation graph with no network.

Every node, hook, store and ledger entry is the real code. Only the model calls
are scripted, and the scripts are deliberately plain: siblings accept their
share, the Convener proposes no moves it cannot justify, reaches for exactly the
remedy the fairness engine found, and writes a card whose numbers the engine
recomputes anyway. The point is to show the machinery, not to imitate judgement.
Use --live on any demo to see real models make those calls.
"""

from __future__ import annotations

import re
from typing import Any

from shoulder.models.core import Circle
from shoulder.scripted_model import ScriptedModel, ToolCall, has_tool_result, last_text

_FINDING = re.compile(r"Paid help covering (.+?) would move", re.S)


def _found_task_ids(prompt: str) -> list[str]:
    match = _FINDING.search(prompt)
    return re.findall(r"\bT\d{2}\b", match.group(1)) if match else []


def _principal(messages: list[dict[str, Any]]) -> ToolCall:
    return ToolCall("Critique", {
        "principal_id": "",
        "verdict": "accept",
        "reason_class": "none",
        "contested_task_ids": [],
        "message": "This share works for me.",
    })


def _convener_turn(messages: list[dict[str, Any]]) -> ToolCall | str:
    """The agent-loop turns: only the remedies step uses these."""
    if has_tool_result(messages):
        return "Raised it with the family, since it is theirs to decide."
    ids = _found_task_ids(last_text(messages))
    if ids:
        return ToolCall("arrange_paid_help", {
            "task_ids": ids,
            "reason": "The fairness engine found this would bring every share inside the limit.",
        })
    return "No action would help, so I took none."


def _convener_structured(output_model: type, messages: list[dict[str, Any]]) -> dict[str, Any]:
    prompt = last_text(messages)
    if output_model.__name__ == "ProposedRevision":
        return {
            "moves": [],
            "rationale": "None of the legal moves closes the gap, so I proposed none.",
        }
    ids = _found_task_ids(prompt)
    options = [
        {
            "label": "Keep the current split",
            "consequence": "Every stated limit holds and the care is covered, with the load uneven.",
            "effect": {"kind": "accept_split"},
        },
        {
            "label": "Talk it through together first",
            "consequence": "Nothing changes until you have spoken.",
            "effect": {"kind": "none"},
        },
    ]
    if ids:
        options.insert(1, {
            "label": "Bring in paid help for two tasks",
            "consequence": "Paid help covers them each month, and the split becomes fair.",
            "effect": {"kind": "paid_help", "task_ids": ids},
        })
    return {
        "id": "scripted",
        "period": "",
        "kind": "fairness_breach",
        "headline": "",
        "what_i_tried": [
            "Built an opening split from everyone's stated availability.",
            "Looked for moves inside everyone's limits. None made the split fairer.",
        ],
        "the_tension": (
            "The tasks that could move off the heaviest share are ones nobody else "
            "has said they can take."
        ),
        "options": options,
        "what_i_will_not_decide": (
            "Which of these is right for your family. You know what each of you is "
            "carrying, and I do not."
        ),
    }


def offline_models(circle: Circle) -> dict[str, ScriptedModel]:
    models: dict[str, ScriptedModel] = {
        p.id: ScriptedModel(_principal) for p in circle.principals
    }
    models["convener"] = ScriptedModel(_convener_turn, structured=_convener_structured)
    return models
