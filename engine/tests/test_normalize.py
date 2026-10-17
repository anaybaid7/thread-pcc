from datetime import datetime

from thread_engine import facility
from thread_engine.model import Polarity, SourceRecord
from thread_engine.normalize import finalize, structured_events


def events_for(rid):
    recs = [r for r in facility.RECORDS if r.resident_id == rid]
    return finalize(structured_events(recs, facility.CARE_PLAN))


def test_duplicate_import_is_kept_but_points_at_the_original():
    rounds = [e for e in events_for("R224") if e.event_time == datetime(2026, 10, 19, 13)]
    assert len(rounds) == 2
    original, dup = sorted(rounds, key=lambda e: e.recorded_at)
    assert original.duplicate_of is None
    assert dup.duplicate_of == original.event_id and "duplicate_import" in dup.flags
    assert not dup.is_signal and original.is_signal


def test_same_value_at_a_different_time_is_not_a_duplicate():
    t = datetime(2026, 10, 19, 9)
    recs = [
        SourceRecord(source_id=f"F-{i}", resident_id="R214", source_type="fluid_round", event_time=t.replace(hour=h),
                     recorded_at=t.replace(hour=h), author="a", author_role="PSW", value=120, unit="mL")
        for i, h in enumerate((9, 13))
    ]
    assert all(e.duplicate_of is None for e in finalize(structured_events(recs, facility.CARE_PLAN)))


def test_polarity_against_the_residents_own_target():
    rosa = events_for("R214")
    assert [e.polarity for e in rosa] == [Polarity.BELOW_TARGET, Polarity.BELOW_TARGET]
    assert "target ≥ 250 mL" in rosa[0].summary


def test_mobility_against_baseline():
    lil = [e for e in events_for("R312") if e.domain == "mobility"]
    assert [e.polarity for e in lil] == [Polarity.MEETS_TARGET, Polarity.BELOW_TARGET]
    assert lil[-1].summary.startswith("Mobility check: 1-person assist")


def test_late_entry_flag_and_shift():
    t = datetime(2026, 10, 19, 11, 30)
    rec = SourceRecord(source_id="F-9", resident_id="R220", source_type="fluid_round", event_time=t,
                       recorded_at=t.replace(hour=18, minute=20), author="a", author_role="PSW", value=300, unit="mL")
    (e,) = finalize(structured_events([rec], facility.CARE_PLAN))
    assert "late_entry" in e.flags and e.shift == "day"
