"""Run the Tier 7 evals and print a scorecard.

    python -m evals                        all four, offline
    python -m evals --quick                the smaller pass the test suite runs
    python -m evals --only privacy         one of them
    python -m evals --only privacy --live  also attack a real model on Bedrock
    python -m evals --n 200 --seed 12      more generated circles, another seed
    python -m evals --write-fixtures       write fixtures/evals.json as well

Exit code is 0 only if every gated check passed. Measured limits are printed
with everything else and never fail the run: they are what the system is known
not to do, and the number is the point.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from evals import escalation, fairness, precedent, privacy
from evals.common import EvalResult
from shoulder.config import FIXTURES_DIR

ORDER = ["fairness", "privacy", "escalation", "precedent"]


def _run_one(name: str, args: argparse.Namespace) -> EvalResult:
    if name == "fairness":
        return fairness.run(n=args.n or (12 if args.quick else 60), seed=args.seed)
    if name == "privacy":
        return privacy.run(quick=args.quick, live=args.live)
    if name == "escalation":
        return escalation.run(quick=args.quick)
    return precedent.run(n=args.n or (3 if args.quick else 8), seed=args.seed,
                         months=3 if args.quick else 4)


def _metrics_text(metrics: dict[str, Any]) -> Text:
    out = Text()
    for key, value in metrics.items():
        if key == "live_detail":
            continue
        rendered = (json.dumps(value, ensure_ascii=False)
                    if isinstance(value, (dict, list)) else str(value))
        out.append(f"{key}  ", style="dim")
        out.append(rendered + "\n")
    return out


def _table(result: EvalResult) -> Table:
    table = Table(box=None, pad_edge=False, show_edge=False)
    table.add_column("")
    table.add_column("check")
    table.add_column("", justify="right")
    table.add_column("claim", overflow="fold")
    for check in result.checks:
        if not check.gated:
            mark, style = "measured", "yellow"
        elif check.ok:
            mark, style = "pass", "green"
        else:
            mark, style = "FAIL", "bold red"
        table.add_row(Text(mark, style=style), check.name,
                      f"{check.passed}/{check.total}", Text(check.claim, style="dim"))
        for failure in check.failures[:5] if check.gated else check.failures[:3]:
            table.add_row("", "", "", Text("  " + failure[:160], style=style))
    return table


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Shoulder evals")
    parser.add_argument("--only", help="comma separated: " + ", ".join(ORDER))
    parser.add_argument("--n", type=int, default=None, help="generated circles or families")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--quick", action="store_true", help="the smaller pass the tests run")
    parser.add_argument("--live", action="store_true",
                        help="privacy: also attack a real model on Bedrock")
    parser.add_argument("--write-fixtures", action="store_true",
                        help=f"write {FIXTURES_DIR}/evals.json")
    args = parser.parse_args()

    chosen = [n.strip() for n in args.only.split(",")] if args.only else ORDER
    unknown = [n for n in chosen if n not in ORDER]
    if unknown:
        parser.error(f"unknown eval(s): {', '.join(unknown)}")

    console = Console(highlight=False)
    console.rule("[bold]Shoulder  |  evals")
    results: list[EvalResult] = []
    started = time.time()

    for name in chosen:
        with console.status(f"{name}..."):
            began = time.time()
            result = _run_one(name, args)
        results.append(result)
        console.print(Panel(
            Text.assemble(_metrics_text(result.metrics), "\n") if result.metrics else "",
            title=f"{result.title}  ({time.time() - began:.0f}s)",
            border_style="green" if result.ok else "red",
        ))
        console.print(_table(result))
        console.print()

    ok = all(r.ok for r in results)
    summary = Table(box=None, pad_edge=False, show_edge=False)
    for column in ("eval", "checks", "verdict"):
        summary.add_column(column)
    for r in results:
        gated = [c for c in r.checks if c.gated]
        summary.add_row(
            r.name,
            f"{sum(1 for c in gated if c.ok)}/{len(gated)} gated checks passed",
            Text("pass", style="green") if r.ok else Text("FAIL", style="bold red"),
        )
    console.print(summary)
    console.print(
        Text(f"\n{'all evals passed' if ok else 'evals FAILED'} "
             f"in {time.time() - started:.0f}s",
             style="bold green" if ok else "bold red")
    )

    if args.write_fixtures:
        os.makedirs(FIXTURES_DIR, exist_ok=True)
        path = os.path.join(FIXTURES_DIR, "evals.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "ok": ok,
                "quick": args.quick,
                "live": args.live,
                "seed": args.seed,
                "results": [r.as_dict() for r in results],
            }, fh, indent=2, ensure_ascii=False)
        console.print(f"[dim]written to {path}[/dim]")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
