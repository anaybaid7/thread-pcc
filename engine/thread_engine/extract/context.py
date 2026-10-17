"""ConText-style extraction of care events from progress notes.

ConText (Harkema, Chapman et al., 2009) is the clinical-NLP algorithm behind NegEx: find a concept, then decide
from nearby trigger words whether it is negated, hypothetical, historical, or about someone else. This module applies
the same idea to long-term-care notes, where the distinctions that matter are:

    "Offered fluids"          an intervention, not evidence the resident drank
    "Res drank 300 mL"        an observation, compared with the resident's own target
    "Will reassess"           a plan, never evidence the reassessment happened
    "Didn't do well with drinks"   a worse observation with no amount: do not invent one
    "Day shift reports..."    relayed history: context, not a new signal
    "Roommate refused..."     about someone else: never attached to this resident

Every event keeps the exact character span it came from and the trigger words that decided its reading, so the UI
can show the care team why THREAD read a sentence the way it did.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from ..clock import shift_of
from ..model import (
    CarePlanRule,
    ClinicalEvent,
    Domain,
    EventKind,
    Extractor,
    Modality,
    Polarity,
    SourceRecord,
    Span,
)
from ..normalize import assist_label, measured_polarity, rule_for

ML_PER_CUP = 250
"""Stated conversion for 'a cup / glass / mug' when no amount is written. Marked approximate on the event."""

# ----------------------------------------------------------------------------------------------- lexicons
# Patterns are matched on lower-cased text with word boundaries. A longer phrase must come before any phrase it
# contains ("assistance provided" before "provided"), because alternation takes the first match.

_HYDRATION = [
    r"fluids?",
    r"drinks?",
    r"drank",
    r"drinking",
    r"water",
    r"juice",
    r"tea",
    r"coffee",
    r"decaf",
    r"milk",
    r"ginger ale",
    r"soda",
    r"pop",
    r"lassi",
    r"smoothie",
    r"sips?",
    r"cups?",
    r"mugs?",
    r"glass(?:es)?",
    r"bottle",
    r"hydrat\w*",
    r"(?<!food )(?<!meal )(?<!diet )intake",
    r"beverages?",
    r"thirsty",
    r"soif",
    r"ml",
    r"cc",
    r"litres?",
    r"liters?",
]
_MOBILITY = [
    r"walk\w*",
    r"ambulat\w*",
    r"gait",
    r"transfer\w*",
    r"walker",
    r"rollator",
    r"wheelchair",
    r"cane",
    r"balance",
    r"(?:un)?steady",
    r"stand(?:ing)?(?: up)?",
    r"getting up",
    r"get up",
    r"fall",
    r"fell",
    r"mobility",
    r"steps",
    r"call bell",
    r"bed (?:alarm|lowered)",
    r"recliner",
    r"halfway",
    r"legs?",
]

_INTERVENTION = [
    r"offered",
    r"offering",
    r"encouraged",
    r"encouraging",
    r"encourage",
    r"assisted",
    r"assistance provided",
    r"provided",
    r"set up",
    r"gave",
    r"given",
    r"prompted",
    r"cued",
    r"cueing",
    r"reminded",
    r"brought",
    r"refilled",
    r"placed",
    r"stayed with",
    r"adjusted",
    r"lowered",
    r"repositioned",
    r"applied",
    r"pushed fluids",
    r"push fluids",
    r"offer",
    r"assist with",
    r"helped",
    r"with assistance",
    r"w/ assist(?:ance)?",
]
_CONSUMPTION = [
    r"drank",
    r"(?<=not )drink",
    r"(?<=n't )drink",
    r"(?<=unable to )drink",
    r"drinking",
    r"consumed",
    r"finished",
    r"sipped",
    r"took",
    r"taking",
    r"had",
    r"intake",
]
_REFUSAL = [
    r"refused",
    r"refuses",
    r"refusing",
    r"declined",
    r"declines",
    r"pushed (?:the |her |his )?(?:cup|glass|drink) away",
    r"would not drink",
    r"wouldn't drink",
    r"spat out",
    r"turned away",
]
_ASSESSMENT = [r"assessed", r"reassessed", r"reassess", r"assess", r"reviewed", r"checked", r"examined", r"vitals"]
_ESCALATION = [
    r"reported to",
    r"notified",
    r"informed",
    r"paged",
    r"called (?:the )?(?:np|md|dr|physician|family|poa)",
    r"escalated",
    r"updated (?:the )?(?:np|md|rn|rpn|family|poa)",
]
_WORSE = [
    r"a few sips",
    r"few sips",
    r"minimal",
    r"poor(?:ly)?",
    r"little",
    r"low",
    r"less than usual",
    r"decreased",
    r"reduced",
    r"only made it",
    r"needed to sit",
    r"unsteady",
    r"wobbly",
    r"shuffl\w*",
    r"lost (?:her |his )?balance",
    r"near fall",
    r"fell",
    r"more tired",
    r"weaker",
    r"slower than usual",
    r"reluctant",
    r"not (?:drinking|walking) well",
]
_BETTER = [
    r"improved",
    r"improvement",
    r"much better",
    r"better",
    r"well",
    r"most of",
    r"all of",
    r"finished",
    r"good",
    r"steady",
    r"independent(?:ly)?",
    r"full",
]

_PLAN = [
    r"will",
    r"to be",
    r"plan(?:ned)? to",
    r"plan:",
    r"going to",
    r"continue to",
    r"please",
    r"needs to",
    r"should",
    r"to follow up",
    r"f/u",
    r"to monitor",
    r"monitor",
    r"to offer",
    r"to reassess",
    r"next round",
]
_HYPOTHETICAL = [r"if", r"in case", r"should (?:she|he|res) "]
_NEGATION = [
    r"no",
    r"not",
    r"denies",
    r"without",
    r"nil",
    r"did not",
    r"didn't",
    r"does not",
    r"doesn't",
    r"unable to",
    r"never",
    r"none",
]
_HEDGE = [
    r"seems?",
    r"appears?",
    r"possibly",
    r"maybe",
    r"might",
    r"unclear",
    r"not sure",
    r"\?",
    r"questionable",
    r"apparently",
]
_REPORTED = [
    r"per (?:psw|rpn|rn|family|daughter|son|staff)",
    r"(?:day|evening|night) shift reports?",
    r"(?:daughter|son|family|poa) (?:states|reports|says)",
    r"reports? that",
    r"as per",
]
_HISTORICAL = [
    r"yesterday",
    r"last night",
    r"earlier today",
    r"(?:day|evening|night) shift reports?",
    r"prior shift",
    r"previous shift",
]
_MORNING = [r"this am", r"this morning"]
_OTHER_SUBJECT = [r"roommate(?:'s)?", r"tablemate", r"(?:mrs|mr|ms)\.? [a-z]\b", r"another resident", r"other resident"]
_TERMINATION = [r"but", r"however", r"although", r"though", r"then"]

_NUM = {"one": 1, "two": 2, "three": 3, "a": 1, "an": 1, "half a": 0.5, "half": 0.5}
_QTY_ML = re.compile(
    r"(?P<approx>approx\.?|approximately|about|around|~|roughly)?\s*(?P<n>\d+(?:\.\d+)?)\s*"
    r"(?P<u>ml|cc|l|litres?|liters?)\b"
)
_QTY_CUP = re.compile(
    r"(?P<n>\d+(?:\.\d+)?|one|two|three|half a|a full|a)\s+(?:full\s+)?(?P<u>cups?|glass(?:es)?|mugs?)\b"
)
_ASSIST = re.compile(
    r"(?:(?P<a>\d|one|two)[ -]?(?:person |staff )?assist)|(?:assist(?:ance)? (?:x|of) ?(?P<b>\d|one|two))"
    r"|(?:(?P<c>\d|one|two) staff)"
)
_TIME = re.compile(r"(?:late entry for|at|@)\s*(?P<h>[01]?\d|2[0-3]):?(?P<m>[0-5]\d)\b(?!\s*(?:ml|cc|l\b|%))")
_REPEAT = re.compile(r"\bx\s?(?P<n>[2-9])\b")

# Abbreviations whose trailing period does not end a sentence.
_ABBREV = re.compile(r"\b(?:approx|res|mrs|mr|ms|dr|pt|w|e\.g|i\.e|a\.m|p\.m)\.$", re.I)


def _rx(words: list[str]) -> re.Pattern[str]:
    return re.compile(r"(?<![\w'])(?:" + "|".join(words) + r")(?![\w'])")


RX = {
    name: _rx(words)
    for name, words in {
        "hydration": _HYDRATION,
        "mobility": _MOBILITY,
        "intervention": _INTERVENTION,
        "consumption": _CONSUMPTION,
        "refusal": _REFUSAL,
        "assessment": _ASSESSMENT,
        "escalation": _ESCALATION,
        "worse": _WORSE,
        "better": _BETTER,
        "plan": _PLAN,
        "hypothetical": _HYPOTHETICAL,
        "negation": _NEGATION,
        "hedge": [w for w in _HEDGE if w != r"\?"],
        "reported": _REPORTED,
        "historical": _HISTORICAL,
        "morning": _MORNING,
        "other_subject": _OTHER_SUBJECT,
        "termination": _TERMINATION,
    }.items()
}


# ----------------------------------------------------------------------------------------------- segmentation


@dataclass
class Clause:
    start: int
    end: int
    text: str
    sentence_index: int


def sentences(text: str) -> list[tuple[int, int]]:
    """Sentence boundaries as character offsets. Keeps decimals and LTC abbreviations ('approx.', 'res.') intact."""
    out, start = [], 0
    for m in re.finditer(r"[.;!?](?=\s|$)|\n+", text):
        end = m.end()
        if m.group() == "." and _ABBREV.search(text[start:end]):
            continue
        if text[start:end].strip():
            out.append((start, end))
        start = end
    if text[start:].strip():
        out.append((start, len(text)))
    return out


def clauses(text: str) -> list[Clause]:
    """Split each sentence on contrastive terminations ('but', 'however', 'then'), which end a trigger's scope.
    The termination word itself belongs to neither clause."""
    out: list[Clause] = []
    for i, (s, e) in enumerate(sentences(text)):
        bounds = [(s, s)]
        for m in re.finditer(r",?\s+(?:but|however|although|then)\s+", text[s:e], re.I):
            bounds.append((s + m.start(), s + m.end()))
        bounds.append((e, e))
        for (_, a), (b, _) in zip(bounds, bounds[1:], strict=False):
            seg = text[a:b]
            lead = len(seg) - len(seg.lstrip(" ,;"))
            trail = len(seg.rstrip(" .;!\n"))
            if trail > lead:
                out.append(Clause(a + lead, a + trail, text[a + lead : a + trail], i))
    return out


# ----------------------------------------------------------------------------------------------- matching


@dataclass
class Cues:
    found: dict[str, list[re.Match[str]]] = field(default_factory=dict)

    def __call__(self, name: str) -> list[re.Match[str]]:
        return self.found.get(name, [])

    def any(self, name: str) -> bool:
        return bool(self.found.get(name))

    def words(self, name: str) -> str:
        return ", ".join(f"'{m.group().strip()}'" for m in self(name))


def _cues(low: str) -> Cues:
    c = Cues({name: list(rx.finditer(low)) for name, rx in RX.items()})
    c.found = {k: v for k, v in c.found.items() if v}
    # A question mark is a hedge too ("more tired than usual?").
    if "?" in low:
        c.found.setdefault("hedge", []).append(re.search(r"\?", low))  # type: ignore[arg-type]
    return c


def _negated(low: str, cue: re.Match[str], negations: list[re.Match[str]]) -> re.Match[str] | None:
    """NegEx-style: a negation trigger up to five words before the cue, with no termination word in between."""
    for n in negations:
        if n.end() > cue.start():
            continue
        between = low[n.end() : cue.start()]
        if len(between.split()) <= 5 and not RX["termination"].search(between) and "," not in between:
            return n
    return None


def _number(word: str) -> float:
    return float(_NUM[word]) if word in _NUM else float(word)


def _quantity(low: str) -> tuple[float, bool, str] | None:
    """(mL, approximate, cue) for the first amount in the clause. Explicit millilitres beat cup conversions."""
    if m := _QTY_ML.search(low):
        n, unit = float(m.group("n")), m.group("u")
        ml = n * 1000 if unit.startswith("l") and n < 10 else n
        return ml, bool(m.group("approx")), m.group().strip()
    if m := _QTY_CUP.search(low):
        word = m.group("n")
        n = 1.0 if word in ("a full", "a") else _number(word)
        return n * ML_PER_CUP, True, f"{m.group().strip()} ≈ {n * ML_PER_CUP:g} mL (assumed {ML_PER_CUP} mL per cup)"
    return None


def _assist(low: str) -> tuple[int, str] | None:
    if m := _ASSIST.search(low):
        word = m.group("a") or m.group("b") or m.group("c")
        return int(_number(word)), m.group().strip()
    return None


# ----------------------------------------------------------------------------------------------- extraction

_IMPERATIVE = re.compile(
    r"^(?:please\s+)?(?:offer|encourage|push|assist|provide|give|monitor|prompt|cue|remind|"
    r"reassess|assess|check|ensure|keep|continue)\b"
)
_DONE_HINT = re.compile(r"\b(?:res|resident|she|he|staff|psw)\b")


@dataclass
class _Reading:
    """Context shared by every event in one clause."""

    triggers: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    confidence: float = 0.9
    plan_at: int | None = None
    plan_why: str = ""
    hypothetical: str = ""

    def modality_at(self, pos: int) -> tuple[Modality, str | None]:
        """ConText scope: a plan trigger governs every cue after it in the clause."""
        if self.plan_at is not None and pos >= self.plan_at:
            return Modality.PLANNED, self.plan_why
        if self.hypothetical:
            return Modality.HYPOTHETICAL, self.hypothetical
        return Modality.DONE, None


def _domain(cues: Cues, carried: Domain | None) -> tuple[Domain | None, bool]:
    """(domain, inferred). Hydration and mobility words both present: whichever appears more often."""
    h, m = len(cues("hydration")), len(cues("mobility"))
    if h or m:
        return ("hydration" if h >= m else "mobility"), False
    return carried, carried is not None


def note_time_of(record: SourceRecord) -> datetime:
    """The note's own time unless the text names an earlier time explicitly ('Late entry for 11:30')."""
    if m := _TIME.search((record.text or "").lower()):
        explicit = record.event_time.replace(hour=int(m.group("h")), minute=int(m.group("m")))
        if explicit <= record.recorded_at:
            return explicit
    return record.event_time


