from datetime import datetime

from thread_engine import facility
from thread_engine.clock import DEMO_NOW
from thread_engine.link import link_events
from thread_engine.model import Relationship as R
from thread_engine.pipeline import events_from

EVENTS = events_from(facility.RECORDS, facility.CARE_PLAN)


def drafts_at(as_of=DEMO_NOW):
    drafts, unlinked = link_events(EVENTS, as_of)
    return {d.resident_id + "/" + d.domain: d for d in drafts}, unlinked


def rels(draft):
    return {(link.source_event_id, link.relationship, link.target_event_id) for link in draft.links}


def test_rosa_thread_crosses_three_shifts():
    rosa = drafts_at()[0]["R214/hydration"]
    assert rosa.thread_id == "R214-hydration-F-1001"
    r = rels(rosa)
    assert ("N-2001.1", R.RESPONDS_TO, "F-1001") in r
    assert ("N-2002.1", R.RELAYS, "F-1001") in r
    assert ("N-2002.3", R.PLANS_FOR, "F-1001") in r
    assert ("F-1002", R.RECURS, "N-2004.1") in r
    assert any("across shifts" in link.evidence_text for link in rosa.links)


def test_samuel_plan_without_a_signal_opens_nothing():
    assert "R318/hydration" not in drafts_at()[0]


def test_roommate_note_is_left_for_a_person():
    _, unlinked = drafts_at()
    assert {u.event.event_id for u in unlinked} == {"N-2018.2", "N-2018.3"}


def test_duplicate_is_linked_not_counted():
    harold = drafts_at()[0]["R224/hydration"]
    assert ("F-1014", R.DUPLICATES, "F-1013") in rels(harold)
    assert sum(1 for e in harold.events if e.is_signal) == 1


def test_contradiction_is_surfaced():
    agnes = drafts_at()[0]["R226/hydration"]
    assert ("N-2012.1", R.CONTRADICTS, "F-1018") in rels(agnes)
    assert ("N-2012.1", R.FOLLOWS_UP, "F-1018") not in rels(agnes)


def test_improvement_after_a_response_is_not_a_contradiction():
    harold = drafts_at()[0]["R224/hydration"]
    assert not any(link.relationship == R.CONTRADICTS for link in harold.links)


def test_concern_inferred_only_when_one_thread_is_open():
    lil = drafts_at()[0]["R312/mobility"]
    assert "N-2016.1" in lil.inferred_domain
    link = next(x for x in lil.links if x.source_event_id == "N-2016.1")
    assert link.confidence < 0.9


def test_plan_read_before_its_signal_still_links_to_it():
    joe = drafts_at()[0]["R228/hydration"]
    assert joe.thread_id == "R228-hydration-N-2013.1"
    assert ("N-2013.2", R.PLANS_FOR, "N-2013.1") in rels(joe)


def test_as_of_hides_what_was_not_yet_entered():
    tom_at_handover = drafts_at(datetime(2026, 10, 19, 15))[0]["R220/hydration"]
    assert [e.event_id for e in tom_at_handover.events] == ["F-1008"]
    tom_now = drafts_at()[0]["R220/hydration"]
    assert "N-2008.2" in {e.event_id for e in tom_now.events}
