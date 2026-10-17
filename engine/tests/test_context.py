"""The sentences that separate THREAD from a keyword matcher. Each one is a way a naive reading goes wrong."""

from datetime import datetime

import pytest

from thread_engine import facility
from thread_engine.extract.context import clauses, extract_note, sentences
from thread_engine.model import EventKind, Modality, Polarity, SourceRecord

NOON = datetime(2026, 10, 19, 12, 0)


def read(text: str, at: datetime = NOON, rid: str = "R214"):
    rec = SourceRecord(
        source_id="N-1",
        resident_id=rid,
        source_type="progress_note",
        event_time=at,
        recorded_at=at,
        author="PSW T.",
        author_role="PSW",
        text=text,
    )
    return extract_note(rec, facility.CARE_PLAN)


def kinds(events):
    return [(e.kind, e.modality, e.polarity) for e in events]


def observations(events):
    return [e for e in events if e.kind == EventKind.OBSERVATION]


def test_offered_is_not_drank():
    (e,) = read("Offered fluids.")
    assert e.kind == EventKind.INTERVENTION and e.is_response and not e.is_measured


@pytest.mark.parametrize(
    "text",
    ["Offered 200 mL of water.", "Offered water in a cup.", "Set up a full glass of juice.", "Offered drinks x3."],
)
def test_an_amount_next_to_offered_is_not_intake(text):
    assert observations(read(text)) == []


def test_amount_taken_is_compared_with_the_residents_target():
    (obs,) = observations(read("Res drank approx 300 mL."))
    assert obs.value == 300 and obs.approximate and obs.polarity == Polarity.MEETS_TARGET
    (low,) = observations(read("Res drank 100 mL."))
    assert low.polarity == Polarity.BELOW_TARGET and low.is_signal


def test_cups_are_converted_and_marked_approximate():
    (obs,) = observations(read("Res drank 2 cups of tea."))
    assert obs.value == 500 and obs.approximate
    assert any("assumed 250 mL per cup" in t for t in obs.triggers)


def test_litres():
    (obs,) = observations(read("Res drank 1.5 L over the shift."))
    assert obs.value == 1500


def test_strategy_example_note():
    events = read(
        "Resident drank approximately 100 mL with assistance this morning. Continue to encourage fluids.",
        at=datetime(2026, 10, 19, 9, 15),
    )
    assert (EventKind.OBSERVATION, Modality.DONE, Polarity.BELOW_TARGET) in kinds(events)
    assert (EventKind.INTERVENTION, Modality.DONE, Polarity.NEUTRAL) in kinds(events)
    assert (EventKind.INTERVENTION, Modality.PLANNED, Polarity.NEUTRAL) in kinds(events)
    obs = observations(events)[0]
    assert obs.span.text.startswith("Resident drank approximately 100 mL")


def test_will_reassess_is_a_plan_and_reassessed_is_not():
    (plan,) = read("Will reassess this afternoon.")
    assert plan.kind == EventKind.ASSESSMENT and plan.modality == Modality.PLANNED and not plan.is_response
    done = read("Reassessed this afternoon, intake improved.")
    assert (EventKind.ASSESSMENT, Modality.DONE, Polarity.NEUTRAL) in kinds(done)
    assert (EventKind.OBSERVATION, Modality.DONE, Polarity.BETTER) in kinds(done)


def test_imperative_is_an_instruction():
    (e,) = read("Encourage fluids.")
    assert e.modality == Modality.PLANNED
    (e,) = read("Encouraged fluids.")
    assert e.modality == Modality.DONE


def test_plan_scope_covers_coordinated_verbs_but_not_earlier_ones():
    events = read("Res drank well, will encourage more at supper.")
    assert (EventKind.OBSERVATION, Modality.DONE, Polarity.BETTER) in kinds(events)
    assert (EventKind.INTERVENTION, Modality.PLANNED, Polarity.NEUTRAL) in kinds(events)


