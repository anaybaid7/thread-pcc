from fastapi.testclient import TestClient

from thread_api.main import app


def test_health():
    assert TestClient(app).get("/api/health").json() == {"status": "ok"}
