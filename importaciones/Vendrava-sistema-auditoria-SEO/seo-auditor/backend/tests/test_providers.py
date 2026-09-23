import json
import httpx
import pytest
from app import db, providers
from app.models import ProviderRequest


@pytest.mark.asyncio
async def test_volumes_adapter_and_budget(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA", tmp_path)
    db.init()
    for k, v in {
        "ENABLE_PAID_PROVIDERS": "true",
        "DATAFORSEO_LOGIN": "fixture",
        "DATAFORSEO_PASSWORD": "fixture",
        "MAX_PROVIDER_CALLS_PER_DAY": "1",
    }.items():
        monkeypatch.setenv(k, v)
    original = httpx.AsyncClient

    def handler(request):
        assert (
            str(request.url)
            == "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live"
        )
        assert json.loads(request.content)[0]["keywords"] == ["cajas"]
        return httpx.Response(
            200,
            json={
                "status_code": 20000,
                "cost": 0.01,
                "tasks": [
                    {
                        "status_code": 20000,
                        "result": [{"keyword": "cajas", "search_volume": 1500}],
                    }
                ],
            },
        )

    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler)),
    )
    result = await providers.volumes(ProviderRequest(keywords=["cajas"]))
    assert result["keywords"][0]["volume"] == 1500
    assert result["keywords"][0]["status"] == "ambiguous"
    assert result["keywords"][0]["fit_weight"] == 0
    with pytest.raises(providers.ProviderError):
        await providers.volumes(ProviderRequest(keywords=["cajas"]))


@pytest.mark.asyncio
async def test_serps_task_validation(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA", tmp_path)
    db.init()
    for k, v in {
        "ENABLE_PAID_PROVIDERS": "true",
        "DATAFORSEO_LOGIN": "fixture",
        "DATAFORSEO_PASSWORD": "fixture",
    }.items():
        monkeypatch.setenv(k, v)
    original = httpx.AsyncClient

    def handler(request):
        return httpx.Response(
            200,
            json={
                "status_code": 20000,
                "tasks": [{"status_code": 40100, "result": None}],
            },
        )

    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler)),
    )
    with pytest.raises(providers.ProviderError):
        await providers.serps(ProviderRequest(keywords=["cajas"]))
