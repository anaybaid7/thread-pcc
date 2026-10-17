"""Evidence-cited explanations, a claim validator and a language guard.

The explanation is built only from facts already in the thread. Every sentence cites the events it rests on, and the
validator rejects any sentence that cites nothing, cites an event that is not in the thread, uses a number or time
that is not in the cited evidence, or uses diagnostic or blaming language. The suggested next step is always a
verification step drawn from the resident's own care plan, never a treatment.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from .model import (
    CarePlanRule,
    CitedSentence,
    ClinicalEvent,
    ConcernThread,
    EventKind,
    Explanation,
    Modality,
    Polarity,
    ReasonCode,
    Relationship,
    Resident,
    ThreadState,
    Validation,
)
from .normalize import assist_label

BANNED = [
    r"dehydrat\w*", r"sepsis", r"septic", r"uti\b", r"urinary tract infection", r"infection", r"delirium",
    r"diagnos\w*", r"neglect\w*", r"negligen\w*", r"fail(?:ed|ure|s)?\b", r"missed care", r"emergency",
    r"deteriorat\w*", r"at risk of", r"should have", r"blame\w*", r"fault",
]
_BANNED = re.compile(r"\b(?:" + "|".join(BANNED) + r")", re.I)
_NUMBER = re.compile(r"\b\d{1,2}:\d{2}\b|\b\d+(?:\.\d+)?\b")
_WORDS = {1: "once", 2: "twice", 3: "three times", 4: "four times"}
_COUNT = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}


def _t(e: ClinicalEvent) -> str:
    return f"{e.event_time:%a %H:%M}"


def _times(n: int) -> str:
    return _WORDS.get(n, "several times")


def _quote(e: ClinicalEvent, limit: int = 70) -> str:
    text = (e.span.text if e.span else e.summary).strip().rstrip(".")
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _value(e: ClinicalEvent) -> str:
    if e.unit == "staff assist" and e.value is not None:
        return assist_label(e.value)
    return f"{e.value:g} {e.unit}"


def explain(thread: ConcernThread, resident: Resident | None, rule: CarePlanRule | None) -> Explanation:
    by_id = {e.event_id: e for e in thread.events}
    counted = [e for e in thread.events if not e.duplicate_of and "historical" not in e.flags]
    signals = [e for e in counted if e.is_signal]
    measured = [e for e in signals if e.value is not None and e.polarity == Polarity.BELOW_TARGET]
    refusals = [e for e in signals if e.kind == EventKind.REFUSAL]
    vague = [e for e in signals if e not in measured and e not in refusals]
    steps = {s.event_id: s.role for s in thread.steps}
    responses = [e for e in counted if e.is_response and steps.get(e.event_id) == "response"]
    plans = [e for e in counted if e.modality == Modality.PLANNED]
    outcome = next((by_id[s.event_id] for s in thread.steps if s.role == "outcome"), None)
    hydration = thread.domain == "hydration"
    target = ""
    if rule and rule.baseline_documented:
        target = f"the {rule.threshold:g} mL target" if hydration else f"the usual {assist_label(rule.threshold)} level"
    out: list[CitedSentence] = []

    def say(text: str, events: Iterable[ClinicalEvent]) -> None:
        out.append(CitedSentence(text=text, cites=[e.event_id for e in events]))

    if measured:
        what = "Fluid rounds below" if hydration else "Mobility checks worse than"
        if len(measured) == 1:
            what = "A fluid round below" if hydration else "A mobility check worse than"
        listed = "; ".join(f"{_value(e)} {_t(e)}" for e in measured)
        say(f"{what} {target or 'the care plan'} {'was' if len(measured) == 1 else 'were'} recorded "
            f"{_times(len(measured))} ({listed}).", measured)
    if refusals:
        say(f"A refusal was documented ({'; '.join(_t(e) for e in refusals)}: \"{_quote(refusals[-1], 45)}\").",
            refusals)
    if vague:
        about = "low intake" if hydration else "a change in mobility"
        say(f"A note describes {about} without a measurement ({_t(vague[0])}: \"{_quote(vague[0], 60)}\").", vague[:1])

    if responses:
        first = responses[0]
        extra = len(responses) - 1
        more = f", and {_COUNT.get(extra, 'several')} more later" if extra else ""
        say(f"A response was documented {_t(first)} (\"{_quote(first, 55)}\"){more}.", responses)
    elif thread.state != ThreadState.OUTCOME_VERIFIED:
        say(f"No response is documented after the signal ({_t(signals[-1] if signals else thread.events[0])}).",
            signals[-1:] or thread.events[:1])

    unconfirmed = [p for p in plans if ReasonCode.PLANNED_NOT_CONFIRMED in thread.reason_codes
                   and not any(e.kind == p.kind and e.is_response and e.event_time > p.event_time for e in counted)]
    if unconfirmed:
        say(f"A plan written {_t(unconfirmed[0])} (\"{_quote(unconfirmed[0], 55)}\") has no later entry confirming "
            "it happened.", unconfirmed[:1])

    contradictions = [link for link in thread.links if link.relationship == Relationship.CONTRADICTS]
    for link in contradictions[:1]:
        a, b = by_id[link.source_event_id], by_id[link.target_event_id]
        note, meas = (a, b) if a.value is None else (b, a)
        say(f"A note {_t(note)} describes improvement while the round {_t(meas)} recorded {_value(meas)}; "
            "both are shown and neither is chosen.", [note, meas])

    late = [e for e in counted if "late_entry" in e.flags]
    for e in late[:1]:
        say(f"The {e.event_time:%H:%M} entry was recorded {e.recorded_at:%a %H:%M}, so earlier handovers could not "
            "have seen it.", [e])

    dups = [e for e in thread.events if e.duplicate_of]
    if dups:
        say("A re-imported round was counted once, not twice.", dups)

    if thread.state == ThreadState.OUTCOME_VERIFIED and outcome:
        how = "checked at the bedside" if outcome.source_type == "verification" else "within the demonstration rule"
        kind = "round" if outcome.source_type == "fluid_round" else "check" if outcome.source_type != "progress_note" \
            else "measurement"
        say(f"A later {kind} met the target ({_value(outcome)} {_t(outcome)}), {how}.",
            [outcome])
    elif thread.state in (ThreadState.UNVERIFIED, ThreadState.PERSISTENT_SIGNAL) and responses:
        anchor = next((by_id[g.after_event_id] for g in thread.gaps), responses[-1])
        improved = "intake improved" if hydration else "mobility returned to usual"
        say(f"The supplied records do not establish that {improved} after the response.", [anchor])
    elif thread.state == ThreadState.RESPONSE_DOCUMENTED and responses:
        say(f"The follow-up window is still open (response {_t(responses[-1])}).", responses[-1:])
    if ReasonCode.BASELINE_UNKNOWN in thread.reason_codes:
        say("The care plan does not document a usual level, so the described change cannot be compared with it.",
            (vague or signals)[:1])

    sentences = out
    next_step = CitedSentence(text=next_step_for(thread, resident, rule))
    return Explanation(sentences=sentences, next_step=next_step,
                       validation=validate(sentences, next_step, thread, rule))


def next_step_for(thread: ConcernThread, resident: Resident | None, rule: CarePlanRule | None) -> str:
    name = (resident.preferred_name or resident.display_name.split()[0]) if resident else "the resident"
    personal = ""
    if resident and thread.domain == "hydration" and resident.preferences:
        personal = f" Care plan: {resident.preferences[0][0].lower()}{resident.preferences[0][1:]}"
        if resident.communication:
            personal += f"; {resident.communication[0][0].lower()}{resident.communication[0][1:]}"
        personal += "."
    hydration = thread.domain == "hydration"
    current = "current intake" if hydration else "current mobility and assist level"
    match thread.state:
        case ThreadState.OUTCOME_VERIFIED:
            return "No action from this thread unless new evidence appears."
        case ThreadState.AMBIGUOUS if ReasonCode.BASELINE_UNKNOWN in thread.reason_codes:
            return (f"Confirm {name}'s usual walking distance and assist level, and whether this change has been "
                    "assessed.")
        case ThreadState.AMBIGUOUS if ReasonCode.CONTRADICTORY_EVIDENCE in thread.reason_codes:
            return f"Check {current} directly with {name}; the note and the measurement disagree.{personal}"
        case ThreadState.AMBIGUOUS:
            return f"Measure {current} rather than relying on the note.{personal}"
        case ThreadState.NEW_SIGNAL:
            return (f"Check whether a response was given but not documented, and verify {current} with {name}."
                    f"{personal}")
        case ThreadState.RESPONSE_DOCUMENTED:
            return f"Record the next {'fluid round' if hydration else 'mobility check'} so the outcome is visible."
        case _:
            return f"Verify {current} with {name} and follow the existing care plan.{personal}"


def _allowed_numbers(cites: list[ClinicalEvent], rule: CarePlanRule | None) -> set[str]:
    allowed: set[str] = set()
    for e in cites:
        allowed |= {f"{e.event_time:%H:%M}", f"{e.recorded_at:%H:%M}"}
        if e.value is not None:
            allowed.add(f"{e.value:g}")
        if e.span:
            allowed |= set(_NUMBER.findall(e.span.text))
    if rule:
        allowed.add(f"{rule.threshold:g}")
    return allowed


def validate(sentences: list[CitedSentence], next_step: CitedSentence, thread: ConcernThread,
             rule: CarePlanRule | None) -> Validation:
    """Reject unsupported claims. Applied to template output and to anything a language model writes."""
    by_id = {e.event_id: e for e in thread.events}
    issues: list[str] = []
    for i, s in enumerate(sentences, 1):
        if not s.cites:
            issues.append(f"Sentence {i} cites no evidence.")
            continue
        missing = [c for c in s.cites if c not in by_id]
        if missing:
            issues.append(f"Sentence {i} cites events not in this thread: {', '.join(missing)}.")
            continue
        allowed = _allowed_numbers([by_id[c] for c in s.cites], rule)
        for n in _NUMBER.findall(s.text):
            if n not in allowed:
                issues.append(f"Sentence {i} states '{n}', which is not in the cited evidence.")
    for i, s in enumerate([*sentences, next_step], 1):
        if m := _BANNED.search(s.text):
            issues.append(f"Sentence {i} uses '{m.group()}': diagnostic or blaming language is not allowed.")
    if thread.state != ThreadState.OUTCOME_VERIFIED and re.search(r"\bresolved\b", " ".join(x.text for x in sentences),
                                                                    re.I):
        issues.append("Says 'resolved' although the outcome is not verified.")
    return Validation(ok=not issues, issues=issues)

