"""Bounded public-web crawler. Every browser request is fulfilled via the same
DNS-pinned public-only transport; Chromium never fetches a remote URL itself.
"""

import asyncio
import hashlib
import base64
import gzip
import zlib
import ipaddress
import json
import os
import re
import socket
import time
from urllib.parse import urlsplit, urljoin
import aiohttp
from aiohttp.abc import AbstractResolver
from bs4 import BeautifulSoup
from defusedxml import ElementTree as ET
from protego import Protego
from .models import normalize_url, now

AGENT = "VendravaAudit/1.0"
PROFILES = {
    "lite": dict(pages=3, requests=20, renders=0, seconds=90, bytes=10 * 1024**2),
    "standard": dict(
        pages=20, requests=100, renders=4, seconds=600, bytes=100 * 1024**2
    ),
    "extended": dict(
        pages=80, requests=350, renders=12, seconds=1800, bytes=300 * 1024**2
    ),
}


class CrawlLimit(Exception):
    pass


class UnsafeURL(Exception):
    pass


def is_public(address):
    ip = ipaddress.ip_address(address.split("%")[0])
    return ip.is_global and not ip.is_multicast and not ip.is_reserved


class PublicResolver(AbstractResolver):
    async def resolve(self, host, port=0, family=socket.AF_UNSPEC):
        records = await asyncio.get_running_loop().getaddrinfo(
            host, port, family=family, type=socket.SOCK_STREAM
        )
        if not records or any(not is_public(r[4][0]) for r in records):
            raise UnsafeURL("Destino no público bloqueado.")
        return [
            dict(
                hostname=host,
                host=r[4][0],
                port=port,
                family=r[0],
                proto=0,
                flags=socket.AI_NUMERICHOST,
            )
            for r in records
        ]

    async def close(self):
        pass


def host(url):
    return (urlsplit(url).hostname or "").lower()


def origin(url):
    p = urlsplit(url)
    return f"{p.scheme}://{p.netloc}"


def in_scope(url, root):
    return host(url).removeprefix("www.") == host(root).removeprefix("www.")


