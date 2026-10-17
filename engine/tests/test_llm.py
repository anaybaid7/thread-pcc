"""The language-model path, tested with a fake transport: no network, no key."""

import json
from datetime import datetime

import httpx
import pytest

from thread_engine import facility
from thread_engine.extract import llm
from thread_engine.model import EventKind, Modality, Polarity, SourceRecord

T = datetime(2026, 10, 19, 12)
NOTE = "Offered 200 mL of juice; res drank approx 300 mL of tea after lunch."


def record(text=NOTE):
    return SourceRecord(source_id="N-7", resident_id="R214", source_type="progress_note", event_time=T,
                        recorded_at=T, author="RN", author_role="RN", text=text)


def fake(events):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["tool_choice"]["name"] == "record_events"
        return httpx.Response(200, json={"content": [{"type": "tool_use", "name": "record_events",
                                                      "input": {"events": events}}]})
    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def cache_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(llm, "CACHE", tmp_path)


def test_verified_quotes_become_events_and_polarity_comes_from_the_rule():
    proposals = [
        {"kind": "intervention", "modality": "done", "domain": "hydration", "direction": "neutral",
         "about_resident": True, "quote": "Offered 200 mL of juice"},
        {"kind": "observation", "modality": "done", "domain": "hydration", "direction": "low", "amount_ml": 300,
         "about_resident": True, "quote": "res drank approx 300 mL of tea after lunch"},
    ]
    llm.call_model(NOTE, client=fake(proposals))
    events = llm.llm_note_events([record()], facility.CARE_PLAN, allow_calls=False)
    assert [e.kind for e in events] == [EventKind.INTERVENTION, EventKind.OBSERVATION]
    # The model said "low"; 300 mL meets Rosa's 250 mL target, and the rule wins.
    assert events[1].polarity == Polarity.MEETS_TARGET and events[1].value == 300
    assert NOTE[events[1].span.start:events[1].span.end] == events[1].span.text


def test_invented_quotes_and_amounts_are_rejected():
    rejected = []
    proposals = [
        {"kind": "observation", "modality": "done", "domain": "hydration", "direction": "ok", "amount_ml": 500,
         "about_resident": True, "quote": "res drank 500 mL"},
        {"kind": "observation", "modality": "done", "domain": "hydration", "direction": "ok", "amount_ml": 900,
         "about_resident": True, "quote": "res drank approx 300 mL of tea"},
        {"kind": "diagnosis", "modality": "done", "domain": "hydration", "direction": "low",
         "about_resident": True, "quote": "Offered"},
    ]
    events = llm.to_events(record(), proposals, facility.CARE_PLAN, rejected)
    assert events == []
    assert [r.reason.split(":")[0] for r in rejected] == ["quote not in the note", "amount 900 not in the quote", "schema"]


def test_someone_else_and_plans_carry_through():
    proposals = [{"kind": "refusal", "modality": "done", "domain": "hydration", "direction": "low",
                  "about_resident": False, "quote": "Offered 200 mL of juice"},
                 {"kind": "intervention", "modality": "planned", "domain": "hydration", "direction": "neutral",
                  "about_resident": True, "quote": "Offered"}]
    a, b = llm.to_events(record(), proposals, facility.CARE_PLAN)
    assert "other_subject" in a.flags and not a.is_signal
    assert b.modality == Modality.PLANNED and not b.is_response


def test_no_key_no_cache_means_no_call():
    with pytest.raises(LookupError):
        llm.llm_note_events([record("Something new.")], facility.CARE_PLAN, allow_calls=False)