def extract_note(
    record: SourceRecord, rules: list[CarePlanRule], extractor: Extractor = "context_rules"
) -> list[ClinicalEvent]:
    """All care events in one progress note, each tied to its span in the note."""
    text = record.text or ""
    events: list[ClinicalEvent] = []
    carried: Domain | None = None
    note_time = note_time_of(record)

    for clause in clauses(text):
        low = clause.text.lower()
        cues = _cues(low)
        r = _Reading()

        # Modality: planned from a trigger ('will', 'continue to') or an imperative instruction ('Encourage fluids.').
        if cues.any("plan"):
            first = cues("plan")[0]
            r.plan_at, r.plan_why = first.start(), f"planned: '{first.group()}'"
        elif (imp := _IMPERATIVE.match(low)) and not _DONE_HINT.search(low[: imp.end() + 1]):
            r.plan_at, r.plan_why = 0, f"planned: imperative '{imp.group()}' is an instruction, not a record of care"
        if cues.any("hypothetical"):
            r.hypothetical = f"hypothetical: {cues.words('hypothetical')}"

        # Experiencer and temporality.
        if cues.any("other_subject"):
            r.flags.append("other_subject")
            r.triggers.append(f"about someone else: {cues.words('other_subject')}")
        if cues.any("reported"):
            r.flags.append("reported_by_other")
            r.triggers.append(f"reported: {cues.words('reported')}")
            r.confidence -= 0.1
        if cues.any("historical") or (cues.any("morning") and record.event_time.hour >= 12):
            r.flags.append("historical")
            words = cues.words("historical") or f"{cues.words('morning')} in a {record.event_time:%H:%M} note"
            r.triggers.append(f"earlier shift: {words}")
        if cues.any("hedge"):
            r.flags.append("hedged")
            r.triggers.append(f"hedged: {cues.words('hedge')}")
            r.confidence -= 0.25
        if note_time != record.event_time:
            r.flags.append("time_from_text")

        domain, inferred = _domain(cues, carried)
        if domain and not inferred:
            carried = domain
        if inferred:
            r.confidence -= 0.2
            r.triggers.append(f"concern inferred from the previous sentence ({domain})")

        negs = cues("negation")
        span = Span(start=clause.start, end=clause.end, text=clause.text)

        def emit(
            kind: EventKind,
            polarity: Polarity,
            summary: str,
            pos: int,
            triggers: list[str],
            *,
            value: float | None = None,
            unit: str | None = None,
            approximate: bool = False,
            negated: str | None = None,
            flags: tuple[str, ...] = (),
            conf_bonus: float = 0.0,
            r: _Reading = r,
            domain: Domain | None = domain,
            span: Span = span,
        ) -> Modality:
            modality, why = r.modality_at(pos)
            trig = list(r.triggers) + ([why] if why else []) + triggers
            if negated:
                modality = Modality.NEGATED
                trig.append(f"negated: '{negated}'")
            events.append(
                ClinicalEvent(
                    event_id=f"{record.source_id}.{len(events) + 1}",
                    resident_id=record.resident_id,
                    domain=domain,
                    kind=kind,
                    modality=modality,
                    polarity=polarity,
                    event_time=note_time,
                    recorded_at=record.recorded_at,
                    shift=shift_of(note_time),
                    source_id=record.source_id,
                    source_type=record.source_type,
                    author=record.author,
                    author_role=record.author_role,
                    summary=summary,
                    span=span,
                    value=value,
                    unit=unit,
                    approximate=approximate,
                    extractor=extractor,
                    confidence=round(max(0.3, min(0.97, r.confidence + conf_bonus)), 2),
                    triggers=trig,
                    flags=list(r.flags) + list(flags) + (["approximate"] if approximate else []),
                )
            )
            return modality

        # Refusal: a clear signal in its own right ("Declined water when offered").
        for cue in cues("refusal"):
            if not _negated(low, cue, negs):
                emit(
                    EventKind.REFUSAL, Polarity.WORSE, "Refusal documented", cue.start(), [f"refusal: '{cue.group()}'"]
                )
                break

        # What staff did, or plan to do.
        for kind, name, label in (
            (EventKind.INTERVENTION, "intervention", "Response documented"),
            (EventKind.ASSESSMENT, "assessment", "Assessment documented"),
            (EventKind.ESCALATION, "escalation", "Escalation documented"),
        ):
            if not (hits := cues(name)):
                continue
            neg = _negated(low, hits[0], negs)
            trig = [f"{name}: {cues.words(name)}"]
            if rep := _REPEAT.search(low):
                trig.append(f"repeated x{rep.group('n')}")
            modality, _ = r.modality_at(hits[0].start())
            if neg:
                label = label.replace("documented", "documented as not done")
            elif modality == Modality.PLANNED:
                label = {
                    "intervention": "Response planned, not confirmed",
                    "assessment": "Reassessment planned, not confirmed",
                    "escalation": "Escalation planned, not confirmed",
                }[name]
            emit(kind, Polarity.NEUTRAL, label, hits[0].start(), trig, negated=neg.group() if neg else None)

        rule = rule_for(rules, record.resident_id, domain)

        # Hydration: an amount actually taken, or how the drinking went. An amount next to 'offered' is not intake.
        if domain == "hydration":
            consumed = [c for c in cues("consumption") if c.group() != "had" or cues.any("hydration")]
            worse = cues("worse")
            better = [b for b in cues("better") if not (b.group() == "full" and not consumed)]
            neg_consumed = next((n for c in consumed if (n := _negated(low, c, negs))), None)
            neg_better = next((n for b in better if (n := _negated(low, b, negs))), None)
            qty = _quantity(low) if consumed and not neg_consumed else None
            anchor = min((m.start() for m in consumed + worse + better), default=0)
            trig: list[str] = [f"consumption: {cues.words('consumption')}"] if consumed else []
            value, approx, polarity, summary = None, False, Polarity.NEUTRAL, "Drinking described, no amount"
            if qty:
                value, approx, qcue = qty
                trig.append(f"amount: {qcue}")
                polarity = measured_polarity(rule, value)
                summary = f"Note reports {'~' if approx else ''}{value:g} mL taken"
                if rule and rule.baseline_documented:
                    summary += f" (target ≥ {rule.threshold:g} mL)"
            elif neg_consumed or neg_better:
                polarity = Polarity.WORSE
                trig.append(f"'{(neg_consumed or neg_better).group()}' + drinking → low intake")
                summary = "Low intake described, no amount"
            elif worse:
                polarity = Polarity.WORSE
                trig.append(f"worse: {cues.words('worse')}")
                summary = "Low intake described, no amount"
            elif better:
                polarity = Polarity.BETTER
                trig.append(f"better: {', '.join(repr(b.group()) for b in better)}")
                summary = "Better intake described, no amount"
            modality, _ = r.modality_at(anchor)
            if modality == Modality.DONE and (consumed or polarity != Polarity.NEUTRAL):
                qualitative = ("qualitative",) if value is None and polarity != Polarity.NEUTRAL else ()
                emit(
                    EventKind.OBSERVATION,
                    polarity,
                    summary,
                    anchor,
                    trig,
                    value=value,
                    unit="mL" if value is not None else None,
                    approximate=approx,
                    flags=qualitative,
                    conf_bonus=0.05 if value is not None and not approx else 0.0,
                )

        # Mobility: an assist level, or how the walking went.
        if domain == "mobility":
            worse = [w for w in cues("worse") if not _negated(low, w, negs)]
            better = [b for b in cues("better") if not _negated(low, b, negs) and b.group() != "full"]
            assist = _assist(low)
            walked = re.search(r"\b(?:walked|ambulated|transferred|stood)\b", low)
            anchor = min([m.start() for m in worse + better] + ([walked.start()] if walked else []), default=0)
            if (worse or better or assist or walked) and r.modality_at(anchor)[0] == Modality.DONE:
                trig = []
                value = None
                if assist:
                    value = float(assist[0])
                    trig.append(f"assist level: '{assist[1]}'")
                    polarity = measured_polarity(rule, value)
                    if polarity == Polarity.UNCLEAR and worse:
                        polarity = Polarity.WORSE
                    summary = f"Note reports {assist_label(value)}"
                elif worse:
                    polarity, summary = Polarity.WORSE, "Reduced mobility described"
                elif better:
                    polarity, summary = Polarity.BETTER, "Usual mobility described"
                else:
                    polarity, summary = Polarity.NEUTRAL, "Walking described"
                if worse:
                    trig.append(f"worse: {', '.join(repr(w.group()) for w in worse)}")
                elif better and not assist:
                    trig.append(f"better: {', '.join(repr(b.group()) for b in better)}")
                qualitative = ("qualitative",) if value is None and polarity != Polarity.NEUTRAL else ()
                emit(
                    EventKind.OBSERVATION,
                    polarity,
                    summary,
                    anchor,
                    trig,
                    value=value,
                    unit="staff assist" if value is not None else None,
                    flags=qualitative,
                )

    return events


def note_events(records: list[SourceRecord], rules: list[CarePlanRule]) -> list[ClinicalEvent]:
    out: list[ClinicalEvent] = []
    for rec in records:
        if rec.source_type == "progress_note" and rec.text:
            out.extend(extract_note(rec, rules))
    return out