class SafeClient:
    def __init__(self, profile="lite", cancelled=lambda: False):
        self.limits = PROFILES[profile]
        self.cancelled = cancelled
        self.requests = 0
        self.downloaded = 0
        self.started = time.monotonic()
        self.robots = {}
        self.last = {}
        self.lock = asyncio.Lock()
        self.session = None

    async def __aenter__(self):
        connector = aiohttp.TCPConnector(
            resolver=PublicResolver(), use_dns_cache=False, limit=4
        )
        self.session = aiohttp.ClientSession(
            connector=connector,
            trust_env=False,
            auto_decompress=False,
            timeout=aiohttp.ClientTimeout(total=15, connect=5),
            headers={"User-Agent": AGENT, "Accept-Encoding": "gzip, deflate"},
        )
        return self

    async def __aexit__(self, *args):
        await self.session.close()

    def check(self):
        if self.cancelled():
            raise CrawlLimit("Auditoría cancelada.")
        if (
            self.requests >= self.limits["requests"]
            or self.downloaded >= self.limits["bytes"]
            or time.monotonic() - self.started > self.limits["seconds"]
        ):
            raise CrawlLimit("Límite del perfil alcanzado.")

    async def raw(self, url, cap=2 * 1024**2):
        url = normalize_url(url)
        p = urlsplit(url)
        # Literal IPs bypass aiohttp's resolver, therefore validate them here too.
        try:
            ip = ipaddress.ip_address(p.hostname)
        except ValueError:
            ip = None
        if ip is not None and not is_public(str(ip)):
            raise UnsafeURL("IP no pública bloqueada.")
        async with self.lock:
            self.check()
            delay = max(0, self.last.get(origin(url), 0) + 1 - time.monotonic())
            await asyncio.sleep(delay)
            self.check()
            self.requests += 1
            self.last[origin(url)] = time.monotonic()
            start = time.monotonic()
            async with self.session.get(url, allow_redirects=False) as r:
                ttfb = (time.monotonic() - start) * 1000
                connection = r.connection
                transport = connection.transport if connection else None
                obj = transport.get_extra_info("ssl_object") if transport else None
                cert = obj.getpeercert() if obj else None
                chunks = []
                size = 0
                truncated = False
                encoding = r.headers.get("Content-Encoding", "identity").lower()
                decoder = (
                    zlib.decompressobj(16 + zlib.MAX_WBITS)
                    if encoding == "gzip"
                    else zlib.decompressobj()
                    if encoding == "deflate"
                    else None
                )
                async for chunk in r.content.iter_chunked(16384):
                    if encoding not in ("identity", "", "gzip", "deflate"):
                        truncated = True
                        break
                    if decoder:
                        chunk = decoder.decompress(chunk, max(1, cap - size + 1))
                    size += len(chunk)
                    self.downloaded += len(chunk)
                    if size > cap or self.downloaded > self.limits["bytes"]:
                        truncated = True
                        break
                    chunks.append(chunk)
                if decoder and not decoder.eof:
                    truncated = True
                body = b"".join(chunks)
                headers = {
                    k.lower(): v
                    for k, v in r.headers.items()
                    if k.lower() not in ("set-cookie", "authorization")
                }
                return dict(
                    url=url,
                    status=r.status,
                    headers=headers,
                    body=body,
                    ttfb_ms=round(ttfb),
                    truncated=truncated,
                    bytes=size,
                    certificate=cert,
                    at=now(),
                )

    async def get_robots(self, url):
        key = origin(url)
        if key in self.robots:
            return self.robots[key]
        target = key + "/robots.txt"
        result = None
        for _ in range(6):
            result = await self.raw(target, 512000)
            if result["status"] in (301, 302, 303, 307, 308):
                target = normalize_url(
                    urljoin(target, result["headers"].get("location", ""))
                )
                if not in_scope(target, url):
                    result = dict(status=503, body=b"", truncated=False, url=target)
                    break
                continue
            break
        code = result["status"]
        text = result["body"].decode("utf-8", "replace")
        uncertain = (
            result["truncated"]
            or code in (401, 403, 429)
            or code >= 500
            or 300 <= code < 400
            or "<html" in text.lower()
        )
        self.robots[key] = dict(
            status=code,
            text=text,
            uncertain=uncertain,
            parser=Protego.parse(text if code == 200 else ""),
            url=key + "/robots.txt",
        )
        return self.robots[key]

    async def fetch(self, url, root=None, respect=True, cap=2 * 1024**2):
        url = normalize_url(url)
        chain = []
        seen = set()
        for _ in range(6):
            if root and not in_scope(url, root):
                return dict(url=url, error="out_of_scope", chain=chain)
            if url in seen:
                return dict(url=url, error="redirect_loop", chain=chain)
            seen.add(url)
            if respect:
                robots = await self.get_robots(url)
                if robots["uncertain"]:
                    return dict(url=url, error="robots_unknown", chain=chain)
                if not robots["parser"].can_fetch(url, AGENT):
                    return dict(url=url, error="robots_disallowed", chain=chain)
            try:
                r = await self.raw(url, cap)
            except aiohttp.ClientConnectorCertificateError:
                return dict(url=url, error="tls_invalid", chain=chain)
            except (
                aiohttp.ClientError,
                asyncio.TimeoutError,
                socket.gaierror,
                UnsafeURL,
            ) as e:
                return dict(url=url, error=type(e).__name__, chain=chain)
            if r["status"] in (301, 302, 303, 307, 308):
                chain.append(
                    dict(
                        url=url,
                        status=r["status"],
                        location=r["headers"].get("location"),
                    )
                )
                if not r["headers"].get("location"):
                    return dict(url=url, error="redirect_without_location", chain=chain)
                url = normalize_url(urljoin(url, r["headers"]["location"]))
                continue
            r["chain"] = chain
            r["attempts"] = [dict(status=r["status"], at=r["at"])]
            if r["status"] in (404, 410) or r["status"] >= 500:
                retry = await self.raw(url, cap)
                r["attempts"].append(dict(status=retry["status"], at=retry["at"]))
                r["confirmed_error"] = retry["status"] == r["status"]
            return r
        return dict(url=url, error="redirect_limit", chain=chain)


