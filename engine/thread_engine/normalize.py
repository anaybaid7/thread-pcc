"""Normalizer: structured records become events; every event gets a shift, late entries and re-imports are marked.

Nothing is dropped. A duplicate import stays in the thread as a collapsed card that points at the original, so the
care team can see why one measurement is not counted twice.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import timedelta

from .clock import shift_of
from .model import CarePlanRule, ClinicalEvent, Domain, EventKind, Modality, Polarity, SourceRecord

LATE_ENTRY = timedelta(minutes=60)
"""An entry recorded more than this long after the event it describes is flagged as a late entry."""

_ASSIST = {0: "independent", 1: "1-person assist", 2: "2-person assist"}


def domain_of(record: SourceRecord) -> Domain | None:
    if record.source_type == "fluid_round" or record.unit == "mL":
        return "hydration"
    if record.source_type == "mobility_check" or record.unit == "staff assist":
        return "mobility"
    return None


def assist_label(level: float) -> str:
    return _ASSIST.get(int(level), f"{int(level)}-person assist")


def rule_for(rules: Iterable[CarePlanRule], resident_id: str, domain: Domain | None) -> CarePlanRule | None:
    return next((r for r in rules if r.resident_id == resident_id and r.domain == domain), None)


def measured_polarity(rule: CarePlanRule | None, value: float) -> Polarity:
    if rule is None or not rule.baseline_documented:
        return Polarity.UNCLEAR
    return Polarity.MEETS_TARGET if rule.meets(value) else Polarity.BELOW_TARGET


def target_text(rule: CarePlanRule | None) -> str:
    if rule is None:
        return "no care-plan target"
    if not rule.baseline_documented:
        return "baseline not documented"
    if rule.metric == "assist_level":
        return f"baseline {assist_label(rule.threshold)}"
    return f"target ≥ {rule.threshold:g} {rule.unit}"


def structured_event(record: SourceRecord, rules: Iterable[CarePlanRule]) -> ClinicalEvent:
    """A measurement is read directly; there is nothing to interpret, so confidence is 1."""
    assert record.value is not None
    domain = domain_of(record)
    rule = rule_for(rules, record.resident_id, domain)
    if domain == "mobility":
        what = f"Mobility check: {assist_label(record.value)}"
    elif record.source_type == "verification":
        what = f"Verified at bedside: {record.value:g} {record.unit}"
    else:
        what = f"Fluid round: {record.value:g} {record.unit}"
    if record.source_type == "verification" and domain == "mobility":
        what = f"Verified at bedside: {assist_label(record.value)}"
    return ClinicalEvent(
        event_id=record.source_id, resident_id=record.resident_id, domain=domain,
        kind=EventKind.OBSERVATION, modality=Modality.DONE, polarity=measured_polarity(rule, record.value),
        event_time=record.event_time, recorded_at=record.recorded_at, shift=shift_of(record.event_time),
        source_id=record.source_id, source_type=record.source_type, author=record.author,
        author_role=record.author_role, summary=f"{what} ({target_text(rule)})", value=record.value,
        unit=record.unit, extractor="human" if record.source_type == "verification" else "structured",
        confidence=1.0,
    )


def finalize(events: Iterable[ClinicalEvent]) -> list[ClinicalEvent]:
    """Mark late entries and duplicate imports, then order by when things happened."""
    out: list[ClinicalEvent] = []
    seen: dict[tuple, str] = {}
    for e in sorted(events, key=lambda e: (e.recorded_at, e.event_id)):
        flags = list(e.flags)
        duplicate_of = e.duplicate_of
        if e.recorded_at - e.event_time > LATE_ENTRY and "late_entry" not in flags:
            flags.append("late_entry")
        if e.extractor == "structured":
            key = (e.resident_id, e.source_type, e.event_time, e.value)
            if key in seen:
                duplicate_of = seen[key]
                flags.append("duplicate_import")
            else:
                seen[key] = e.event_id
        out.append(e.model_copy(update={"flags": flags, "duplicate_of": duplicate_of, "shift": shift_of(e.event_time)}))
    return sorted(out, key=lambda e: (e.event_time, e.recorded_at, e.event_id))


def structured_events(records: Iterable[SourceRecord], rules: Iterable[CarePlanRule]) -> list[ClinicalEvent]:
    rules = list(rules)
    return [structured_event(r, rules) for r in records if r.value is not None and r.source_type != "progress_note"]
