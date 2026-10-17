"""One expectation per resident at each handover: the facility is the specification."""

from datetime import datetime

import pytest

from thread_engine import facility
from thread_engine.clock import DEMO_NOW
from thread_engine.model import ReasonCode as C
from thread_engine.model import ThreadState as S
from thread_engine.pipeline import threads_at

MON_15, MON_23, TUE_07 = datetime(2026, 10, 19, 15), datetime(2026, 10, 19, 23), datetime(2026, 10, 20, 7)


def states(as_of):
    threads, _ = threads_at(facility.RECORDS, facility.CARE_PLAN, as_of)
    return {f"{t.resident_id}/{t.domain}": t for t in threads}


NOW = states(DEMO_NOW)


@pytest.mark.parametrize("key,state", [
    ("R214/hydration", S.PERSISTENT_SIGNAL),     # A + H: hero
    ("R216/hydration", S.UNVERIFIED),            # B: missing outcome
    ("R218/hydration", S.OUTCOME_VERIFIED),      # C: successful follow-up
    ("R220/hydration", S.OUTCOME_VERIFIED),      # D: late entry
    ("R222/hydration", S.AMBIGUOUS),             # E: ambiguous note
    ("R224/hydration", S.OUTCOME_VERIFIED),      # F: duplicate import
    ("R226/hydration", S.PERSISTENT_SIGNAL),     # G: contradiction
    ("R228/hydration", S.NEW_SIGNAL),            # refusal, plan never confirmed
    ("R310/mobility", S.AMBIGUOUS),              # no baseline
    ("R312/mobility", S.PERSISTENT_SIGNAL),
    ("R314/mobility", S.OUTCOME_VERIFIED),
    ("R320/hydration", S.RESPONSE_DOCUMENTED),   # still inside the window
])
def test_state_now(key, state):
    assert NOW[key].state == state


def test_residents_without_a_concern_have_no_thread():
    assert not {"R316/hydration", "R318/hydration"} & set(NOW)


def test_rosa_replay_across_handovers():
    assert [states(t)["R214/hydration"].state for t in (MON_15, MON_23, TUE_07, DEMO_NOW)] == [
        S.RESPONSE_DOCUMENTED, S.UNVERIFIED, S.PERSISTENT_SIGNAL, S.PERSISTENT_SIGNAL]
    rosa = NOW["R214/hydration"]
    assert {C.RECURRENT_SIGNAL, C.REFUSAL_DOCUMENTED, C.PLANNED_NOT_CONFIRMED, C.CROSSED_SHIFTS} <= set(rosa.reason_codes)
    assert rosa.shifts_spanned == ["Mon day", "Mon evening", "Mon night", "Tue day"]
    (gap,) = rosa.gaps
    assert "not proof that care was missed" in gap.description


def test_late_entry_changes_what_the_evening_knew():
    assert states(MON_15)["R220/hydration"].state == S.NEW_SIGNAL
    tom = states(MON_23)["R220/hydration"]
    assert tom.state == S.OUTCOME_VERIFIED and C.LATE_ENTRY in tom.reason_codes
    assert "11:30" in tom.review_reason


def test_mark_documented_response_is_not_resolution():
    walter = NOW["R216/hydration"]
    assert C.RESPONSE_WITHOUT_OUTCOME in walter.reason_codes
    assert all(s.label.value != "Verified" for s in walter.steps)


def test_contradiction_and_baseline_reasons():
    assert C.CONTRADICTORY_EVIDENCE in NOW["R226/hydration"].reason_codes
    assert C.BASELINE_UNKNOWN in NOW["R310/mobility"].reason_codes
    assert C.DUPLICATE_COLLAPSED in NOW["R224/hydration"].reason_codes


def test_queue_order_is_by_reason():
    threads, _ = threads_at(facility.RECORDS, facility.CARE_PLAN, DEMO_NOW)
    ranks = [t.review_rank for t in threads]
    assert ranks == sorted(ranks)
    assert threads[0].resident_id == "R214"
