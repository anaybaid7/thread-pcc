from thread_engine.scenarios import DEV, HELD_OUT, all_scenarios, generate


def test_deterministic_and_sized():
    a, b = all_scenarios(), all_scenarios()
    assert [s.records for s in a] == [s.records for s in b]
    assert len(a) >= 48
    assert {s.split for s in a} == {"dev", "held_out"}


def test_held_out_phrasings_are_disjoint_from_dev():
    dev = {p.text for ps in DEV.values() for p in ps}
    held = {p.text for ps in HELD_OUT.values() for p in ps}
    assert not dev & held


def test_gold_refers_to_real_records():
    for s in all_scenarios():
        ids = {r.source_id for r in s.records}
        assert set(s.gold_note_events) <= ids
        for src, _, tgt in s.gold_links:
            assert src in ids and tgt in ids, s.scenario_id


def test_every_family_in_both_splits():
    fam = lambda split: {s.family for s in generate(split)}  # noqa: E731
    assert fam("dev") == fam("held_out")
    assert {"A", "B", "C", "D", "E", "F", "G", "H"} <= fam("dev")
