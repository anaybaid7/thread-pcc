"""The whole engine in one call: records in, concern threads out. Threads are always derived, never stored."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import datetime

from .decide import decide
from .explain import explain
from .extract.context import note_events
from .link import Unlinked, link_events
from .model import CarePlanRule, ClinicalEvent, ConcernThread, Resident, ReviewAction, SourceRecord
from .normalize import finalize, rule_for, structured_events

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


def threads_at(records: Iterable[SourceRecord], rules: Iterable[CarePlanRule], as_of: datetime,
               reviews: list[ReviewAction] | None = None, extract: NoteExtractor | None = note_events,
               events: list[ClinicalEvent] | None = None, residents: Iterable[Resident] = ()
               ) -> tuple[list[ConcernThread], list[Unlinked]]:
    """Every concern thread as it stood at `as_of`, using only what had been entered by then."""
    rules = list(rules)
    if events is None:
        events = events_from(records, rules, extract)
    drafts, unlinked = link_events(events, as_of)
    people = {r.resident_id: r for r in residents}
    threads = []
    for d in drafts:
        rule = rule_for(rules, d.resident_id, d.domain)
        t = decide(d, rule, as_of, reviews)
        threads.append(t.model_copy(update={"explanation": explain(t, people.get(d.resident_id), rule)}))
    threads.sort(key=lambda t: (t.review_rank, t.first_seen, t.thread_id))
    return threads, unlinked
