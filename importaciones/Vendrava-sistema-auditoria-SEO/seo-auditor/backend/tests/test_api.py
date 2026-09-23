import pytest
from fastapi.testclient import TestClient
from app import db
from app.main import app
from app.analysis import validate_ai
from app.providers import ProviderError
from app.models import Scenario


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA", tmp_path)
    with TestClient(app) as c:
        assert (
            c.post(
                "/api/auth/setup", json={"password": "example-test-password"}
            ).status_code
            == 200
        )
        assert (
            c.post(
                "/api/auth/login", json={"password": "example-test-password"}
            ).status_code
            == 200
        )
        yield c


def test_auth(client):
    assert (
        client.post("/api/auth/setup", json={"password": "second-password"}).status_code
        == 409
    )
    assert (
        client.post("/api/demo", headers={"Origin": "https://evil.example"}).status_code
        == 403
    )
    client.post("/api/auth/logout")
    assert client.get("/api/leads").status_code == 401


def test_full_demo(client):
    d = client.post("/api/demo")
    assert d.status_code == 200, d.text
    id = d.json()["id"]
    info = client.get("/api/leads/" + id).json()
    assert len(info["scenarios"]) == 1
    aid = info["audits"][0]["id"]
    a = client.get("/api/audits/" + aid).json()
    assert len({x["rule_id"] for x in a["packet"]["findings"]}) == 97
    assert (
        client.post(
            "/api/leads/" + id + "/scenarios", json=Scenario().model_dump()
        ).status_code
        == 201
    )
    assert client.get("/api/leads/" + id + "/report.html").status_code == 200
    assert client.get("/api/leads/" + id + "/export.json").json()["lead"]["demo"]
    assert client.get("/api/audits/" + aid + "/ai-input").json()["version"] == "2.0"
    assert client.post("/api/audits/" + aid + "/analysis").status_code == 422


def test_import(client):
    r = client.post(
        "/api/leads/import",
        json={
            "content": "name,url\nA,https://a.example\nB,https://a.example\nC,https://b.example\n"
        },
    )
    assert [x["status"] for x in r.json()] == ["created", "rejected", "created"]
    assert (
        client.post(
            "/api/leads", json={"name": "D", "url": "file:///etc/passwd"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/leads", json={"name": "D", "url": "https://user:pass@example.com"}
        ).status_code
        == 422
    )


def test_xss(client):
    lead = client.post(
        "/api/leads",
        json={"name": "<script>alert(1)</script>", "url": "https://x.example"},
    ).json()
    html = client.get("/api/leads/" + lead["id"] + "/report.html").text
    assert "<script>alert" not in html
    assert "&lt;script&gt;" in html


def test_ai_validation(lead, crawl_data):
    from app.rules import evaluate

    p = {"findings": evaluate(crawl_data, lead)}
    valid = {
        "summary": "Contenido revisado.",
        "actions": [],
        "limitations": [],
        "calculation_ids": [],
    }
    assert validate_ai(valid, p, []) == valid
    with pytest.raises(ProviderError):
        validate_ai({**valid, "summary": "Pierdes 100 euros."}, p, [])
    with pytest.raises(ProviderError):
        validate_ai({**valid, "calculation_ids": ["invented"]}, p, [])
    with pytest.raises(ProviderError):
        validate_ai(
            {
                **valid,
                "actions": [
                    dict(
                        title="Cambio",
                        explanation="Revisar",
                        acceptance="Comprobar",
                        priority="P1",
                        evidence_ids=["fake"],
                    )
                ],
            },
            p,
            [],
        )


def test_schema(client):
    assert "/api/leads/{id}/scenarios" in client.get("/openapi.json").json()["paths"]


def test_external_revision_preserves_snapshot(client):
    id = client.post("/api/demo").json()["id"]
    info = client.get("/api/leads/" + id).json()
    aid = info["audits"][0]["id"]
    r = client.post(
        "/api/audits/" + aid + "/external",
        json={
            "source": "Fixture CrUX",
            "captured_at": "2026-09-15T12:00:00Z",
            "performance": {
                "https://envases.example/": {
                    "source": "Fixture",
                    "at": "2026-09-15T12:00:00Z",
                    "scope": "URL",
                    "device": "mobile",
                    "period_start": "2026-08-18",
                    "period_end": "2026-09-14",
                    "sufficient_sample": True,
                    "lcp_field_ms": 4500,
                }
            },
        },
    )
    assert r.status_code == 201, r.text
    new = client.get("/api/audits/" + r.json()["id"]).json()["packet"]
    old = client.get("/api/audits/" + aid).json()["packet"]
    assert new["parent_audit_id"] == aid
    assert (
        next(f for f in new["findings"] if f["rule_id"] == "PERF-04")["state"] == "fail"
    )
    assert (
        next(f for f in old["findings"] if f["rule_id"] == "PERF-04")["state"]
        == "unknown"
    )


def test_worker_queue_to_completion(client, monkeypatch, crawl_data):
    import time
    from app import worker

    async def fixture_crawl(lead, options, cancelled):
        return crawl_data

    monkeypatch.setattr(worker, "crawl", fixture_crawl)
    id = client.post(
        "/api/leads", json={"name": "Fixture target", "url": "https://example.com"}
    ).json()["id"]
    queued = client.post("/api/leads/" + id + "/audits", json={"profile": "lite"})
    assert queued.status_code == 202
    aid = queued.json()["id"]
    for _ in range(30):
        a = client.get("/api/audits/" + aid).json()
        if a["status"] == "completed":
            break
        time.sleep(0.1)
    assert a["status"] == "completed", a
    assert a["packet"]["audit_id"] == aid
