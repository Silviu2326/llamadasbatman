import pytest
from app.models import LeadInput, MarketInput, now
from app.crawler import extract


@pytest.fixture
def lead():
    return LeadInput(
        name="Example",
        url="https://example.com",
        expected_indexable=["https://example.com/"],
    ).model_dump()


@pytest.fixture
def market():
    return MarketInput(
        keywords=[
            dict(
                keyword="industrial boxes",
                group_id="boxes",
                volume=2250,
                status="included",
                reason="Industrial intent verified",
                source="Fixture",
                period="2026-09",
            )
        ],
        overlap_reviewed=True,
    )


@pytest.fixture
def crawl_data(lead):
    html = """<html lang="es"><head><title>Fabricante de cajas personalizadas</title><meta name="robots" content="noindex"><link rel="canonical" href="/"><script type="application/ld+json">{invalid}</script></head><body><main><h2>Envases</h2><p>Texto de ejemplo.</p><img src="/box.png"><a href="/contacto">Contacto</a></main></body></html>"""
    d = extract(html, lead["url"])
    return dict(
        started_at=now(),
        finished_at=now(),
        pages=[
            dict(
                id="p1",
                url=lead["url"],
                requested_url=lead["url"],
                status=200,
                headers={"content-type": "text/html"},
                at=now(),
                data=d,
                initial=d,
                chain=[],
                depth=0,
                discovery="home",
            )
        ],
        robots=[],
        sitemaps=[],
        warnings=[],
        scope={"crawled_urls": 1, "partial": True},
        usage={},
    )
