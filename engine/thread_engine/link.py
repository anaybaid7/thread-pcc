"""Concern linker: groups a resident's events into concern threads and says why each pair is connected.

Linking is deliberately conservative. An event joins a thread only when it is about the same resident and the same
concern within a time window. An event whose concern cannot be told, or that describes someone else, is left
unlinked and shown to a human instead of being forced into a thread.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .clock import shift_label
from .model import ClinicalEvent, Domain, EventKind, EvidenceLink, Modality, Polarity, Relationship

LINK_WINDOW = timedelta(hours=24)
"""An event joins an open thread if it falls within this long of the thread's latest event."""
RECURRENCE_GAP = timedelta(minutes=90)
"""Signals closer together than this are the same occurrence, not a recurrence."""
CONTRADICTION_WINDOW = timedelta(hours=2)


@dataclass
class Draft:
    """A thread before its state is decided."""

    resident_id: str
    domain: Domain
    events: list[ClinicalEvent] = field(default_factory=list)
    links: list[EvidenceLink] = field(default_factory=list)
    inferred_domain: set[str] = field(default_factory=set)
    """Events whose concern was inferred because the resident had exactly one open thread."""
    opened_by: str = ""

    @property
    def last_time(self) -> datetime:
        return max(e.event_time for e in self.events)

    @property
    def thread_id(self) -> str:
        return f"{self.resident_id}-{self.domain}-{self.opened_by}"

    @property
    def events_by_time(self) -> list[ClinicalEvent]:
        return sorted(self.events, key=order_key)

    def active_at(self, t: datetime) -> bool:
        return t - self.last_time <= LINK_WINDOW


@dataclass(frozen=True)
class Unlinked:
    event: ClinicalEvent
    reason: str


def order_key(e: ClinicalEvent) -> tuple:
    """Event time, then responses before signals at the same minute: 'Declined water when offered' is an offer
    followed by its outcome."""
    rank = 3 if e.duplicate_of else 0 if e.is_response else 2 if e.is_signal else 1
    return (e.event_time, rank, e.recorded_at, e.event_id)


