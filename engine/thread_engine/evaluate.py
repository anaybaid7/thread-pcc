"""Evaluation: the same state machine fed by different readers of the notes.

    structured_only   ignores notes entirely (what a measurement-only dashboard sees)
    keyword           the naive keyword reader in extract/keyword.py
    thread            the ConText-style reader
    llm               a language-model reader, when cached results exist (extract/llm.py)

Reported per split, because the held-out phrasings are the honest test. This is prototype evaluation on synthetic
scenarios, not clinical validation.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field

from .extract.context import note_events
from .extract.keyword import keyword_events
from .model import NEEDS_REVIEW, ClinicalEvent, ThreadState
from .pipeline import NoteExtractor, events_from, threads_at
from .scenarios import Gold, Scenario, all_scenarios

SCORED_LINKS = {"responds_to", "recurs", "contradicts", "duplicates", "plans_for"}


def polarity_class(p: str) -> str:
    return "low" if p in ("below_target", "worse") else "ok" if p in ("meets_target", "better") else "neutral"


def event_key(e: ClinicalEvent) -> Gold:
    return (e.kind.value, e.modality.value, polarity_class(e.polarity.value))


@dataclass
class Outcome:
    scenario: Scenario
    state: ThreadState | None
    needs_review: bool
    links: set[tuple[str, str, str]]
    note_events: dict[str, list[Gold]]
    sentences: int
    invalid_sentences: int
    issues: list[str]
    before_state: ThreadState | None = None
    explanation: list[str] = field(default_factory=list)


def run_one(s: Scenario, extract: NoteExtractor | None) -> Outcome:
    events = events_from(s.records, s.rules, extract)
    threads, _ = threads_at(s.records, s.rules, s.as_of, events=events, residents=[s.resident])
    top = min(threads, key=lambda t: t.review_rank, default=None)
    by_event = {e.event_id: e.source_id for e in events}
    links = {(by_event[lk.source_event_id], lk.relationship.value, by_event[lk.target_event_id])
             for t in threads for lk in t.links if lk.relationship.value in SCORED_LINKS}
    notes: dict[str, list[Gold]] = {}
    if extract is not None:
        for e in events:
            if e.source_type == "progress_note" and "other_subject" not in e.flags:
                notes.setdefault(e.source_id, []).append(event_key(e))
    sentences = invalid = 0
    issues: list[str] = []
    for t in threads:
        if t.explanation:
            sentences += len(t.explanation.sentences)
            bad = {int(i.split()[1]) for i in t.explanation.validation.issues if i.startswith("Sentence ")
                   and i.split()[1].isdigit()}
            invalid += len(bad)
            issues += t.explanation.validation.issues
    before = None
    if s.expected_before:
        earlier, _ = threads_at(s.records, s.rules, s.expected_before[0], events=events, residents=[s.resident])
        before = min(earlier, key=lambda t: t.review_rank).state if earlier else None
    return Outcome(s, top.state if top else None, any(t.state in NEEDS_REVIEW for t in threads), links, notes,
                   sentences, invalid, issues, before,
                   [x.text for x in top.explanation.sentences] if top and top.explanation else [])


def _ratio(a: float, b: float) -> float | None:
    return round(a / b, 3) if b else None


def _f1(p: float | None, r: float | None) -> float | None:
    return round(2 * p * r / (p + r), 3) if p and r else (0.0 if p is not None and r is not None else None)


def metrics(outcomes: list[Outcome], notes: bool) -> dict:
    tp = sum(o.needs_review and o.scenario.needs_review for o in outcomes)
    fp = sum(o.needs_review and not o.scenario.needs_review for o in outcomes)
    fn = sum(not o.needs_review and o.scenario.needs_review for o in outcomes)
    tn = sum(not o.needs_review and not o.scenario.needs_review for o in outcomes)
    gold_links = sum(len(o.scenario.gold_links) for o in outcomes)
    pred_links = sum(len(o.links) for o in outcomes)
    hit_links = sum(len(o.links & o.scenario.gold_links) for o in outcomes)
    out = dict(
        scenarios=len(outcomes),
        review=dict(tp=tp, fp=fp, fn=fn, tn=tn, recall=_ratio(tp, tp + fn), false_positive_rate=_ratio(fp, fp + tn),
                    precision=_ratio(tp, tp + fp)),
        state_accuracy=_ratio(sum(o.state == o.scenario.expected_state for o in outcomes), len(outcomes)),
        false_closures=sum(o.state == ThreadState.OUTCOME_VERIFIED and o.scenario.needs_review for o in outcomes),
        missed_reviews=fn,
        links=dict(precision=_ratio(hit_links, pred_links), recall=_ratio(hit_links, gold_links),
                   f1=_f1(_ratio(hit_links, pred_links), _ratio(hit_links, gold_links))),
        unsupported_claim_rate=_ratio(sum(o.invalid_sentences for o in outcomes),
                                      sum(o.sentences for o in outcomes)) or 0.0,
        explanation_sentences=sum(o.sentences for o in outcomes),
    )
    replay = [o for o in outcomes if o.scenario.expected_before]
    if replay:
        out["replay_accuracy"] = _ratio(sum(o.before_state == o.scenario.expected_before[1] for o in replay),
                                        len(replay))
    if notes:
        gold_n = pred_n = hit_n = 0
        for o in outcomes:
            for src, gold in o.scenario.gold_note_events.items():
                pred = Counter(o.note_events.get(src, []))
                g = Counter(gold)
                gold_n += sum(g.values())
                pred_n += sum(pred.values())
                hit_n += sum((g & pred).values())
        p, r = _ratio(hit_n, pred_n), _ratio(hit_n, gold_n)
        out["extraction"] = dict(precision=p, recall=r, f1=_f1(p, r), gold_events=gold_n, predicted_events=pred_n)
    return out


def _state(s: ThreadState | None) -> str:
    return s.value if s else "no thread"


def errors(outcomes: list[Outcome]) -> list[dict]:
    out = []
    for o in outcomes:
        s = o.scenario
        if o.state == s.expected_state and o.needs_review == s.needs_review:
            continue
        kind = ("false closure" if o.state == ThreadState.OUTCOME_VERIFIED and s.needs_review else
                "missed review" if s.needs_review and not o.needs_review else
                "false alarm" if o.needs_review and not s.needs_review else
                "spurious thread" if s.expected_state is None else "wrong state")
        out.append(dict(
            scenario_id=s.scenario_id, family=s.family, split=s.split, description=s.description, kind=kind,
            expected=_state(s.expected_state), got=_state(o.state),
            notes=[r.text for r in s.records if r.text],
            explanation=o.explanation,
        ))
    return out


def extraction_misses(outcomes: list[Outcome]) -> list[dict]:
    out = []
    for o in outcomes:
        texts = {r.source_id: r.text for r in o.scenario.records if r.text}
        for src, gold in o.scenario.gold_note_events.items():
            pred = o.note_events.get(src, [])
            if Counter(gold) != Counter(pred):
                out.append(dict(scenario_id=o.scenario.scenario_id, split=o.scenario.split, note=texts[src],
                                expected=[" ".join(g) for g in gold], got=[" ".join(p) for p in pred]))
    return out


Config = tuple[str, str, Callable | None]
CONFIGS: list[Config] = [
    ("structured_only", "Measurements only (notes ignored)", None),
    ("keyword", "Keyword reader", keyword_events),
    ("thread", "THREAD ConText reader", note_events),
]


def evaluate(scenarios: list[Scenario] | None = None, configs: list[Config] | None = None) -> dict:
    scenarios = scenarios or all_scenarios()
    configs = configs or list(CONFIGS)
    try:
        from .extract.llm import cached_extractor

        llm = cached_extractor(scenarios)
        if llm is not None:
            configs.append(("llm", "Language-model reader (cached)", llm))
    except ImportError:
        pass
    report: dict = dict(
        title="THREAD prototype evaluation",
        caveat="Synthetic scenarios with ground truth by construction. Prototype evaluation, not clinical validation.",
        scenarios=len(scenarios),
        splits={sp: sum(s.split == sp for s in scenarios) for sp in ("dev", "held_out")},
        families=sorted({(s.family, s.description) for s in scenarios}),
        configs=[],
    )
    for key, label, extract in configs:
        outcomes = [run_one(s, extract) for s in scenarios]
        notes = extract is not None
        fams: dict[str, dict] = {}
        for fam in sorted({s.family for s in scenarios}):
            sub = [o for o in outcomes if o.scenario.family == fam]
            fams[fam] = dict(correct=sum(o.state == o.scenario.expected_state for o in sub), total=len(sub),
                             expected=_state(sub[0].scenario.expected_state))
        report["configs"].append(dict(
            key=key, label=label,
            splits={sp: metrics([o for o in outcomes if o.scenario.split == sp], notes) for sp in ("dev", "held_out")},
            all=metrics(outcomes, notes),
            families=fams,
            errors=errors(outcomes),
            extraction_misses=extraction_misses(outcomes) if notes else [],
        ))
    return report


def summary_table(report: dict) -> str:
    rows = [f"{'reader':<34}{'split':<10}{'recall':>8}{'FPR':>7}{'state':>8}{'closures':>10}{'links F1':>10}"
            f"{'extract F1':>12}{'unsupported':>13}"]
    for c in report["configs"]:
        for sp, m in c["splits"].items():
            ext = m.get("extraction", {}).get("f1")
            rows.append(f"{c['label'][:33]:<34}{sp:<10}{m['review']['recall'] or 0:>8.2f}"
                        f"{m['review']['false_positive_rate'] or 0:>7.2f}{m['state_accuracy']:>8.2f}"
                        f"{m['false_closures']:>10}{m['links']['f1'] or 0:>10.2f}"
                        f"{'—' if ext is None else f'{ext:.2f}':>12}{m['unsupported_claim_rate']:>13.2f}")
    return "\n".join(rows)
