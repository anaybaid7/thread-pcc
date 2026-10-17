"""Export everything the web app reads into static JSON, for the GitHub Pages preview.

Uses the same view functions as the API over a freshly seeded in-memory store, at every handover checkpoint, so the
static site shows exactly what the live app shows before anyone acts.

    python -m thread_api.snapshot --out web/public/snapshot
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path

from thread_engine import facility

from . import views
from .store import Store

EVALUATION = Path(__file__).resolve().parents[2] / "data" / "evaluation.json"


def key(path: str, as_of: datetime | None = None) -> str:
    """Must match snapshotKey() in web/src/lib/api.ts."""
    name = path.strip("/").replace("/", "__")
    return f"{name}@{re.sub(':', '', as_of.isoformat()[:16])}" if as_of else name


def export(out: Path) -> int:
    store = Store(":memory:")
    out.mkdir(parents=True, exist_ok=True)
    files = 0

    def write(name: str, data) -> None:
        nonlocal files
        (out / f"{name}.json").write_text(json.dumps(data, default=str))
        files += 1

    now = store.now()
    base = views.World(records=store.records(), reviews=[], as_of=now, now=now)
    for point in [None, *base.checkpoints()]:
        w = views.World(records=base.records, reviews=[], as_of=point or now, now=now)
        write(key("meta", point), views.meta(w))
        write(key("queue", point), views.queue(w))
        write(key("handover", point), views.handover(w))
        write(key("residents", point), views.residents(w))
        threads, _ = w.threads()
        for t in threads:
            detail = views.thread_detail(w, t.thread_id)
            write(key(f"threads/{t.thread_id}", point), detail)
    write("timeline", views.timeline(base))
    for r in facility.RESIDENTS:
        write(key(f"story/{r.resident_id}"), views.story(base, r.resident_id))
    write("lab__samples", views.lab_samples(now))
    write("audit", [])
    if EVALUATION.exists():
        write("evaluation", json.loads(EVALUATION.read_text()))
    return files


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("web/public/snapshot"))
    args = parser.parse_args()
    print(f"Wrote {export(args.out)} files to {args.out}")


if __name__ == "__main__":
    main()
