import pytest
from fastapi.testclient import TestClient

from thread_api.main import app, store

client = TestClient(app)
ROSA = "R214-hydration-F-1001"
WALTER = "R216-hydration-F-1004"


@pytest.fixture(autouse=True)
def fresh():
    store.seed()


def test_meta_and_checkpoints():
    m = client.get("/api/meta").json()
    assert m["facility"] == "Valleyview Commons" and m["synthetic"]
    assert [c["label"] for c in m["checkpoints"]][-1] == "Tue 09:00 (now)"


def test_queue_ranks_rosa_first_and_hides_closed_threads():
    q = client.get("/api/queue").json()
    assert q["items"][0]["thread_id"] == ROSA
    assert q["counts"]["open"] == len(q["items"]) == 7
    assert all(i["state"] != "outcome_verified" for i in q["items"])
    assert len(q["closed"]) == 4 and len(q["unlinked"]) == 2


def test_queue_as_of_an_earlier_handover():
    q = client.get("/api/queue", params={"as_of": "2026-10-19T15:00:00"}).json()
    assert [i["resident"]["resident_id"] for i in q["items"]] == ["R220"]


def test_thread_detail_has_replay_sources_and_labels():
    d = client.get(f"/api/threads/{ROSA}").json()
    assert [r["state"] for r in d["replay"]] == ["response_documented", "unverified", "persistent_signal",
                                                 "persistent_signal"]
    assert d["labels"]["F-1001"] == "E1"
    assert any(s["source_id"] == "N-2003" and not s["in_thread"] for s in d["sources"])
    assert d["thread"]["explanation"]["validation"]["ok"]


def test_unknown_thread_is_404():
    assert client.get("/api/threads/nope").status_code == 404


def test_mark_reviewed_never_resolves():
    d = client.post(f"/api/threads/{WALTER}/actions", json={"action_type": "mark_reviewed", "actor": "RPN Daniel O.",
                                                            "note": "Will check at lunch"}).json()
    assert d["thread"]["state"] == "unverified"
    assert d["summary"]["last_reviewed"]["actor"] == "RPN Daniel O."
    assert client.get("/api/audit").json()[0]["action"] == "mark_reviewed"


def test_bedside_verification_can_close_a_thread():
    d = client.post(f"/api/threads/{WALTER}/actions", json={"action_type": "verify_current_status",
                                                            "actor": "RPN Daniel O.", "value": 240}).json()
    assert d["thread"]["state"] == "outcome_verified"
    assert any(s["label"] == "Verified" for s in d["thread"]["steps"])


def test_bedside_check_below_target_keeps_it_open():
    d = client.post(f"/api/threads/{WALTER}/actions", json={"action_type": "verify_current_status",
                                                            "actor": "RPN Daniel O.", "value": 60}).json()
    assert d["thread"]["state"] == "persistent_signal"


def test_new_note_joins_the_right_thread():
    r = client.post("/api/notes", json={"resident_id": "R214", "text": "Res drank 300 mL of iced tea with cueing."})
    (t,) = r.json()["threads"]
    assert t["thread_id"] == ROSA and t["state"] == "outcome_verified"


def test_lab_shows_both_readings():
    r = client.post("/api/lab/extract", json={"text": "Offered 200 mL water. Will reassess later.",
                                              "resident_id": "R214"}).json()
    assert [e["kind"] for e in r["events"]] == ["intervention", "assessment"]
    assert any("200 mL" in k["why"] and k["kind"] == "observation" for k in r["keyword"])


def test_handover_brief():
    h = client.get("/api/handover").json()
    assert 3 <= len(h["items"]) <= 5 and h["more"] == 2
    first = h["items"][0]
    assert first["thread_id"] == ROSA and first["sentences"][0]["cites"] == ["E1", "E9"]
    assert first["new_since"]  # Tue 08:45 round arrived after the 07:00 handover
    saved = client.post("/api/handover", json={"as_of": h["as_of"], "author": "RN Priya S.",
                                               "items": [{"thread_id": ROSA, "text": "edited"}]})
    assert saved.status_code == 200


def test_reset():
    client.post("/api/notes", json={"resident_id": "R214", "text": "Res drank 300 mL."})
    client.post("/api/reset")
    assert client.get("/api/meta").json()["now"] == "2026-10-20T09:00:00"


def test_snapshot_keys_cover_every_checkpoint(tmp_path):
    from thread_api.snapshot import export, key

    export(tmp_path)
    names = {p.stem for p in tmp_path.iterdir()}
    assert {"meta", "queue", "handover", "lab__samples", "residents"} <= names
    assert key("queue", __import__("datetime").datetime(2026, 10, 19, 15)) == "queue@2026-10-19T1500"
    assert "threads__R214-hydration-F-1001@2026-10-19T2300" in names
    assert "threads__R214-hydration-F-1001" in names


def test_timeline_tells_rosas_story_hour_by_hour():
    t = client.get("/api/timeline").json()
    assert len(t["steps"]) == 27 and t["steps"][-1] == "2026-10-20T09:00:00"
    rosa = next(r for r in t["rows"] if r["resident"]["resident_id"] == "R214")
    assert rosa["cells"][0] is None and rosa["cells"][-1] == "persistent_signal"
    assert "unverified" in rosa["cells"] and "response_documented" in rosa["cells"]
    assert t["rows"][0]["rank"] <= t["rows"][-1]["rank"]


def test_story_has_measurements_markers_and_gaps():
    s = client.get("/api/story/R214").json()
    assert [m["value"] for m in s["measures"]] == [120, 100]
    assert {m["role"] for m in s["markers"]} >= {"response", "plan", "recurrence"}
    assert len(s["gaps"]) == 1 and s["next_step"]
    assert client.get("/api/story/R318").json()["thread"] is None