def test_negated_drinking_is_low_intake_without_an_amount():
    (obs,) = observations(read("Res did not drink anything at lunch."))
    assert obs.polarity == Polarity.WORSE and obs.value is None and "qualitative" in obs.flags
    (obs,) = observations(read("Didn't do well with drinks today."))
    assert obs.polarity == Polarity.WORSE and obs.value is None


def test_hypothetical_refusal_is_not_a_signal():
    events = read("If refuses, offer again in 1 hr.")
    assert events and all(e.modality == Modality.HYPOTHETICAL for e in events)
    assert not any(e.is_signal for e in events)


def test_food_intake_is_not_fluid_intake():
    assert read("Food intake poor at lunch.") == []


def test_refusal_is_a_signal():
    (e, _) = read("Declined water when offered.")
    assert e.kind == EventKind.REFUSAL and e.is_signal


@pytest.mark.parametrize("text", ["Roommate refused her tea.", "Mrs. B refused her afternoon drink."])
def test_someone_else_never_becomes_this_residents_signal(text):
    events = read(text)
    assert events and all("other_subject" in e.flags and not e.is_signal for e in events)


def test_relayed_history_is_context():
    (obs, *_) = read("Day shift reports res had low fluids this AM.", at=datetime(2026, 10, 19, 16, 40))
    assert obs.polarity == Polarity.WORSE and {"historical", "reported_by_other"} <= set(obs.flags)
    assert not obs.is_signal


def test_this_morning_in_a_morning_note_is_current():
    (obs,) = observations(read("Took a few sips this morning.", at=datetime(2026, 10, 19, 10)))
    assert "historical" not in obs.flags and obs.is_signal


def test_hedge_lowers_confidence_and_is_shown():
    events = read(
        "Res walked to dining room with walker but only made it halfway. Seems more tired than usual?", rid="R310"
    )
    hedged = events[-1]
    assert "hedged" in hedged.flags and hedged.confidence < 0.6
    assert hedged.domain == "mobility"
    assert any(t.startswith("hedged") for t in hedged.triggers)


def test_assist_level_against_baseline():
    (obs,) = observations(read("Res unsteady standing up, needed 1 assist to transfer.", rid="R312"))
    assert obs.value == 1 and obs.polarity == Polarity.BELOW_TARGET


def test_no_baseline_means_unclear_not_below():
    (obs,) = observations(read("Needed 2 staff to walk to dining room, unsteady.", rid="R310"))
    assert obs.value == 2 and obs.polarity == Polarity.WORSE


def test_explicit_time_in_the_text_wins_over_entry_time():
    rec = SourceRecord(
        source_id="N-1",
        resident_id="R220",
        source_type="progress_note",
        event_time=datetime(2026, 10, 19, 18, 20),
        recorded_at=datetime(2026, 10, 19, 18, 20),
        author="PSW",
        author_role="PSW",
        text="Late entry for 11:30: res drank approx 300 mL.",
    )
    (obs,) = observations(extract_note(rec, facility.CARE_PLAN))
    assert obs.event_time == datetime(2026, 10, 19, 11, 30) and "time_from_text" in obs.flags


def test_amount_is_not_mistaken_for_a_time():
    (obs,) = observations(read("Res drank at 250 mL mark of the cup."))
    assert obs.event_time == NOON


def test_spans_point_into_the_note():
    text = "Offered preferred iced tea in her blue cup; assistance provided."
    for e in read(text):
        assert text[e.span.start : e.span.end] == e.span.text


def test_segmentation_keeps_abbreviations_and_decimals():
    text = "Res drank approx. 1.5 L. Then rested."
    assert len(sentences(text)) == 2
    assert [c.text for c in clauses("Walked with walker but only made it halfway.")] == [
        "Walked with walker",
        "only made it halfway",
    ]


def test_every_facility_note_extracts_without_error():
    for rec in facility.RECORDS:
        if rec.text:
            for e in extract_note(rec, facility.CARE_PLAN):
                assert rec.text[e.span.start : e.span.end] == e.span.text
