import os
import httpx
from . import db
from .models import now


class ProviderError(ValueError):
    pass


def status():
    return dict(
        ai=bool(os.getenv("OPENAI_API_KEY") and os.getenv("OPENAI_MODEL")),
        ai_model=os.getenv("OPENAI_MODEL", ""),
        market=bool(os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD")),
        performance=bool(os.getenv("PAGESPEED_API_KEY")),
        paid_enabled=os.getenv("ENABLE_PAID_PROVIDERS", "false").lower() == "true",
        daily_call_limit=int(os.getenv("MAX_PROVIDER_CALLS_PER_DAY", "100")),
    )


def allow_call(provider, operation):
    if os.getenv("ENABLE_PAID_PROVIDERS", "false").lower() != "true":
        raise ProviderError(
            "Activa ENABLE_PAID_PROVIDERS para usar servicios externos con coste."
        )
    with db.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        n = c.execute(
            "SELECT count(*) FROM costs WHERE created_at>=?", (now()[:10],)
        ).fetchone()[0]
        if n >= int(os.getenv("MAX_PROVIDER_CALLS_PER_DAY", "100")):
            raise ProviderError("Límite diario de llamadas alcanzado.")
        c.execute(
            "INSERT INTO costs(created_at,provider,operation,unit,detail) VALUES (?,?,?,?,?)",
            (now(), provider, operation, "USD", "Intento reservado; coste pendiente"),
        )
        return c.execute("SELECT last_insert_rowid()").fetchone()[0]


async def dataforseo(endpoint, tasks):
    login = os.getenv("DATAFORSEO_LOGIN")
    password = os.getenv("DATAFORSEO_PASSWORD")
    if not login or not password:
        raise ProviderError("DataForSEO no está configurado.")
    row = allow_call("DataForSEO", endpoint)
    async with httpx.AsyncClient(timeout=75, trust_env=False) as client:
        r = await client.post(
            "https://api.dataforseo.com/v3/" + endpoint,
            auth=(login, password),
            json=tasks,
        )
        if r.status_code != 200:
            raise ProviderError("DataForSEO respondió HTTP " + str(r.status_code))
        data = r.json()
    if data.get("status_code") != 20000 or any(
        t.get("status_code") != 20000 for t in data.get("tasks", [])
    ):
        raise ProviderError(
            "DataForSEO no completó la tarea. Revisa el panel del proveedor."
        )
    with db.connect() as c:
        c.execute(
            "UPDATE costs SET amount=?,detail=? WHERE id=?",
            (data.get("cost"), "Respuesta recibida", row),
        )
    return data


async def volumes(req):
    result = await dataforseo(
        "keywords_data/google_ads/search_volume/live",
        [
            dict(
                keywords=req.keywords,
                location_code=req.location_code,
                language_code=req.language_code,
            )
        ],
    )
    rows = []
    for t in result["tasks"]:
        for x in t.get("result") or []:
            rows.append(
                dict(
                    keyword=x["keyword"],
                    group_id=x["keyword"].casefold(),
                    segment="principal",
                    volume=x.get("search_volume"),
                    status="ambiguous",
                    fit_weight=0,
                    reason="",
                    source="DataForSEO / Google Ads",
                    period=now()[:7],
                    geography=req.geography,
                    brand=False,
                )
            )
    return dict(keywords=rows, overlap_reviewed=False, raw=result)


async def serps(req):
    # Live advanced accepts one task per call. Budget is reserved for each.
    snapshots = []
    for keyword in req.keywords:
        data = await dataforseo(
            "serp/google/organic/live/advanced",
            [
                dict(
                    keyword=keyword,
                    location_code=req.location_code,
                    language_code=req.language_code,
                    device=req.device,
                    depth=20,
                )
            ],
        )
        results = data["tasks"][0].get("result") or []
        items = results[0].get("items", []) if results else []
        snapshots.append(
            dict(
                keyword=keyword,
                geography=req.geography,
                language=req.language_code,
                device=req.device,
                captured_at=now(),
                source="DataForSEO / Google Organic Live",
                items=[
                    dict(
                        position=x["rank_group"],
                        url=x["url"],
                        title=x.get("title", ""),
                        kind="unknown",
                    )
                    for x in items
                    if x.get("type") == "organic" and x.get("url")
                ],
                raw=data,
            )
        )
    return snapshots


async def pagespeed(url):
    key = os.getenv("PAGESPEED_API_KEY")
    if not key:
        raise ProviderError("PageSpeed API no configurada.")
    row = allow_call("Google", "pagespeed")
    async with httpx.AsyncClient(timeout=100, trust_env=False) as client:
        r = await client.get(
            "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
            params={
                "url": url,
                "key": key,
                "strategy": "mobile",
                "category": "performance",
            },
        )
        if r.status_code != 200:
            raise ProviderError("PageSpeed no pudo completar la medición.")
        raw = r.json()
    lh = raw.get("lighthouseResult", {})
    audits = lh.get("audits", {})
    result = dict(
        source="PageSpeed Insights · Lighthouse mobile",
        at=now(),
        scope="URL",
        scores={k: v.get("score") for k, v in lh.get("categories", {}).items()},
    )
    for out, key in [
        ("lcp_lab_ms", "largest-contentful-paint"),
        ("cls_lab", "cumulative-layout-shift"),
        ("tbt_lab_ms", "total-blocking-time"),
        ("ttfb_lab_ms", "server-response-time"),
    ]:
        n = audits.get(key, {}).get("numericValue")
        if isinstance(n, (int, float)):
            result[out] = n
    result["opportunities"] = [
        dict(
            id=k,
            title=v.get("title"),
            savings_ms=v.get("details", {}).get("overallSavingsMs"),
            savings_bytes=v.get("details", {}).get("overallSavingsBytes"),
        )
        for k, v in audits.items()
        if (v.get("details", {}).get("overallSavingsMs") or 0) >= 100
        or (v.get("details", {}).get("overallSavingsBytes") or 0) >= 51200
    ]
    # CrUX is not inferred from laboratory data. Separate explicit URL/origin imports.
    with db.connect() as c:
        c.execute(
            "UPDATE costs SET amount=0,detail=? WHERE id=?",
            ("Medición recibida; cuota Google", row),
        )
    return result