def extract(html, url):
    soup = BeautifulSoup(html, "html.parser")
    base = url
    if soup.find("base", href=True):
        try:
            base = normalize_url(urljoin(url, soup.find("base", href=True)["href"]))
        except ValueError:
            pass

    def resolved(href):
        try:
            return normalize_url(urljoin(base, href))
        except (ValueError, TypeError):
            return None

    metas = {}
    for m in soup.find_all("meta"):
        name = (m.get("name") or m.get("http-equiv") or "").lower()
        if name:
            metas.setdefault(name, []).append(m.get("content", ""))
    canonical = [
        resolved(x["href"])
        for x in soup.find_all("link", href=True)
        if "canonical" in x.get("rel", [])
    ]
    headings = [
        {"level": int(e.name[1]), "text": e.get_text(" ", strip=True)[:300]}
        for e in soup.find_all(re.compile("^h[1-6]$"))
    ]
    links = []
    for e in soup.find_all("a")[:2000]:
        href = e.get("href", "")
        label = (
            e.get("aria-label")
            or e.get_text(" ", strip=True)
            or " ".join(i.get("alt", "") for i in e.find_all("img"))
        )
        links.append(
            dict(
                href=href,
                url=resolved(href)
                if href and not href.startswith(("tel:", "mailto:", "javascript:"))
                else None,
                label=label[:250],
            )
        )
    images = [
        dict(
            src=resolved(e.get("src", "")),
            alt=e.get("alt"),
            width=e.get("width"),
            height=e.get("height"),
            loading=e.get("loading"),
        )
        for e in soup.find_all("img")[:300]
    ]
    structured = []
    errors = []
    for e in soup.find_all("script", type="application/ld+json")[:30]:
        try:
            structured.append(
                json.loads(
                    e.get_text(),
                    parse_constant=lambda s: (_ for _ in ()).throw(ValueError(s)),
                )
            )
        except (ValueError, TypeError):
            errors.append(e.get_text()[:150])
    langs = [
        dict(
            lang=e.get("hreflang"),
            url=resolved(e.get("href", "")),
            raw=e.get("href", ""),
        )
        for e in soup.find_all("link", hreflang=True)
    ]
    forms = [
        dict(
            action=resolved(e.get("action", url)),
            method=e.get("method", "get"),
            fields=[x.get("type", "text") for x in e.find_all("input")][:30],
        )
        for e in soup.find_all("form")[:20]
    ]
    snippets = (
        any(k in metas for k in ("nosnippet", "max-snippet"))
        or bool(soup.select("[data-nosnippet]"))
        or any("snippet" in x for x in metas.get("robots", []))
    )
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    language = soup.html.get("lang", "") if soup.html else ""
    ids = [e.get("id") or e.get("name") for e in soup.select("[id],a[name]")]
    has_script = bool(soup.find("script", src=True))
    main = soup.find("main") or soup.find("article") or soup.body or soup
    for e in main.find_all(
        ["script", "style", "nav", "header", "footer", "noscript", "svg"]
    ):
        e.decompose()
    text = main.get_text(" ", strip=True)
    words = text.split()
    return dict(
        title=title,
        description=" ".join(metas.get("description", [])),
        metas=metas,
        canonical=[c for c in canonical if c],
        headings=headings,
        links=links,
        images=images,
        structured=structured,
        structured_errors=errors,
        hreflang=langs,
        forms=forms,
        language=language,
        ids=ids,
        snippet_restrictions=snippets,
        text=text[:24000],
        text_truncated=len(text) > 24000,
        word_count=len(words),
        text_hash=hashlib.sha256(text.encode()).hexdigest() if text else None,
        shell=len(words) < 15 and has_script,
        pagination=bool(
            soup.find("link", rel=lambda x: x and ("next" in x or "prev" in x))
        ),
    )


