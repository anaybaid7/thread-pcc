"""FastAPI application. Concern threads are derived from the stored records on every request."""

from fastapi import FastAPI

app = FastAPI(title="THREAD API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
