"""A deliberately naive keyword reader: the baseline THREAD is measured against.

It is what a quick prototype would do: find fluid or walking words, read any number as an amount, treat 'improved',
'better' or 'well' as a good outcome, and ignore negation, plans, hedges and who the sentence is about. It exists so
the evaluation can show which mistakes the ConText reading prevents, not as a straw man: each rule here is the
obvious first thing to write.
"""

from __future__ import annotations

import re

from ..clock import shift_of
from ..model import CarePlanRule, ClinicalEvent, EventKind, Modality, Polarity, SourceRecord, Span
from ..normalize import rule_for
from .context import sentences

_FLUID = re.compile(r"\b(fluids?|drinks?|drank|water|juice|tea|coffee|intake|sips?|cup|mug|glass|ml)\b", re.I)
_WALK = re.compile(r"\b(walk\w*|gait|transfer\w*|walker|rollator|unsteady|balance|assist)\b", re.I)
_ACTION = re.compile(r"\b(offer\w*|encourag\w*|assist\w*|provid\w*|set up|reassess\w*|assess\w*|adjust\w*)\b", re.I)
_REFUSE = re.compile(r"\b(refus\w*|declin\w*)\b", re.I)
_GOOD = re.compile(r"\b(improv\w*|better|well|good|finished|steady)\b", re.I)
_BAD = re.compile(r"\b(low|poor\w*|few sips|minimal|little|unsteady|halfway|tired)\b", re.I)
_ML = re.compile(r"(\d+(?:\.\d+)?)\s*ml\b", re.I)


def _read(sentence: str) -> list[tuple[EventKind, Polarity, float | None, str]]:
    domain_fluid, domain_walk = bool(_FLUID.search(sentence)), bool(_WALK.search(sentence))
    if not (domain_fluid or domain_walk):
        return []
    out = []
    if _ACTION.search(sentence):
        out.append((EventKind.INTERVENTION, Polarity.NEUTRAL, None, "action word → response done"))
    if _REFUSE.search(sentence):
        out.append((EventKind.REFUSAL, Polarity.WORSE, None, "refus/declin → refusal"))
    if m := _ML.search(sentence):
        out.append((EventKind.OBSERVATION, Polarity.MEETS_TARGET, float(m.group(1)), f"'{m.group()}' → intake amount"))
    elif good := _GOOD.search(sentence):
        out.append((EventKind.OBSERVATION, Polarity.MEETS_TARGET, None, f"'{good.group()}' → good outcome"))
    elif bad := _BAD.search(sentence):
        out.append((EventKind.OBSERVATION, Polarity.WORSE, None, f"'{bad.group()}' → low"))
    return out


def keyword_events(records: list[SourceRecord], rules: list[CarePlanRule]) -> list[ClinicalEvent]:
    events: list[ClinicalEvent] = []
    for rec in records:
        if rec.source_type != "progress_note" or not rec.text:
            continue
        n = 0
        for start, end in sentences(rec.text):
            text = rec.text[start:end].strip()
            domain = "hydration" if _FLUID.search(text) else "mobility"
            rule = rule_for(rules, rec.resident_id, domain)
            for kind, polarity, value, why in _read(text):
                if kind == EventKind.OBSERVATION and polarity == Polarity.MEETS_TARGET and rule:
                    if value is None:
                        value = rule.threshold  # "drank well" is read as an adequate amount
                    elif not rule.meets(value):
                        polarity = Polarity.BELOW_TARGET
                n += 1
                events.append(ClinicalEvent(
                    event_id=f"{rec.source_id}.k{n}", resident_id=rec.resident_id, domain=domain, kind=kind,
                    modality=Modality.DONE, polarity=polarity, event_time=rec.event_time,
                    recorded_at=rec.recorded_at, shift=shift_of(rec.event_time), source_id=rec.source_id,
                    source_type=rec.source_type, author=rec.author, author_role=rec.author_role,
                    summary=why, span=Span(start=start, end=start + len(text), text=text),
                    value=value,
                    unit=("mL" if domain == "hydration" else "staff assist") if value is not None else None,
                    extractor="keyword", confidence=0.9, triggers=[why],
                ))
    return events


def keyword_reading(text: str, resident_id: str = "") -> list[dict]:
    """What the keyword reader concludes from each sentence, for the Note lab's side-by-side."""
    out = []
    for start, end in sentences(text):
        s = text[start:end].strip()
        for kind, polarity, value, why in _read(s):
            out.append(dict(sentence=s, kind=kind.value, polarity=polarity.value, value=value, why=why))
    return out
