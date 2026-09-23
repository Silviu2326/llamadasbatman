import asyncio
import socket
import pytest
from app.crawler import (
    PublicResolver,
    UnsafeURL,
    SafeClient,
    is_public,
    extract,
    sitemap_parse,
)
from app.rules import evaluate


def test_catalog(lead, crawl_data):
    r = evaluate(crawl_data, lead)
    by_id = {x["rule_id"]: x for x in r}
    assert len(by_id) == 97
    assert by_id["IDX-04"]["state"] == "warning"
    assert by_id["PAGE-07"]["state"] == "warning"
    assert by_id["SD-02"]["state"] == "fail"
    assert by_id["PERF-05"]["state"] == "unknown"
    assert by_id["JS-01"]["state"] == "unknown"
    assert not any("Evidencia incompatible" in x["detail"] for x in r)


def test_unconfirmed_intent(lead, crawl_data):
    lead["expected_indexable"] = []
    assert (
        next(r for r in evaluate(crawl_data, lead) if r["rule_id"] == "IDX-04")["state"]
        == "observed"
    )


def test_shell():
    assert extract(
        '<html><body><div id="root"></div><script src="app.js"></script></body></html>',
        "https://example.com/",
    )["shell"]


def test_alt():
    d = extract(
        '<html><body><main><img alt="" src="a.jpg"><a href="/"><img alt="Inicio" src="logo.png"></a></main></body></html>',
        "https://example.com/",
    )
    assert d["images"][0]["alt"] == ""
    assert d["links"][0]["label"] == "Inicio"


def test_xml():
    with pytest.raises(Exception):
        sitemap_parse(
            b'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><urlset><loc>&x;</loc></urlset>',
            "application/xml",
        )


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "::1",
        "::ffff:127.0.0.1",
        "224.0.0.1",
        "192.168.1.1",
    ],
)
def test_non_public(ip):
    assert not is_public(ip)


@pytest.mark.asyncio
async def test_dns(monkeypatch):
    async def resolve(*args, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
        ]

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    with pytest.raises(UnsafeURL):
        await PublicResolver().resolve("attacker.example", 443)


@pytest.mark.asyncio
async def test_literal():
    async with SafeClient() as client:
        with pytest.raises(UnsafeURL):
            await client.raw("http://127.0.0.1/")
        assert client.requests == 0


@pytest.mark.asyncio
async def test_redirect():
    class Client(SafeClient):
        async def get_robots(self, url):
            from protego import Protego

            return {"uncertain": False, "parser": Protego.parse("")}

        async def raw(self, url, cap=0):
            assert "127.0.0.1" not in url
            return {
                "status": 302,
                "headers": {"location": "http://127.0.0.1/"},
                "body": b"",
                "url": url,
            }

    async with Client() as client:
        assert (
            await client.fetch("https://example.com/", root="https://example.com/")
        )["error"] == "out_of_scope"


@pytest.mark.asyncio
async def test_robots():
    class Client(SafeClient):
        async def get_robots(self, url):
            from protego import Protego

            return {
                "uncertain": False,
                "parser": Protego.parse("User-agent: *\nDisallow: /private*"),
            }

        async def raw(self, *args):
            raise AssertionError("No request should occur")

    async with Client() as client:
        assert (await client.fetch("https://example.com/private/file"))[
            "error"
        ] == "robots_disallowed"


def test_noindex_agent_scope(lead, crawl_data):
    p = crawl_data["pages"][0]
    p["data"]["metas"].pop("robots")
    p["headers"]["x-robots-tag"] = "bingbot: noindex"
    assert (
        next(x for x in evaluate(crawl_data, lead) if x["rule_id"] == "IDX-04")["state"]
        == "pass"
    )
    p["headers"]["x-robots-tag"] = "googlebot: noindex"
    assert (
        next(x for x in evaluate(crawl_data, lead) if x["rule_id"] == "IDX-04")["state"]
        == "warning"
    )


@pytest.mark.asyncio
async def test_crawl_end_to_end_fixture(monkeypatch, lead):
    from app import crawler
    from app.models import now

    responses = {
        "/robots.txt": (200, "text/plain", b"User-agent: *\nDisallow: /private"),
        "/": (
            200,
            "text/html",
            b'<html><head><title>Fixture home</title></head><body><main><h1>Hello</h1><a href="/broken">Broken</a><a href="/private">Private</a></main></body></html>',
        ),
    }

    class Client(SafeClient):
        async def raw(self, url, cap=0):
            from urllib.parse import urlsplit

            self.check()
            self.requests += 1
            path = urlsplit(url).path
            status, mime, body = responses.get(
                path, (404, "text/html", b"<html>Not found</html>")
            )
            return dict(
                url=url,
                status=status,
                headers={"content-type": mime},
                body=body,
                ttfb_ms=5,
                truncated=False,
                bytes=len(body),
                certificate=None,
                at=now(),
            )

    monkeypatch.setattr(crawler, "SafeClient", Client)
    result = await crawler.crawl(lead, {"profile": "lite"})
    assert result["scope"]["crawled_urls"] == 3
    assert any(p.get("error") == "robots_disallowed" for p in result["pages"])
    findings = evaluate(result, lead)
    assert (
        next(
            f for f in findings if f["rule_id"] == "HTTP-01" and f["url"] == lead["url"]
        )["state"]
        == "fail"
    )
    assert not any(f["rule_id"] == "MAP-02" and f["state"] == "fail" for f in findings)


@pytest.mark.asyncio
async def test_real_browser_on_controlled_responses(monkeypatch):
    import os

    if not os.getenv("BROWSER_EXECUTABLE"):
        pytest.skip("Set BROWSER_EXECUTABLE to exercise installed Chromium.")
    from app.crawler import render_page
    from app.models import now

    class Client:
        async def fetch(self, url, root=None):
            body = b'<html><head><title>Initial</title></head><body><main>Starting</main><script>document.title="Rendered";document.querySelector("main").innerHTML="<h1>Rendered headline</h1><p>Texto visible tras ejecutar JavaScript.</p>";</script></body></html>'
            return dict(
                url=url,
                status=200,
                headers={"content-type": "text/html"},
                body=body,
                bytes=len(body),
                at=now(),
                chain=[],
            )

    result = await render_page(
        Client(), "https://controlled.example/", "https://controlled.example/"
    )
    assert result["data"]["title"] == "Rendered"
    assert result["data"]["headings"][0]["text"] == "Rendered headline"
    assert result["metrics"]["width"] == 390
