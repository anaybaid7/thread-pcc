"""Optional language-model reader of progress notes, held to the same evidence standard as the rules.

The model only proposes events. Each proposal must quote its evidence verbatim from the note; a quote that is not in
the note, or an amount that is not in the quote, is rejected and counted. Polarity is never taken from the model: an
amount is compared with the resident's care-plan target by the same code the rules use. Results are cached on disk
keyed by model, prompt version and note text, so a rehearsed demo runs offline and evaluations are reproducible.

Off unless ANTHROPIC_API_KEY is set (or a cache exists). The ConText reader remains the default.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, Field, ValidationError

from ..clock import shift_of
from ..model import CarePlanRule, ClinicalEvent, EventKind, Modality, Polarity, SourceRecord, Span
from ..normalize import measured_polarity, rule_for
from .context import note_time_of

PROMPT_VERSION = "v1"
MODEL = os.environ.get("THREAD_LLM_MODEL", "claude-haiku-5-5")
CACHE = Path(os.environ.get("THREAD_LLM_CACHE", Path(__file__).resolve().parents[3] / "data" / "llm_cache"))
API = "https://api.anthropic.com/v1/messages"

SYSTEM = """You read one progress note from a long-term-care home and list the care events in it.
Only two concerns matter: hydration (fluid intake) and mobility (walking, transfers, balance).

Rules:
- "Offered", "encouraged", "set up", "assisted" are interventions. They are NOT evidence the resident drank.
- An amount counts as intake only if the note says the resident drank, took or finished it.
- "Will", "plan to", "to be", "please", "pls", "need to", and instructions like "Encourage fluids." are PLANNED.
- A negated or refused drink is low intake or a refusal, never good intake.
- Relayed history from an earlier shift ("day shift reports...") has earlier_shift = true.
- If the sentence is about someone else (roommate, tablemate, another resident), about_resident = false.
- Never infer an amount that is not written. Never diagnose.
- quote must be copied exactly, character for character, from the note.
Return every event with the record_events tool. Return an empty list if there are none."""

TOOL = {
    "name": "record_events",
    "description": "Record the care events found in the note.",
    "input_schema": {
        "type": "object",
        "properties": {
            "events": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"enum": ["observation", "intervention", "refusal", "assessment", "escalation"]},
                        "modality": {"enum": ["done", "planned", "negated", "hypothetical"]},
                        "domain": {"enum": ["hydration", "mobility", "unclear"]},
                        "direction": {"enum": ["low", "ok", "neutral"]},
                        "amount_ml": {"type": ["number", "null"]},
                        "assist_level": {"type": ["integer", "null"]},
                        "about_resident": {"type": "boolean"},
                        "earlier_shift": {"type": "boolean"},
                        "hedged": {"type": "boolean"},
                        "quote": {"type": "string"},
                    },
                    "required": ["kind", "modality", "domain", "direction", "about_resident", "quote"],
                },
            }
        },
        "required": ["events"],
    },
}


class Proposal(BaseModel):
    kind: Literal["observation", "intervention", "refusal", "assessment", "escalation"]
    modality: Literal["done", "planned", "negated", "hypothetical"]
    domain: Literal["hydration", "mobility", "unclear"]
    direction: Literal["low", "ok", "neutral"]
    amount_ml: float | None = None
    assist_level: int | None = Field(default=None, ge=0, le=3)
    about_resident: bool = True
    earlier_shift: bool = False
    hedged: bool = False
    quote: str = Field(min_length=1)


class Rejection(BaseModel):
    source_id: str
    quote: str
    reason: str


def _key(text: str) -> str:
    return hashlib.sha256(f"{MODEL}|{PROMPT_VERSION}|{text}".encode()).hexdigest()[:24]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def cached(text: str) -> list[dict] | None:
    path = CACHE / f"{_key(text)}.json"
    return json.loads(path.read_text())["events"] if path.exists() else None


def call_model(text: str, client: httpx.Client | None = None) -> list[dict]:
    """One structured-output call. Writes the raw proposals to the cache."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key and client is None:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    body = {
        "model": MODEL, "max_tokens": 1500, "system": SYSTEM, "tools": [TOOL],
        "tool_choice": {"type": "tool", "name": "record_events"},
        "messages": [{"role": "user", "content": f"<note>\n{text}\n</note>"}],
    }
    headers = {"x-api-key": key or "test", "anthropic-version": "2023-06-01", "content-type": "application/json"}
    http = client or httpx.Client(timeout=30)
    res = http.post(API, json=body, headers=headers)
    res.raise_for_status()
    blocks = res.json().get("content", [])
    events = next((b["input"].get("events", []) for b in blocks if b.get("type") == "tool_use"), [])
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / f"{_key(text)}.json").write_text(json.dumps({"model": MODEL, "note": text, "events": events}, indent=1))
    return events


