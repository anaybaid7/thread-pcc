"""FastAPI application. Concern threads are derived from the stored records on every request."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from thread_engine import facility
from thread_engine.model import ReviewAction, Role, SourceRecord

from . import views
from .store import Store

app = FastAPI(title="THREAD API", version="0.1.0",
              description="Evidence-linked concern threads for long-term care. Synthetic data only.")
store = Store()
EVALUATION = Path(__file__).resolve().parents[2] / "data" / "evaluation.json"


def world(as_of: str | None = None) -> views.World:
    now = store.now()
    try:
        t = datetime.fromisoformat(as_of) if as_of else now
    except ValueError as exc:
        raise HTTPException(422, "as_of must be an ISO date-time") from exc
    return views.World(records=store.records(), reviews=store.reviews(), as_of=min(t, now), now=now,
                       handovers=store.handovers())


def _resident_or_404(rid: str) -> None:
    if rid not in {r.resident_id for r in facility.RESIDENTS}:
        raise HTTPException(404, f"No resident {rid}")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/meta")
def meta(as_of: str | None = None) -> dict:
    return views.meta(world(as_of))


@app.get("/api/queue")
def queue(as_of: str | None = None) -> dict:
    return views.queue(world(as_of))


@app.get("/api/threads/{thread_id}")
def thread(thread_id: str, as_of: str | None = None) -> dict:
    detail = views.thread_detail(world(as_of), thread_id)
    if detail is None:
        raise HTTPException(404, "This thread is not open at the selected time.")
    return detail


@app.get("/api/residents")
def residents(as_of: str | None = None) -> list[dict]:
    return views.residents(world(as_of))


@app.get("/api/handover")
def handover(as_of: str | None = None) -> dict:
    return views.handover(world(as_of))


class HandoverItem(BaseModel):
    thread_id: str
    text: str = Field(max_length=2000)


class HandoverSave(BaseModel):
    as_of: str
    author: str = Field(min_length=1, max_length=80)
    items: list[HandoverItem]


@app.post("/api/handover")
def save_handover(body: HandoverSave) -> dict:
    at = store.tick()
    hid = store.add_handover(datetime.fromisoformat(body.as_of), at, body.author, [i.model_dump() for i in body.items])
    store.log(at, body.author, "handover_saved", f"Handover brief saved with {len(body.items)} items.")
    return {"id": hid, "saved_at": at.isoformat()}


class Action(BaseModel):
    action_type: Literal["verify_current_status", "mark_reviewed"]
    actor: str = Field(min_length=1, max_length=80)
    actor_role: Role = "RPN"
    note: str = Field(default="", max_length=1000)
    value: float | None = Field(default=None, ge=0, le=5000)


@app.post("/api/threads/{thread_id}/actions")
def act(thread_id: str, body: Action) -> dict:
    t = views.find_thread(world(), thread_id)
    if t is None:
        raise HTTPException(404, "No open thread with that id.")
    at = store.tick()
    detail = body.note.strip()
    if body.action_type == "verify_current_status" and body.value is not None:
        unit = "mL" if t.domain == "hydration" else "staff assist"
        store.add_record(SourceRecord(
            source_id=store.next_id("V"), resident_id=t.resident_id, source_type="verification", event_time=at,
            recorded_at=at, author=body.actor, author_role=body.actor_role, value=body.value, unit=unit,
            text=detail or None,
        ))
        shown = f"{body.value:g} mL" if unit == "mL" else f"{int(body.value)}-person assist"
        detail = f"Checked at bedside: {shown}." + (f" {detail}" if detail else "")
    store.add_review(ReviewAction(
        action_id=f"A-{uuid.uuid4().hex[:8]}", thread_id=thread_id, resident_id=t.resident_id,
        action_type=body.action_type, actor=body.actor, actor_role=body.actor_role, timestamp=at, note=detail,
        value=body.value,
    ))
    what = "Verified current status" if body.action_type == "verify_current_status" else \
        "Marked reviewed (concern stays open)"
    store.log(at, body.actor, body.action_type, f"{what}. {detail}".strip(), thread_id)
    return views.thread_detail(world(), thread_id) or {"thread": None}


class Note(BaseModel):
    resident_id: str
    text: str = Field(min_length=3, max_length=2000)
    author: str = Field(default="RN Demo", max_length=80)
    author_role: Role = "RN"


@app.post("/api/notes")
def add_note(body: Note) -> dict:
    _resident_or_404(body.resident_id)
    at = store.tick()
    rec = SourceRecord(source_id=store.next_id("N"), resident_id=body.resident_id, source_type="progress_note",
                       event_time=at, recorded_at=at, author=body.author, author_role=body.author_role,
                       text=body.text.strip())
    store.add_record(rec)
    store.log(at, body.author, "note_added", f"Progress note {rec.source_id} for {body.resident_id}.")
    threads, _ = world().threads()
    touched = [views.summary(t) for t in threads if any(e.source_id == rec.source_id for e in t.events)]
    return {"record": views.dump(rec), "threads": touched}


class LabText(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    resident_id: str = "R214"


@app.post("/api/lab/extract")
def lab(body: LabText) -> dict:
    _resident_or_404(body.resident_id)
    return views.lab_extract(body.text, body.resident_id, store.now())


@app.get("/api/audit")
def audit(limit: int = Query(200, ge=1, le=1000)) -> list[dict]:
    return store.audit(limit)


@app.get("/api/evaluation")
def evaluation() -> dict:
    if not EVALUATION.exists():
        raise HTTPException(404, "No evaluation report yet. Run `make eval`.")
    return json.loads(EVALUATION.read_text())


@app.post("/api/reset")
def reset() -> dict:
    store.seed()
    return {"status": "reset", "now": store.now().isoformat()}