async def render_page(client, url, root):
    from playwright.async_api import async_playwright

    errors, blocked, assets, mixed = [], [], [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            executable_path=os.getenv("BROWSER_EXECUTABLE") or None,
            args=[
                "--disable-quic",
                "--disable-background-networking",
                "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=1,
            service_workers="block",
            accept_downloads=False,
        )
        await context.route_web_socket("**/*", lambda ws: ws.close())
        await context.add_init_script(
            "for (const name of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport']) { try { Object.defineProperty(globalThis,name,{value:undefined,configurable:false,writable:false}); } catch {} }"
        )

        async def route_handler(route):
            req = route.request
            if req.method != "GET" or req.resource_type in (
                "media",
                "websocket",
                "eventsource",
            ):
                await route.abort()
                return
            try:
                response = await client.fetch(
                    req.url, root=root if req.is_navigation_request() else None
                )
                if response.get("error") or response.get("truncated"):
                    blocked.append(
                        dict(url=req.url, reason=response.get("error", "truncated"))
                    )
                    await route.abort()
                    return
                headers = {
                    k: v
                    for k, v in response["headers"].items()
                    if k
                    not in (
                        "content-encoding",
                        "content-length",
                        "transfer-encoding",
                        "connection",
                    )
                }
                assets.append(
                    dict(
                        url=req.url,
                        type=req.resource_type,
                        status=response["status"],
                        bytes=response["bytes"],
                        confirmed_error=response.get("confirmed_error", False),
                    )
                )
                if response.get("chain"):
                    await route.fulfill(
                        status=302, headers={"location": response["url"]}
                    )
                    return
                await route.fulfill(
                    status=response["status"], headers=headers, body=response["body"]
                )
            except Exception:
                blocked.append(dict(url=req.url, reason="limit_or_network"))
                await route.abort()

        await context.route("**/*", route_handler)
        page = await context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:500]))
        page.on(
            "console",
            lambda m: (
                mixed.append(m.text[:1000])
                if "Mixed Content:" in m.text and "blocked" in m.text.lower()
                else None
            ),
        )
        await page.add_init_script(
            "window.__auditLCP=null; new PerformanceObserver(l=>{for(const e of l.getEntries()){const i=e.element;window.__auditLCP={value:e.startTime,tag:i?.tagName,src:i?.currentSrc,loading:i?.getAttribute('loading')}}}).observe({type:'largest-contentful-paint',buffered:true})"
        )
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(1200)
            result = extract(await page.content(), page.url)
            metrics = await page.evaluate(
                """() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,images:[...document.images].slice(0,100).map(i=>({src:i.currentSrc,width:i.width,height:i.height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,reserved:!!(i.getAttribute('width')&&i.getAttribute('height'))||getComputedStyle(i).aspectRatio!=='auto'}))})"""
            )
            return dict(
                data=result,
                metrics=metrics,
                lcp=await page.evaluate("window.__auditLCP"),
                mixed_content=mixed,
                errors=errors,
                blocked=blocked,
                assets=assets,
                at=now(),
            )
        except Exception as e:
            return dict(
                error=type(e).__name__,
                errors=errors,
                blocked=blocked,
                assets=assets,
                mixed_content=mixed,
            )
        finally:
            await context.close()
            await browser.close()


def sitemap_parse(body, content_type):
    text = body.decode("utf-8", "replace")
    if "text/plain" in content_type:
        return {
            "urls": [
                x.strip()
                for x in text.splitlines()
                if x.strip().startswith(("https://", "http://"))
            ],
            "children": [],
            "lastmods": [],
        }
    root = ET.fromstring(body)
    tag = root.tag.split("}")[-1]
    if tag not in ("urlset", "sitemapindex", "rss", "feed"):
        raise ValueError("unsupported_format")
    locs = [
        e.text.strip() for e in root.iter() if e.tag.split("}")[-1] == "loc" and e.text
    ]
    if tag in ("rss", "feed"):
        locs = [
            e.text.strip()
            if e.text and e.text.strip().startswith("http")
            else e.attrib.get("href", "")
            for e in root.iter()
            if e.tag.split("}")[-1] == "link"
        ]
    return dict(
        urls=locs if tag != "sitemapindex" else [],
        children=locs if tag == "sitemapindex" else [],
        lastmods=[e.text for e in root.iter() if e.tag.split("}")[-1] == "lastmod"],
    )


