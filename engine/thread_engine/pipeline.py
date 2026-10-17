"""The whole engine in one call: records in, concern threads out. Threads are always derived, never stored."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import datetime

from .extract.context import note_events
from .model import CarePlanRule, ClinicalEvent, SourceRecord
from .normalize import finalize, structured_events

NoteExtractor = Callable[[list[SourceRecord], list[CarePlanRule]], list[ClinicalEvent]]


def events_from(records: Iterable[SourceRecord], rules: Iterable[CarePlanRule],
                extract: NoteExtractor | None = note_events) -> list[ClinicalEvent]:
    """Normalized events. `extract=None` ignores notes entirely (the structured-only baseline)."""
    records, rules = list(records), list(rules)
    events = structured_events(records, rules)
    if extract is not None:
        events += extract(records, rules)
    return finalize(events)


def visible_records(records: Iterable[SourceRecord], as_of: datetime) -> list[SourceRecord]:
    return [r for r in records if r.recorded_at <= as_of]