def _gap_text(a: datetime, b: datetime) -> str:
    minutes = int(abs((b - a).total_seconds()) // 60)
    if minutes < 60:
        return f"{minutes} min"
    h, m = divmod(minutes, 60)
    return f"{h} h {m:02d} min" if m else f"{h} h"


def _confidence(later: ClinicalEvent, earlier: ClinicalEvent, inferred: bool) -> float:
    gap = later.event_time - earlier.event_time
    base = 0.9 if gap <= timedelta(hours=2) else 0.8 if gap <= timedelta(hours=8) else 0.65
    c = min(base, later.confidence, earlier.confidence)
    return round(c * (0.85 if inferred else 1.0), 2)


def _last(events: list[ClinicalEvent], pred) -> ClinicalEvent | None:
    return next((e for e in reversed(events) if pred(e)), None)


def _add(draft: Draft, e: ClinicalEvent, inferred: bool) -> None:
    prior = draft.events_by_time
    links = draft.links

    def link(target: ClinicalEvent, rel: Relationship, why: str) -> None:
        links.append(EvidenceLink(source_event_id=e.event_id, target_event_id=target.event_id, relationship=rel,
                                  confidence=_confidence(e, target, inferred), evidence_text=why))

    signal = _last(prior, lambda x: x.is_signal)
    response = _last(prior, lambda x: x.is_response)
    gap = _gap_text(signal.event_time, e.event_time) if signal else ""
    shift_note = ""
    if signal and shift_label(signal.event_time) != shift_label(e.event_time):
        shift_note = f", across shifts ({shift_label(signal.event_time)} → {shift_label(e.event_time)})"

    if e.duplicate_of:
        original = next((x for x in prior if x.event_id == e.duplicate_of), None)
        if original:
            link(original, Relationship.DUPLICATES, "Same round re-imported by the interface; counted once.")
    elif "historical" in e.flags and signal:
        link(signal, Relationship.RELAYS, f"Relays the earlier observation{shift_note}; not a new signal.")
    elif e.modality == Modality.PLANNED and signal:
        link(signal, Relationship.PLANS_FOR, f"Plan written {gap} after the signal{shift_note}.")
    elif e.is_response and signal:
        link(signal, Relationship.RESPONDS_TO, f"Documented {gap} after the signal{shift_note}.")
    elif e.is_signal and signal:
        if e.event_time - signal.event_time >= RECURRENCE_GAP:
            after = " after a documented response" if response and response.event_time > signal.event_time else ""
            link(signal, Relationship.RECURS, f"Recurs {gap} later{after}{shift_note}.")
        else:
            link(signal, Relationship.FOLLOWS_UP, f"Same occurrence ({gap} apart).")
    elif e.kind == EventKind.OBSERVATION and e.modality == Modality.DONE:
        anchor = response if response and (not signal or response.event_time >= signal.event_time) else signal
        if anchor:
            what = "response" if anchor is response else "signal"
            link(anchor, Relationship.FOLLOWS_UP, f"Next observation, {_gap_text(anchor.event_time, e.event_time)} "
                                                  f"after the {what}{shift_note}.")

    # Contradiction: a described improvement next to a measurement still below target, or the reverse. A note that
    # also records a response after the measurement is describing that response's outcome, not disputing the round.
    responded_after = {x.source_id: x.event_time for x in prior if x.is_response}
    if e.kind == EventKind.OBSERVATION and e.modality == Modality.DONE and not e.duplicate_of:
        for other in prior:
            if other.duplicate_of or other.kind != EventKind.OBSERVATION:
                continue
            if abs(other.event_time - e.event_time) > CONTRADICTION_WINDOW:
                continue
            note, measured = (e, other) if e.value is None else (other, e)
            if note.source_id in responded_after and responded_after[note.source_id] >= measured.event_time:
                continue
            pair = {(e.polarity, e.value is None), (other.polarity, other.value is None)}
            if pair in ({(Polarity.BETTER, True), (Polarity.BELOW_TARGET, False)},
                        {(Polarity.WORSE, True), (Polarity.MEETS_TARGET, False)}):
                link(other, Relationship.CONTRADICTS,
                     f"The note and the measurement {_gap_text(other.event_time, e.event_time)} apart disagree "
                     f"({measured.value:g} {measured.unit}); neither is chosen silently.")

    if any(x.source_event_id == e.event_id and x.relationship == Relationship.CONTRADICTS for x in links):
        links[:] = [x for x in links if not (x.source_event_id == e.event_id
                                             and x.relationship == Relationship.FOLLOWS_UP)]
    draft.events.append(e)
    if inferred:
        draft.inferred_domain.add(e.event_id)


def link_events(events: list[ClinicalEvent], as_of: datetime) -> tuple[list[Draft], list[Unlinked]]:
    """Threads and unlinked evidence from everything recorded by `as_of`."""
    visible = [e for e in events if e.recorded_at <= as_of and e.event_time <= as_of]
    by_resident: dict[str, list[ClinicalEvent]] = defaultdict(list)
    for e in visible:
        by_resident[e.resident_id].append(e)

    drafts: list[Draft] = []
    unlinked: list[Unlinked] = []
    for rid in sorted(by_resident):
        open_: dict[str, Draft] = {}
        pending: dict[str, list[ClinicalEvent]] = defaultdict(list)
        for e in sorted(by_resident[rid], key=order_key):
            if "other_subject" in e.flags:
                unlinked.append(Unlinked(e, "Describes someone other than this resident; not attached to their "
                                            "record."))
                continue
            domain, inferred = e.domain, False
            if domain is None:
                active = [d for d, dr in open_.items() if dr.active_at(e.event_time)]
                if len(active) == 1:
                    domain, inferred = active[0], True
                else:
                    if e.is_signal or e.is_response:
                        why = "two open concerns" if active else "no open concern"
                        unlinked.append(Unlinked(e, f"Concern unclear ({why}); left for a person to link."))
                    continue
            draft = open_.get(domain)
            if draft and not draft.active_at(e.event_time):
                draft = None
            if draft is None:
                if not e.is_signal:
                    pending[e.source_id].append(e)
                    continue
                draft = Draft(resident_id=rid, domain=domain, opened_by=e.event_id)
                drafts.append(draft)
                open_[domain] = draft
                _add(draft, e, inferred)
                # Earlier sentences of the same note ("Will offer again" before the refusal is read) join as context.
                for x in pending.pop(e.source_id, []):
                    if x.domain in (None, domain):
                        _add(draft, x, x.domain is None)
                continue
            _add(draft, e, inferred)
    return drafts, unlinked
