from thread_engine import facility
from thread_engine.clock import DEMO_NOW
from thread_engine.explain import validate
from thread_engine.model import CitedSentence
from thread_engine.pipeline import threads_at

THREADS, _ = threads_at(facility.RECORDS, facility.CARE_PLAN, DEMO_NOW, residents=facility.RESIDENTS)
BY = {t.resident_id: t for t in THREADS}


def test_every_explanation_in_the_facility_validates():
    for t in THREADS:
        assert t.explanation.validation.ok, (t.thread_id, t.explanation.validation.issues)
        assert all(s.cites for s in t.explanation.sentences)


def test_rosa_reads_like_the_strategy_example():
    text = " ".join(s.text for s in BY["R214"].explanation.sentences)
    assert "120 mL Mon 09:10" in text and "100 mL Tue 08:45" in text
    assert "do not establish that intake improved" in text
    step = BY["R214"].explanation.next_step.text
    assert "blue two-handled cup" in step and "approach from her right" in step


def test_next_step_is_verification_never_treatment():
    for t in THREADS:
        step = t.explanation.next_step.text.lower()
        assert not any(w in step for w in ("administer", "give medication", "iv ", "start ", "prescribe"))


def check(text, cites, t=None):
    t = t or BY["R214"]
    return validate([CitedSentence(text=text, cites=cites)], CitedSentence(text="Verify."), t,
                    facility.rules_for("R214")[0])


def test_validator_rejects_uncited_and_invented_claims():
    assert not check("Intake was low.", []).ok
    assert not check("Intake was low.", ["N-9999"]).ok
    assert not check("Rosa drank 400 mL at 11:00.", ["F-1001"]).ok
    assert check("A round recorded 120 mL at 09:10, below 250 mL.", ["F-1001"]).ok


def test_language_guard():
    for bad in ("Rosa is dehydrated.", "Staff failed to follow up.", "This looks like a UTI.",
                "Care was neglected overnight.", "The concern is resolved."):
        assert not check(bad, ["F-1001"]).ok, bad
