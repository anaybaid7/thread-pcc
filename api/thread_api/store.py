"""SQLite store for what people enter: source records, review actions, handover notes and the audit log.

Concern threads are never stored. They are recomputed from the records on every request, so what the screen shows
is always reproducible from the raw entries.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path

from thread_engine import facility
from thread_engine.clock import DEMO_NOW
from thread_engine.model import ReviewAction, SourceRecord

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "thread.sqlite"

_SCHEMA = """
create table if not exists records (source_id text primary key, recorded_at text not null, body text not null);
create table if not exists reviews (action_id text primary key, timestamp text not null, body text not null);
create table if not exists handovers (id integer primary key autoincrement, as_of text not null, saved_at text not null,
                                      author text not null, body text not null);
create table if not exists audit (id integer primary key autoincrement, at text not null, actor text not null,
                                  action text not null, detail text not null, thread_id text);
"""


class Store:
    def __init__(self, path: str | os.PathLike | None = None):
        self.path = str(path or os.environ.get("THREAD_DB") or DEFAULT_PATH)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(_SCHEMA)
        if not self._count("records"):
            self.seed()

    def _count(self, table: str) -> int:
        with self._lock:
            return self._db.execute(f"select count(*) from {table}").fetchone()[0]

    def seed(self) -> None:
        with self._lock, self._db:
            for t in ("records", "reviews", "handovers", "audit"):
                self._db.execute(f"delete from {t}")
            self._db.executemany(
                "insert into records values (?, ?, ?)",
                [(r.source_id, r.recorded_at.isoformat(), r.model_dump_json()) for r in facility.RECORDS],
            )

    # ------------------------------------------------------------------ reads

    def records(self) -> list[SourceRecord]:
        with self._lock:
            rows = self._db.execute("select body from records order by recorded_at, source_id").fetchall()
        return [SourceRecord.model_validate_json(b) for (b,) in rows]

    def reviews(self) -> list[ReviewAction]:
        with self._lock:
            rows = self._db.execute("select body from reviews order by timestamp").fetchall()
        return [ReviewAction.model_validate_json(b) for (b,) in rows]

    def audit(self, limit: int = 200) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "select id, at, actor, action, detail, thread_id from audit order by id desc limit ?", (limit,)
            ).fetchall()
        return [dict(id=i, at=a, actor=ac, action=act, detail=d, thread_id=t) for i, a, ac, act, d, t in rows]

    def handovers(self) -> list[dict]:
        with self._lock:
            rows = self._db.execute("select id, as_of, saved_at, author, body from handovers order by id").fetchall()
        return [dict(id=i, as_of=a, saved_at=s, author=au, items=json.loads(b)) for i, a, s, au, b in rows]

    def now(self) -> datetime:
        """The demo clock: Tuesday 09:00, moving forward one minute with each thing anyone enters."""
        latest = [r.recorded_at for r in self.records()] + [r.timestamp for r in self.reviews()]
        return max([DEMO_NOW, *latest])

    def tick(self) -> datetime:
        return self.now() + timedelta(minutes=1)

    def next_id(self, prefix: str) -> str:
        ids = [r.source_id for r in self.records() if r.source_id.startswith(prefix + "-")]
        return f"{prefix}-{max([int(i.split('-')[1]) for i in ids] + [9000]) + 1}"

    # ------------------------------------------------------------------ writes

    def add_record(self, record: SourceRecord) -> None:
        with self._lock, self._db:
            self._db.execute("insert into records values (?, ?, ?)",
                             (record.source_id, record.recorded_at.isoformat(), record.model_dump_json()))

    def add_review(self, action: ReviewAction) -> None:
        with self._lock, self._db:
            self._db.execute("insert into reviews values (?, ?, ?)",
                             (action.action_id, action.timestamp.isoformat(), action.model_dump_json()))

    def add_handover(self, as_of: datetime, saved_at: datetime, author: str, items: list[dict]) -> int:
        with self._lock, self._db:
            cur = self._db.execute("insert into handovers (as_of, saved_at, author, body) values (?, ?, ?, ?)",
                                   (as_of.isoformat(), saved_at.isoformat(), author, json.dumps(items)))
            return int(cur.lastrowid or 0)

    def log(self, at: datetime, actor: str, action: str, detail: str, thread_id: str | None = None) -> None:
        with self._lock, self._db:
            self._db.execute("insert into audit (at, actor, action, detail, thread_id) values (?, ?, ?, ?, ?)",
                             (at.isoformat(), actor, action, detail, thread_id))