async def crawl(lead, options, cancelled=lambda: False):
    root = lead["url"]
    pages, maps, warnings = [], [], []
    queue = [(root, 0, "home")]
    visited = set()
    result = dict(
        version="2.0",
        started_at=now(),
        root=root,
        pages=pages,
        sitemaps=maps,
        warnings=warnings,
        robots=[],
        profile=options["profile"],
    )
    async with SafeClient(options["profile"], cancelled) as client:
        try:
            robots = await client.get_robots(root)
            map_urls = re.findall(r"^\s*Sitemap:\s*(\S+)", robots["text"], re.M | re.I)[
                :4
            ] or [origin(root) + "/sitemap.xml"]
            declared_maps = set(
                re.findall(r"^\s*Sitemap:\s*(\S+)", robots["text"], re.M | re.I)
            )
            for map_url in map_urls:
                if not in_scope(map_url, root):
                    continue
                mr = await client.fetch(map_url, root=root)
                entry = {
                    k: v for k, v in mr.items() if k not in ("body", "certificate")
                }
                entry["declared"] = map_url in declared_maps
                if mr.get("status") == 200 and not mr.get("truncated"):
                    try:
                        sm = sitemap_parse(
                            mr["body"], mr["headers"].get("content-type", "")
                        )
                        entry.update(sm)
                        for child in sm["children"][: max(0, 5 - len(map_urls))]:
                            if in_scope(child, root) and child not in map_urls:
                                map_urls.append(child)
                                declared_maps.add(child)
                        for u in sm["urls"][:2000]:
                            try:
                                u = normalize_url(u)
                                if in_scope(u, root):
                                    queue.append((u, None, "sitemap"))
                            except ValueError:
                                continue
                    except Exception as e:
                        entry["parse_error"] = str(e)[:120]
                maps.append(entry)
                if len(maps) >= 5:
                    break
            while queue and len(pages) < client.limits["pages"]:
                # BFS links have priority over sitemap URLs so depth remains meaningful.
                url, depth, source = queue.pop(0)
                if url in visited:
                    continue
                visited.add(url)
                response = await client.fetch(url, root=root)
                page = {
                    k: v
                    for k, v in response.items()
                    if k not in ("body", "certificate")
                }
                page.update(
                    requested_url=url,
                    depth=depth,
                    discovery=source,
                    id="page_" + hashlib.sha256(url.encode()).hexdigest()[:12],
                )
                if response.get("certificate"):
                    page["certificate"] = {
                        k: v
                        for k, v in response["certificate"].items()
                        if k in ("notBefore", "notAfter")
                    }
                mime = response.get("headers", {}).get("content-type", "").lower()
                body = response.get("body", b"")
                if (
                    "html" in mime
                    and response.get("status") == 200
                    and not response.get("truncated")
                ):
                    html = body.decode("utf-8", "replace")
                    if any(
                        s in html.lower()
                        for s in [
                            "cf-chl-",
                            "g-recaptcha-response",
                            "verify you are human",
                        ]
                    ):
                        page["error"] = "antibot"
                    else:
                        page["html_gzip_base64"] = base64.b64encode(
                            gzip.compress(body)
                        ).decode()
                        page["initial"] = extract(html, response["url"])
                        page["data"] = page["initial"]
                        if (
                            options.get("render")
                            and sum("render" in p for p in pages)
                            < client.limits["renders"]
                        ):
                            try:
                                page["render"] = await render_page(
                                    client, response["url"], root
                                )
                            except Exception as e:
                                page["render"] = {"error": type(e).__name__}
                            if "data" in page["render"]:
                                page["data"] = page["render"]["data"]
                        links = []
                        for a in page["data"]["links"]:
                            u = a["url"]
                            if (
                                u
                                and in_scope(u, root)
                                and u not in visited
                                and not re.search(
                                    r"\.(pdf|jpg|png|zip|mp4|css|js|gif|svg|webp)(\?|$)",
                                    u,
                                    re.I,
                                )
                            ):
                                links.append(
                                    (
                                        u,
                                        depth + 1 if depth is not None else None,
                                        "link",
                                    )
                                )
                        queue = sorted(
                            queue + links[:200],
                            key=lambda q: q[1] if q[1] is not None else 10**9,
                        )
                        queue = queue[:2000]
                pages.append(page)
            if options.get("external_links") and options["profile"] != "lite":
                destinations = list(
                    dict.fromkeys(
                        a["url"]
                        for p in pages
                        for a in p.get("data", {}).get("links", [])
                        if a.get("url") and not in_scope(a["url"], root)
                    )
                )[:5]
                result["external_links"] = []
                for target in destinations:
                    response = await client.fetch(target)
                    result["external_links"].append(
                        {
                            k: v
                            for k, v in response.items()
                            if k not in ("body", "certificate")
                        }
                    )
            # HTTP variant checked independently; result remains unknown if budget is exhausted.
            if root.startswith("https://"):
                result["http_variant"] = {
                    k: v
                    for k, v in (
                        await client.fetch("http://" + root[8:], root=root)
                    ).items()
                    if k not in ("body", "certificate")
                }
        except CrawlLimit as e:
            warnings.append(str(e))
        except Exception as e:
            warnings.append("Observación interrumpida: " + type(e).__name__)
        result["robots"] = [
            {k: v for k, v in r.items() if k != "parser"}
            for r in client.robots.values()
        ]
        result["usage"] = dict(
            requests=client.requests,
            bytes=client.downloaded,
            elapsed_seconds=round(time.monotonic() - client.started, 2),
        )
        result["scope"] = dict(
            crawled_urls=len(pages),
            discovered_urls=len(visited | {q[0] for q in queue}),
            partial=bool(queue or warnings),
        )
        result["finished_at"] = now()
    return result
