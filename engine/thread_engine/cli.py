"""Command line entry point: `thread <command>`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="thread", description="THREAD evidence engine")
    sub = parser.add_subparsers(dest="command")
    ev = sub.add_parser("evaluate", help="Run the labelled evaluation")
    ev.add_argument("--out", type=Path, help="Write the full report as JSON")
    sub.add_parser("llm-warm", help="Read every facility and scenario note with the language model and cache it "
                                    "(needs ANTHROPIC_API_KEY)")
    args = parser.parse_args(argv)

    if args.command == "llm-warm":
        from . import facility
        from .extract.llm import MODEL, cached, call_model
        from .scenarios import all_scenarios

        notes = {r.text for r in facility.RECORDS if r.text}
        notes |= {r.text for s in all_scenarios() for r in s.records if r.text}
        todo = [t for t in sorted(notes) if cached(t) is None]
        print(f"{len(notes)} notes, {len(todo)} to read with {MODEL}")
        for i, text in enumerate(todo, 1):
            call_model(text)
            print(f"  {i}/{len(todo)}", end="\r")
        print("\nCached. `thread evaluate` now includes the language-model reader.")
        return 0

    if args.command == "evaluate":
        from .evaluate import evaluate, summary_table

        report = evaluate()
        splits = report["splits"]
        print(f"{report['scenarios']} scenarios ({splits['dev']} dev, {splits['held_out']} held-out)")
        print(summary_table(report))
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(report, indent=1, default=str))
            print(f"\nWrote {args.out}")
        return 0
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
