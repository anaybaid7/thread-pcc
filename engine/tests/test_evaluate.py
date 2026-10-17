"""Guards on the evaluation itself, not on particular scores: the harness must keep separating the readers."""

from thread_engine.evaluate import evaluate
from thread_engine.scenarios import generate


def test_thread_never_closes_more_than_the_keyword_reader_and_never_invents_claims():
    report = evaluate(generate("held_out", variants=1))
    by = {c["key"]: c["all"] for c in report["configs"]}
    assert by["thread"]["false_closures"] <= by["keyword"]["false_closures"]
    assert by["thread"]["review"]["recall"] >= by["structured_only"]["review"]["recall"]
    assert all(c["all"]["unsupported_claim_rate"] == 0 for c in report["configs"])
    assert "extraction" not in by["structured_only"]


def test_every_error_is_explained():
    report = evaluate(generate("dev", variants=1))
    for c in report["configs"]:
        for e in c["errors"]:
            assert e["kind"] in {"missed review", "false alarm", "false closure", "spurious thread", "wrong state"}