def to_events(record: SourceRecord, proposals: list[dict], rules: list[CarePlanRule],
              rejections: list[Rejection] | None = None) -> list[ClinicalEvent]:
    """Validate proposals against the note and turn the survivors into events. Rejections are appended."""
    text = record.text or ""
    out: list[ClinicalEvent] = []
    note_time = note_time_of(record)
    for raw in proposals:
        try:
            p = Proposal.model_validate(raw)
        except ValidationError as exc:
            if rejections is not None:
                rejections.append(Rejection(source_id=record.source_id, quote=str(raw.get("quote", "")),
                                            reason=f"schema: {exc.errors()[0]['msg']}"))
            continue
        start = text.find(p.quote)
        if start < 0:
            start = _norm(text).find(_norm(p.quote))
            quote_ok = start >= 0 and _norm(text) == text
        else:
            quote_ok = True
        if not quote_ok:
            if rejections is not None:
                rejections.append(Rejection(source_id=record.source_id, quote=p.quote, reason="quote not in the note"))
            continue
        if p.amount_ml is not None and not re.search(rf"\b{p.amount_ml:g}\b", p.quote):
            if rejections is not None:
                rejections.append(Rejection(source_id=record.source_id, quote=p.quote,
                                            reason=f"amount {p.amount_ml:g} not in the quote"))
            continue
        domain = None if p.domain == "unclear" else p.domain
        rule = rule_for(rules, record.resident_id, domain)
        value = p.amount_ml if domain == "hydration" else (float(p.assist_level) if p.assist_level is not None
                                                           and domain == "mobility" else None)
        if p.kind == "refusal":
            polarity = Polarity.WORSE
        elif value is not None and p.kind == "observation":
            polarity = measured_polarity(rule, value)
            if polarity == Polarity.UNCLEAR and p.direction == "low":
                polarity = Polarity.WORSE
        else:
            polarity = {"low": Polarity.WORSE, "ok": Polarity.BETTER, "neutral": Polarity.NEUTRAL}[p.direction]
            if p.kind != "observation":
                polarity = Polarity.NEUTRAL
        flags = [f for f, on in (("other_subject", not p.about_resident), ("historical", p.earlier_shift),
                                 ("hedged", p.hedged),
                                 ("qualitative", value is None and polarity in (Polarity.WORSE, Polarity.BETTER)
                                  and p.kind == "observation")) if on]
        out.append(ClinicalEvent(
            event_id=f"{record.source_id}.m{len(out) + 1}", resident_id=record.resident_id, domain=domain,
            kind=EventKind(p.kind), modality=Modality(p.modality), polarity=polarity, event_time=note_time,
            recorded_at=record.recorded_at, shift=shift_of(note_time), source_id=record.source_id,
            source_type=record.source_type, author=record.author, author_role=record.author_role,
            summary=f"{p.kind.capitalize()} ({p.modality}) read by language model",
            span=Span(start=start, end=start + len(p.quote), text=p.quote), value=value,
            unit=("mL" if domain == "hydration" else "staff assist") if value is not None else None,
            extractor="llm", confidence=0.6 if p.hedged else 0.8,
            triggers=[f"model proposal, quote verified in note; direction '{p.direction}'"], flags=flags,
        ))
    return out


def llm_note_events(records: list[SourceRecord], rules: list[CarePlanRule], *, allow_calls: bool = True,
                    rejections: list[Rejection] | None = None) -> list[ClinicalEvent]:
    out: list[ClinicalEvent] = []
    for rec in records:
        if rec.source_type != "progress_note" or not rec.text:
            continue
        proposals = cached(rec.text)
        if proposals is None:
            if not allow_calls:
                raise LookupError(f"No cached reading for {rec.source_id}")
            proposals = call_model(rec.text)
        out.extend(to_events(rec, proposals, rules, rejections))
    return out


def cached_extractor(scenarios) -> object | None:
    """An extractor for the evaluation, only if every scenario note has a cached reading (no network in eval)."""
    notes = [r.text for s in scenarios for r in s.records if r.text]
    if not notes or any(cached(t) is None for t in notes):
        return None

    def extract(records, rules):
        return llm_note_events(records, rules, allow_calls=False)

    return extract
