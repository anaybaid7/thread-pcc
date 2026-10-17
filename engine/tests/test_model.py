from datetime import datetime

from thread_engine.clock import shift_label, shift_of, shift_start
from thread_engine.model import CarePlanRule, ClinicalEvent, EventKind, Modality, Polarity

T = datetime(2026, 10, 19, 9, 10)


def event(**kw) -> ClinicalEvent:
    base = dict(
        event_id="E1", resident_id="R1", domain="hydration", kind=EventKind.OBSERVATION, modality=Modality.DONE,
        polarity=Polarity.BELOW_TARGET, event_time=T, recorded_at=T, shift="day", source_id="F1",
        source_type="fluid_round", author="PSW A.", author_role="PSW", summary="x", extractor="structured",
        confidence=1.0,
    )
    return ClinicalEvent(**{**base, **kw})


def test_round_trip():
    e = event(value=120, unit="mL")
    assert ClinicalEvent.model_validate_json(e.model_dump_json()) == e


def test_planned_and_duplicate_events_never_signal():
    assert event().is_signal
    assert not event(modality=Modality.PLANNED).is_signal
    assert not event(duplicate_of="E0").is_signal
    assert event(kind=EventKind.REFUSAL, polarity=Polarity.WORSE).is_signal


def test_offered_is_a_response_not_an_outcome():
    offered = event(kind=EventKind.INTERVENTION, polarity=Polarity.NEUTRAL)
    assert offered.is_response and not offered.is_signal and not offered.is_measured
    assert not event(kind=EventKind.INTERVENTION, modality=Modality.PLANNED).is_response


def test_rule_direction():
    r = CarePlanRule(rule_id="c", resident_id="R1", domain="hydration", metric="fluid_round_ml", operator=">=",
                     threshold=250, unit="mL", valid_from=T, description="")
    assert r.meets(250) and not r.meets(249)


def test_shifts():
    assert shift_of(datetime(2026, 10, 19, 6, 59)) == "night"
    assert shift_of(datetime(2026, 10, 19, 15, 0)) == "evening"
    assert shift_start(datetime(2026, 10, 20, 2, 0)) == datetime(2026, 10, 19, 23, 0)
    assert shift_label(datetime(2026, 10, 20, 2, 0)) == "Mon night"
