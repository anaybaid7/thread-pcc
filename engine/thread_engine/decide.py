"""Deterministic state machine: a linked thread in, one of six states out, with reasons a nurse can read.

The language model (if any) never decides anything here. Every rule is explicit, and the resolution rule is labelled
everywhere as a demonstration rule, not clinical guidance.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from .clock import shift_label
from .link import RECURRENCE_GAP, Draft, _gap_text
from .model import (
    CarePlanRule,
    ClinicalEvent,
    ConcernThread,
    EventKind,
    Gap,
    Modality,
    Polarity,
    ReasonCode,
    Relationship,
    ReviewAction,
    StepLabel,
    ThreadState,
    ThreadStep,
)

DEFAULT_WINDOW_HOURS = 8.0
NO_RESPONSE_GRACE = timedelta(minutes=30)

RANK = {
    ThreadState.PERSISTENT_SIGNAL: 1,
    ThreadState.NEW_SIGNAL: 2,
    ThreadState.UNVERIFIED: 3,
    ThreadState.AMBIGUOUS: 4,
    ThreadState.RESPONSE_DOCUMENTED: 5,
    ThreadState.OUTCOME_VERIFIED: 6,
}


def _measure_word(domain: str) -> str:
    return "fluid round" if domain == "hydration" else "mobility check"


def _clear(e: ClinicalEvent) -> bool:
    """A signal that does not depend on reading tone: a measurement below target, or a documented refusal."""
    return e.kind == EventKind.REFUSAL or (e.value is not None and e.polarity == Polarity.BELOW_TARGET)


def decide(draft: Draft, rule: CarePlanRule | None, as_of: datetime,
           reviews: list[ReviewAction] | None = None) -> ConcernThread:
    events = draft.events_by_time
    window = timedelta(hours=rule.resolution_window_hours if rule else DEFAULT_WINDOW_HOURS)
    contradicted = {x for link in draft.links if link.relationship == Relationship.CONTRADICTS
                    for x in (link.source_event_id, link.target_event_id)}
    first = next(e for e in events if e.event_id == draft.opened_by)

    state = ThreadState.NEW_SIGNAL
    reasons: list[ReasonCode] = []
    steps: list[ThreadStep] = []
    signals = [first]
    last_signal = first
    last_response: ClinicalEvent | None = None
    verified_by: ClinicalEvent | None = None
    plans: list[ClinicalEvent] = []

    def reason(code: ReasonCode) -> None:
        if code not in reasons:
            reasons.append(code)

    def step(e: ClinicalEvent, role, label: StepLabel, note: str) -> None:
        steps.append(ThreadStep(event_id=e.event_id, role=role, label=label, note=note))

    for e in events:
        if "late_entry" in e.flags:
            reason(ReasonCode.LATE_ENTRY)
        if e.duplicate_of:
            reason(ReasonCode.DUPLICATE_COLLAPSED)
            step(e, "context", StepLabel.CONTEXT, f"Re-import of {e.duplicate_of}; counted once.")
            continue
        if e is first:
            note = "Opened this thread."
            if not _clear(e):
                note += " Described in a note without a measurement."
            step(e, "signal", StepLabel.OBSERVED if _clear(e) else StepLabel.UNCLEAR, note)
            if e.kind == EventKind.REFUSAL:
                reason(ReasonCode.REFUSAL_DOCUMENTED)
            continue
        if "historical" in e.flags:
            step(e, "context", StepLabel.CONTEXT, "Repeats an earlier observation; not counted again.")
            continue
        if e.modality == Modality.PLANNED:
            plans.append(e)
            step(e, "plan", StepLabel.PLANNED, "An intention only. It is not evidence the action happened.")
            continue
        if e.modality != Modality.DONE:
            step(e, "context", StepLabel.CONTEXT, f"Recorded as {e.modality.value}; not counted.")
            continue
        if e.is_response:
            if state != ThreadState.OUTCOME_VERIFIED:
                state = ThreadState.RESPONSE_DOCUMENTED
            last_response = e
            step(e, "response", StepLabel.DOCUMENTED,
                 "The record shows a response. It does not show whether the concern improved.")
            continue
        if e.is_signal:
            if e.kind == EventKind.REFUSAL:
                reason(ReasonCode.REFUSAL_DOCUMENTED)
            if e.event_time - last_signal.event_time < RECURRENCE_GAP:
                step(e, "signal", StepLabel.OBSERVED if _clear(e) else StepLabel.UNCLEAR, "Same occurrence.")
            else:
                state = ThreadState.PERSISTENT_SIGNAL
                verified_by = None
                reason(ReasonCode.RECURRENT_SIGNAL)
                step(e, "recurrence", StepLabel.NEEDS_REVIEW,
                     "Another concerning observation. It raises review priority; it does not establish a diagnosis.")
            last_signal = e
            signals.append(e)
            continue
        if e.is_measured and e.polarity == Polarity.MEETS_TARGET:
            anchor = last_response if last_response and last_response.event_time >= last_signal.event_time \
                else last_signal
            bedside = e.source_type == "verification"
            if bedside or e.event_time - anchor.event_time <= window:
                if state != ThreadState.OUTCOME_VERIFIED:
                    verified_by = e
                state = ThreadState.OUTCOME_VERIFIED
                step(e, "outcome", StepLabel.VERIFIED,
                     "Checked at the bedside and meets the care-plan target." if bedside else
                     f"Meets the care-plan target within {window.total_seconds() / 3600:g} h "
                     f"(demonstration rule).")
            else:
                step(e, "context", StepLabel.CONTEXT, "Meets the target, but outside the demonstration window.")
            continue
        if e.event_id in contradicted:
            reason(ReasonCode.CONTRADICTORY_EVIDENCE)
            step(e, "contradiction", StepLabel.CONTRADICTS,
                 "Disagrees with a measurement nearby. Both are shown; neither is chosen.")
            continue
        if e.polarity == Polarity.BETTER:
            step(e, "context", StepLabel.UNCLEAR,
                 "Improvement described without an amount, so it cannot meet the demonstration rule.")
            continue
        step(e, "context", StepLabel.CONTEXT, "Context.")

    # ---- after the walk: time, ambiguity, plans
    if not any(_clear(s) for s in signals) and state != ThreadState.OUTCOME_VERIFIED:
        state = ThreadState.AMBIGUOUS
        reason(ReasonCode.AMBIGUOUS_NOTE if any("hedged" in s.flags for s in signals) or rule is None
               or rule.baseline_documented else ReasonCode.BASELINE_UNKNOWN)
        if any("qualitative" in s.flags for s in signals):
            reason(ReasonCode.QUALITATIVE_ONLY)
    if rule is not None and not rule.baseline_documented:
        reason(ReasonCode.BASELINE_UNKNOWN)
        if state != ThreadState.OUTCOME_VERIFIED:
            state = ThreadState.AMBIGUOUS
    if ReasonCode.CONTRADICTORY_EVIDENCE in reasons and state in (
            ThreadState.NEW_SIGNAL, ThreadState.RESPONSE_DOCUMENTED, ThreadState.UNVERIFIED) or (
            verified_by is not None and verified_by.event_id in contradicted):
        state = ThreadState.AMBIGUOUS
        reason(ReasonCode.CONTRADICTORY_EVIDENCE)

    if state == ThreadState.RESPONSE_DOCUMENTED and last_response is not None:
        if as_of - last_response.event_time > window:
            state = ThreadState.UNVERIFIED
            reason(ReasonCode.RESPONSE_WITHOUT_OUTCOME)
        else:
            reason(ReasonCode.WITHIN_WINDOW)
    responded_since_signal = last_response is not None and last_response.event_time >= last_signal.event_time
    if not responded_since_signal and state in (ThreadState.NEW_SIGNAL, ThreadState.PERSISTENT_SIGNAL) and \
            as_of - last_signal.event_time > NO_RESPONSE_GRACE:
        reason(ReasonCode.NO_RESPONSE_DOCUMENTED)
    if state == ThreadState.OUTCOME_VERIFIED:
        reason(ReasonCode.OUTCOME_MET_RULE)

    done_after = [e for e in events if e.modality == Modality.DONE and (e.is_response or e.is_measured)]
    for p in plans:
        confirmed = any(d.kind == p.kind and d.event_time > p.event_time for d in done_after)
        if not confirmed and state != ThreadState.OUTCOME_VERIFIED and as_of - p.event_time > timedelta(hours=1):
            reason(ReasonCode.PLANNED_NOT_CONFIRMED)
            break

    shifts = list(dict.fromkeys(shift_label(e.event_time) for e in events if not e.duplicate_of))
    if len(shifts) > 1:
        reason(ReasonCode.CROSSED_SHIFTS)

    gaps = _gaps(events, first, as_of, window, draft.domain)
    return ConcernThread(
        thread_id=draft.thread_id, resident_id=draft.resident_id, domain=draft.domain, state=state,
        first_seen=first.event_time, last_seen=max(e.event_time for e in events), last_signal_at=last_signal.event_time,
        reason_codes=reasons, events=events, links=list(draft.links), steps=steps, gaps=gaps, shifts_spanned=shifts,
        review_rank=RANK[state], review_reason=_review_reason(state, reasons, last_signal, last_response, verified_by,
                                                              as_of, window, draft.domain),
        reviews=[r for r in (reviews or []) if r.thread_id == draft.thread_id and r.timestamp <= as_of],
        as_of=as_of,
    )


def _gaps(events: list[ClinicalEvent], first: ClinicalEvent, as_of: datetime, window: timedelta,
          domain: str) -> list[Gap]:
    """Stretches after a response (or an unanswered signal) with no measurement for longer than the window."""
    gaps: list[Gap] = []
    measured = [e for e in events if e.is_measured and not e.duplicate_of]
    anchors = [e for e in events if e.is_response]
    seen_after: set[str] = set()
    for a in anchors or [first]:
        nxt = next((m for m in measured if m.event_time > a.event_time), None)
        end = nxt.event_time if nxt else as_of
        if end - a.event_time <= window:
            continue
        key = nxt.event_id if nxt else "open"
        if key in seen_after:
            continue
        seen_after.add(key)
        what = "the response" if a.is_response else "the signal"
        tail = f"until {nxt.event_time:%a %H:%M}" if nxt else "up to now"
        span = _gap_text(a.event_time, end)
        gaps.append(Gap(after_event_id=a.event_id, start=a.event_time, end=end,
                        description=f"No {_measure_word(domain)} in the supplied records for {span} after {what} "
                                    f"({tail}). An evidence gap, not proof that care was missed."))
    return gaps


def _review_reason(state, reasons, last_signal, last_response, verified_by, as_of, window, domain) -> str:
    ago = _gap_text(last_signal.event_time, as_of)
    if state == ThreadState.PERSISTENT_SIGNAL:
        return ("Signal recurred after a documented response" if last_response else
                "Signal recurred; no response documented") + f" (latest {ago} ago)."
    if state == ThreadState.NEW_SIGNAL:
        return f"No response documented since the signal {ago} ago."
    if state == ThreadState.UNVERIFIED:
        return (f"Response documented {_gap_text(last_response.event_time, as_of)} ago; no {_measure_word(domain)} "
                f"since shows whether it worked.")
    if state == ThreadState.AMBIGUOUS:
        if ReasonCode.BASELINE_UNKNOWN in reasons:
            return "A change is described, but the care plan has no baseline to compare it with."
        if ReasonCode.CONTRADICTORY_EVIDENCE in reasons:
            return "A note and a measurement disagree."
        return "Described in a note without an amount; a measurement would settle it."
    if state == ThreadState.RESPONSE_DOCUMENTED:
        due = last_response.event_time + window
        return f"Response documented; follow-up {_measure_word(domain)} due by {due:%a %H:%M} (demonstration rule)."
    return f"Met the target at {verified_by.event_time:%a %H:%M}, within the demonstration rule."
