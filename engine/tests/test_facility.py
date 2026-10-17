from datetime import datetime

from thread_engine import facility


def test_records_are_deterministic_and_unique():
    again = facility._records()
    assert again == facility.RECORDS
    ids = [r.source_id for r in facility.RECORDS]
    assert len(ids) == len(set(ids))


def test_every_record_belongs_to_a_resident_with_a_care_plan():
    residents = {r.resident_id for r in facility.RESIDENTS}
    for rec in facility.RECORDS:
        assert rec.resident_id in residents
        domain = "mobility" if rec.source_type == "mobility_check" else None
        if domain:
            assert any(r.domain == domain for r in facility.rules_for(rec.resident_id))


def test_demo_window():
    assert min(r.event_time for r in facility.RECORDS) >= datetime(2026, 10, 19, 7)
    assert max(r.recorded_at for r in facility.RECORDS) <= datetime(2026, 10, 20, 9)


def test_late_entry_is_entered_after_the_handover():
    late = next(r for r in facility.RECORDS if r.text and r.text.startswith("Late entry"))
    assert late.recorded_at > datetime(2026, 10, 19, 15) > late.event_time


def test_frank_has_no_documented_mobility_baseline():
    (rule,) = [r for r in facility.rules_for("R310") if r.domain == "mobility"]
    assert not rule.baseline_documented
