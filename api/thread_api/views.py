"""Response builders: pure functions of the stored records, shared by the API and the static Pages snapshot."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from thread_engine import facility
from thread_engine.clock import DEMO_NOW, HANDOVERS, handover_label, shift_label
from thread_engine.extract import llm
from thread_engine.extract.context import extract_note
from thread_engine.extract.keyword import keyword_reading
from thread_engine.link import Unlinked
from thread_engine.model import (
    NEEDS_REVIEW,
    ClinicalEvent,
    ConcernThread,
    ReviewAction,
    SourceRecord,
    ThreadState,
)
from thread_engine.pipeline import events_from, threads_at

DOMAIN_LABEL = {"hydration": "Fluid intake", "mobility": "Mobility"}
STATE_LABEL = {
    "persistent_signal": "Persistent signal",
    "new_signal": "New signal",
    "unverified": "Unverified",
    "ambiguous": "Ambiguous",
    "response_documented": "Response documented",
    "outcome_verified": "Outcome verified",
}
REASON_LABEL = {
    "recurrent_signal": "Recurred",
    "no_response_documented": "No response since last signal",
    "response_without_outcome": "Response, no outcome",
    "planned_not_confirmed": "Plan not confirmed",
    "qualitative_only": "No measurement",
    "contradictory_evidence": "Contradictory evidence",
    "ambiguous_note": "Unclear note",
    "baseline_unknown": "No baseline",
    "refusal_documented": "Refusal",
    "late_entry": "Late entry",
    "duplicate_collapsed": "Duplicate collapsed",
    "crossed_shifts": "Crossed shifts",
    "outcome_met_rule": "Met target",
    "within_window": "In follow-up window",
}


def dump(model) -> Any:
    return model.model_dump(mode="json")


@dataclass
class World:
    """Everything a view needs, computed once per request."""

    records: list[SourceRecord]
    reviews: list[ReviewAction]
    as_of: datetime
    now: datetime
    handovers: list[dict] = field(default_factory=list)
    _events: list[ClinicalEvent] | None = None
    _cache: dict[datetime, tuple[list[ConcernThread], list[Unlinked]]] = field(default_factory=dict)

    @property
    def events(self) -> list[ClinicalEvent]:
        if self._events is None:
            self._events = events_from(self.records, facility.CARE_PLAN)
        return self._events

    def threads(self, as_of: datetime | None = None) -> tuple[list[ConcernThread], list[Unlinked]]:
        t = as_of or self.as_of
        if t not in self._cache:
            self._cache[t] = threads_at(self.records, facility.CARE_PLAN, t, self.reviews, events=self.events,
                                        residents=facility.RESIDENTS)
        return self._cache[t]

    def checkpoints(self) -> list[datetime]:
        """Handover times up to now, then now."""
        points = [h for h in HANDOVERS if h < self.now and h != DEMO_NOW] + [self.now]
        if DEMO_NOW < self.now:
            points.insert(-1, DEMO_NOW)
        return points


def resident_card(rid: str) -> dict:
    r = facility.resident(rid)
    return dict(resident_id=r.resident_id, name=r.display_name, preferred_name=r.preferred_name, room=r.room,
                wing=r.wing, age=r.age)


def checkpoint_label(t: datetime, now: datetime) -> str:
    return f"{t:%a %H:%M} (now)" if t == now else handover_label(t) if t in HANDOVERS else f"{t:%a %H:%M}"


def meta(world: World) -> dict:
    return dict(
        facility=facility.FACILITY,
        wings=facility.WINGS,
        now=world.now.isoformat(),
        as_of=world.as_of.isoformat(),
        shift=shift_label(world.as_of),
        checkpoints=[dict(at=t.isoformat(), label=checkpoint_label(t, world.now)) for t in world.checkpoints()],
        residents=len(facility.RESIDENTS),
        synthetic=True,
        llm=llm_status(),
        demonstration_rule="A measurement meeting the care-plan target within 8 h of the documented response "
                           "(12 h for mobility) counts as verified. Demonstration rule, not clinical guidance.",
    )


def summary(t: ConcernThread) -> dict:
    counted = [e for e in t.events if not e.duplicate_of and "historical" not in e.flags]
    reviewed = [r for r in t.reviews if r.action_type == "mark_reviewed"]
    return dict(
        thread_id=t.thread_id,
        resident=resident_card(t.resident_id),
        domain=t.domain,
        domain_label=DOMAIN_LABEL[t.domain],
        state=t.state.value,
        state_label=STATE_LABEL[t.state.value],
        needs_review=t.needs_review,
        review_rank=t.review_rank,
        review_reason=t.review_reason,
        reasons=[dict(code=c.value, label=REASON_LABEL[c.value]) for c in t.reason_codes],
        counts=dict(
            signals=sum(e.is_signal for e in counted),
            responses=sum(e.is_response for e in counted),
            plans=sum(e.modality.value == "planned" for e in counted),
            gaps=len(t.gaps),
            notes=len({e.source_id for e in t.events if e.source_type == "progress_note"}),
        ),
        first_seen=t.first_seen.isoformat(),
        last_signal_at=t.last_signal_at.isoformat(),
        last_seen=t.last_seen.isoformat(),
        shifts_spanned=t.shifts_spanned,
        headline=t.explanation.sentences[0].text if t.explanation and t.explanation.sentences else "",
        last_reviewed=dump(reviewed[-1]) if reviewed else None,
    )


def unlinked_item(u: Unlinked) -> dict:
    return dict(event=dump(u.event), reason=u.reason, resident=resident_card(u.event.resident_id))


def queue(world: World) -> dict:
    threads, unlinked = world.threads()
    open_ = [t for t in threads if t.needs_review]
    by_state = {s.value: sum(t.state == s for t in threads) for s in ThreadState}
    return dict(
        as_of=world.as_of.isoformat(),
        counts=dict(open=len(open_), unverified=by_state["unverified"],
                    new_signals=by_state["new_signal"], persistent=by_state["persistent_signal"],
                    ambiguous=by_state["ambiguous"], watching=by_state["response_documented"],
                    verified=by_state["outcome_verified"], unlinked=len(unlinked),
                    residents=len(facility.RESIDENTS)),
        items=[summary(t) for t in threads if t.needs_review],
        watching=[summary(t) for t in threads if t.state == ThreadState.RESPONSE_DOCUMENTED],
        closed=[summary(t) for t in threads if t.state == ThreadState.OUTCOME_VERIFIED],
        unlinked=[unlinked_item(u) for u in unlinked],
    )


def labels_for(t: ConcernThread) -> dict[str, str]:
    """Short labels E1, E2... in time order, for citations a nurse can read aloud."""
    return {e.event_id: f"E{i}" for i, e in enumerate(t.events, 1)}


def find_thread(world: World, thread_id: str, as_of: datetime | None = None) -> ConcernThread | None:
    threads, _ = world.threads(as_of)
    return next((t for t in threads if t.thread_id == thread_id), None)


def thread_detail(world: World, thread_id: str) -> dict | None:
    t = find_thread(world, thread_id)
    if t is None:
        return None
    rid = t.resident_id
    rule = next((r for r in facility.rules_for(rid) if r.domain == t.domain), None)
    replay = []
    for point in world.checkpoints():
        then = find_thread(world, thread_id, point)
        replay.append(dict(at=point.isoformat(), label=checkpoint_label(point, world.now),
                           state=then.state.value if then else None,
                           state_label=STATE_LABEL[then.state.value] if then else "Not yet open",
                           events=len(then.events) if then else 0))
    sources = [r for r in world.records if r.resident_id == rid and r.recorded_at <= world.as_of]
    used = {e.source_id for e in t.events}
    return dict(
        summary=summary(t),
        thread=dump(t),
        labels=labels_for(t),
        resident=dump(facility.resident(rid)),
        rule=dump(rule) if rule else None,
        replay=replay,
        sources=[dict(**dump(r), in_thread=r.source_id in used) for r in sources],
    )


def handover(world: World) -> dict:
    threads, unlinked = world.threads()
    points = [p for p in world.checkpoints() if p < world.as_of]
    previous = points[-1] if points else None
    items = []
    for t in [t for t in threads if t.needs_review][:5]:
        labels = labels_for(t)
        new = [e for e in t.events if previous and e.recorded_at > previous and not e.duplicate_of]
        items.append(dict(
            **summary(t),
            sentences=[dict(text=s.text, cites=[labels[c] for c in s.cites], event_ids=s.cites)
                       for s in t.explanation.sentences],
            next_step=t.explanation.next_step.text,
            new_since=[dict(label=labels[e.event_id], time=e.event_time.isoformat(), summary=e.summary,
                            author=e.author) for e in new],
        ))
    more = max(0, sum(t.needs_review for t in threads) - len(items))
    closed = [summary(t) for t in threads if t.state == ThreadState.OUTCOME_VERIFIED
              and (previous is None or t.last_seen > previous)]
    saved = [h for h in world.handovers if h["as_of"] == world.as_of.isoformat()]
    return dict(
        as_of=world.as_of.isoformat(),
        label=checkpoint_label(world.as_of, world.now),
        previous=previous.isoformat() if previous else None,
        previous_label=checkpoint_label(previous, world.now) if previous else None,
        items=items,
        more=more,
        watching=[summary(t) for t in threads if t.state == ThreadState.RESPONSE_DOCUMENTED],
        closed=closed,
        unlinked=len(unlinked),
        saved=saved[-1] if saved else None,
    )


def residents(world: World) -> list[dict]:
    threads, _ = world.threads()
    out = []
    for r in facility.RESIDENTS:
        mine = [t for t in threads if t.resident_id == r.resident_id]
        out.append(dict(**resident_card(r.resident_id),
                        threads=[dict(thread_id=t.thread_id, domain=t.domain, state=t.state.value) for t in mine],
                        needs_review=any(t.state in NEEDS_REVIEW for t in mine)))
    return out


def llm_status() -> dict:
    return dict(available=bool(os.environ.get("ANTHROPIC_API_KEY")), model=llm.MODEL)


def lab_extract(text: str, resident_id: str, at: datetime, use_llm: bool = False) -> dict:
    rec = SourceRecord(source_id="N-LAB", resident_id=resident_id, source_type="progress_note", event_time=at,
                       recorded_at=at, author="Note lab", author_role="RN", text=text)
    events = extract_note(rec, facility.CARE_PLAN)
    out = dict(text=text, resident=resident_card(resident_id), events=[dump(e) for e in events],
               keyword=keyword_reading(text, resident_id), llm=None)
    proposals = llm.cached(text)
    if proposals is None and use_llm and llm_status()["available"]:
        try:
            proposals = llm.call_model(text)
        except Exception as exc:  # network or API error: the rules reading still stands
            out["llm"] = dict(error=f"Language model unavailable: {type(exc).__name__}", events=[], rejected=[])
            return out
    if proposals is not None:
        rejected: list[llm.Rejection] = []
        ev = llm.to_events(rec, proposals, facility.CARE_PLAN, rejected)
        out["llm"] = dict(model=llm.MODEL, events=[dump(e) for e in ev], rejected=[dump(r) for r in rejected])
    return out


LAB_SAMPLES = [
    ("offered", "Offered is not drank", "R214",
     "Offered 200 mL of water; res took a few sips then pushed the cup away.",
     "A keyword reader counts 200 mL as intake. THREAD reads an offer, a low observation and a refusal."),
    ("plan", "A plan is not an action", "R216",
     "Will reassess fluid intake after supper. Encourage fluids.",
     "Both sentences are instructions. Neither is evidence that anything happened."),
    ("no-improvement", "Negation flips the meaning", "R226",
     "Day shift reports res had low fluids this AM. No improvement in intake noted this evening.",
     "'Improvement' with 'no' in front is low intake, and the relayed morning report is not counted twice."),
    ("roommate", "About someone else", "R316",
     "Roommate refused her afternoon drink, reported to RPN.",
     "THREAD keeps this out of Mabel's record and leaves it for a person."),
    ("vague", "Vague stays vague", "R222",
     "Didn't do well with drinks today, seems more tired?",
     "Low intake with no amount, hedged: THREAD asks for a measurement instead of inventing one."),
    ("closes", "The note that closes Rosa's thread", "R214",
     "Res drank approx 300 mL of iced tea with cueing at lunch, blue cup.",
     "An amount actually taken that meets Rosa's 250 mL target. Add it to her record and watch the thread close."),
]


def lab_samples(at: datetime) -> list[dict]:
    return [dict(id=i, title=t, resident_id=rid, text=text, why=why, result=lab_extract(text, rid, at))
            for i, t, rid, text, why in LAB_SAMPLES]
