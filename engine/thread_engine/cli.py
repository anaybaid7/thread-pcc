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
    args = parser.parse_args(argv)

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
