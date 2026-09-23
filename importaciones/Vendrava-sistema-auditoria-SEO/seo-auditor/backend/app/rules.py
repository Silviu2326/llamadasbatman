"""Versioned catalog evaluation. A rule always yields an explicit state;
missing prerequisites yield unknown, never a fabricated pass or defect.
"""

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urljoin, unquote
import pycountry
from protego import Protego
from .crawler import host, in_scope

CATALOG = json.loads((Path(__file__).parent / "catalog.json").read_text())["rules"]


def evaluate(crawl, lead, external=None):
    external = external or {}
    pages = crawl["pages"]
    by_url = {p["url"]: p for p in pages}
    by_url.update({p["requested_url"]: p for p in pages})
    incoming = Counter(
        a["url"]
        for p in pages
        for a in p.get("data", {}).get("links", [])
        if a.get("url")
    )
    intended = set(lead.get("expected_indexable", []))
    robots = crawl.get("robots", [])
    maps = crawl.get("sitemaps", [])
    valid = [p for p in pages if p.get("data")]
    output = []

    def noindex(p):
        d = p.get("data", {})
        directives = d.get("metas", {}).get("robots", []) + d.get("metas", {}).get(
            "googlebot", []
        )
        initial = p.get("initial", {}).get("metas", {})
        directives += initial.get("robots", []) + initial.get("googlebot", [])
        value = p.get("headers", {}).get("x-robots-tag", "")
        agent = "*"
        for part in value.split(","):
            match = re.match(r"\s*([a-zA-Z][\w-]*):\s*(.*)", part)
            if match and match[1].lower() not in (
                "max-snippet",
                "max-image-preview",
                "max-video-preview",
                "unavailable_after",
            ):
                agent = match[1].lower()
                part = match[2]
            if agent in ("*", "googlebot"):
                directives.append(part)
        return any(re.search(r"\b(noindex|none)\b", v, re.I) for v in directives)

    def canonical(p):
        return p.get("data", {}).get("canonical", [])

    def broken(p):
        return (
            p
            and p.get("confirmed_error")
            and (p.get("status") in (404, 410) or p.get("status", 0) >= 500)
        )

    def lang_valid(s):
        if not s:
            return False
        parts = s.split("-")
        first = parts[0].lower()
        language = pycountry.languages.get(alpha_2=first) or pycountry.languages.get(
            alpha_3=first
        )
        return bool(language) and all(
            re.fullmatch(r"[A-Za-z0-9]{2,8}", x) for x in parts[1:]
        )

    def related(p):
        return [
            by_url[a["url"]]
            for a in p.get("data", {}).get("links", [])
            if a.get("url") in by_url and in_scope(a["url"], lead["url"])
        ]

    def entities(data):
        result = []
        for x in data:
            if isinstance(x, list):
                result.extend(entities(x))
            elif isinstance(x, dict):
                result.append(x)
                if isinstance(x.get("@graph"), list):
                    result.extend(entities(x["@graph"]))
        return result

    def check(rule, p):
        rid = rule["id"]
        d = p.get("data")
        render = p.get("render", {})
        headers = p.get("headers", {})
        chain = p.get("chain", [])

        def yes(condition, detail, obs=False):
            return (
                "observed"
                if condition and (obs or rule["kind"] == "observation")
                else "warning"
                if condition and rule["kind"] == "heuristic"
                else "fail"
                if condition
                else "pass",
                detail,
            )

        def unknown(reason):
            return "unknown", reason

        def observed(detail):
            return "observed", detail

        def na(reason):
            return "not_applicable", reason

        if rid == "NET-01":
            return (
                ("pass", "Resolución y conexión verificadas.")
                if p.get("status")
                else unknown("Sin confirmación DNS suficiente; no se declara NXDOMAIN.")
            )
        if rid == "NET-02":
            if p.get("error") == "tls_invalid":
                return yes(True, "La validación TLS del transporte ha fallado.")
            return (
                ("pass", "Conexión HTTPS con validación de cadena y hostname.")
                if p.get("status") and p["url"].startswith("https://")
                else unknown("No se ha completado una conexión TLS.")
            )
        if rid == "NET-03":
            cert = p.get("certificate", {})
            if not cert.get("notAfter"):
                return unknown("Fecha de certificado no disponible en el transporte.")
            end = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(
                tzinfo=timezone.utc
            )
            days = (end - datetime.now(timezone.utc)).days
            return observed(
                f"Caducidad en {days} días; comprobar renovación si quedan menos de 14."
            )
        if rid == "NET-04":
            v = crawl.get("http_variant", {})
            return (
                yes(
                    v.get("status") == 200 and v.get("url", "").startswith("http:"),
                    "Variante HTTP: "
                    + str(v.get("status"))
                    + "; destino "
                    + v.get("url", ""),
                )
                if v.get("status")
                else unknown("Variante HTTP no comprobada.")
            )
        if rid == "NET-05":
            if render.get("mixed_content"):
                return yes(
                    True,
                    "Mensajes de bloqueo mixed-content del navegador: "
                    + str(render["mixed_content"]),
                )
            return (
                ("pass", "Sin bloqueos mixed-content observados.")
                if render.get("data") and not render.get("blocked")
                else unknown("Sin traza de render completa.")
            )
        if rid == "NET-06":
            return (
                yes(
                    p.get("status", 0) >= 500 and p.get("confirmed_error", False),
                    "Disponibilidad observada en " + str(p.get("attempts")),
                )
                if p.get("status") not in (None, 403, 429)
                else unknown("Portada inaccesible para el auditor.")
            )
        if rid == "NET-07":
            return observed(
                "Strict-Transport-Security: "
                + headers.get("strict-transport-security", "no detectado")
            )
        if rid == "NET-08":
            return yes(p.get("error") == "out_of_scope", "Destino: " + p["url"])
        if rid == "HTTP-01":
            return (
                yes(
                    any(
                        t and t.get("status") in (404, 410) and t.get("confirmed_error")
                        for t in related(p)
                    ),
                    "Destinos internos 404/410 confirmados en la muestra.",
                )
                if related(p)
                else unknown("Sin destinos internos comprobados.")
            )
        if rid == "HTTP-02":
            return (
                yes(
                    any(
                        t and t.get("status", 0) >= 500 and t.get("confirmed_error")
                        for t in related(p)
                    ),
                    "Destinos internos 5xx confirmados en la muestra.",
                )
                if related(p)
                else unknown("Sin destinos internos comprobados.")
            )
        if rid == "HTTP-03":
            return (
                yes(p.get("error") == "redirect_loop", "Cadena: " + str(chain))
                if p.get("error") in (None, "redirect_loop")
                else unknown("No se ha completado la cadena.")
            )
        if rid == "HTTP-04":
            return (
                yes(len(chain) > 2, "Saltos: " + str(len(chain)))
                if p.get("status")
                else unknown("Sin destino final comprobado.")
            )
        if rid == "HTTP-05":
            return observed(
                "Redirecciones temporales: "
                + str(sum(x["status"] in (302, 307) for x in chain))
            )
        if rid == "HTTP-06":
            return (
                yes(
                    bool(
                        re.search(
                            r"(página no encontrada|page not found|error 404)",
                            d["text"][:1200],
                            re.I,
                        )
                    ),
                    "Patrón editorial de error en respuesta 200; candidata, no clasificación Google.",
                )
                if d
                else unknown("Sin contenido HTML completo.")
            )
        if rid == "HTTP-07":
            return (
                observed(
                    "Content-Type: " + headers.get("content-type", "no disponible")
                )
                if p.get("status")
                else unknown("Sin respuesta.")
            )
        if rid == "HTTP-08":
            return (
                observed(
                    "Límite de observación: " + str(p.get("error") or p.get("status"))
                )
                if p.get("error") or p.get("status") in (401, 403, 429)
                else ("pass", "No se detectó bloqueo del auditor.")
            )
        if rid == "IDX-01":
            return (
                observed(
                    "Robots: "
                    + str(
                        [
                            {k: r[k] for k in ("url", "status", "uncertain")}
                            for r in robots
                        ]
                    )
                )
                if robots
                else unknown("Robots no accesible.")
            )
        if rid == "IDX-02":
            if not robots:
                return unknown("Robots no disponible.")
            invalid = any(
                "<html" in r["text"].lower()
                or any(
                    ":" not in ln and ln.strip() and not ln.lstrip().startswith("#")
                    for ln in r["text"].splitlines()
                )
                for r in robots
                if r["status"] == 200
            )
            return yes(
                invalid,
                "Sintaxis de líneas de robots y respuesta HTML comprobadas; directivas desconocidas no invalidan el resto.",
            )
        if rid in ("IDX-03", "IDX-05", "IDX-08"):
            r = next((r for r in robots if host(r["url"]) == host(p["url"])), None)
            if not r or r["uncertain"]:
                return unknown("Permisos Googlebot desconocidos.")
            rp = Protego.parse(r["text"])
            blocked = not rp.can_fetch(p["url"], "Googlebot")
            if rid == "IDX-03":
                return (
                    yes(
                        blocked,
                        "URL de intención indexable confirmada bloqueada para Googlebot.",
                    )
                    if p["url"] in intended
                    else observed(
                        "Bloqueo Googlebot observado: "
                        + str(blocked)
                        + "; intención sin confirmar."
                    )
                )
            if rid == "IDX-05":
                return (
                    yes(
                        blocked and noindex(p),
                        "Noindex conocido y bloqueo Googlebot en captura permitida.",
                    )
                    if d
                    else unknown("Noindex no observable.")
                )
            if not render.get("data"):
                return unknown("Sin recursos de render observados.")
            assets = [
                a["url"]
                for a in render.get("assets", [])
                if a["type"] in ("script", "stylesheet")
                and host(a["url"]) == host(p["url"])
            ]
            return (
                yes(
                    any(not rp.can_fetch(u, "Googlebot") for u in assets),
                    "CSS/JS solicitados con bloqueo Googlebot; no acredita que todo el contenido dependa del recurso.",
                )
                if assets
                else unknown("Sin recursos del origen muestreados.")
            )
        if rid.startswith("MAP-"):
            if rid == "MAP-01":
                return observed(
                    "Sitemaps localizados: "
                    + str(sum(m.get("status") == 200 for m in maps))
                )
            if not maps:
                return unknown("Sin sitemap comprobado.")
            if rid == "MAP-02":
                return (
                    yes(
                        any(
                            m.get("parse_error")
                            and m["parse_error"] != "unsupported_format"
                            or (m.get("confirmed_error") and m.get("declared"))
                            for m in maps
                        ),
                        "Errores de lectura/XML: "
                        + str(
                            [m.get("parse_error") for m in maps if m.get("parse_error")]
                        ),
                    )
                    if any(
                        m.get("status") == 200
                        or (m.get("confirmed_error") and m.get("declared"))
                        for m in maps
                    )
                    else unknown("Sitemap no localizado o formato sin soporte.")
                )
            targets = [
                by_url[u] for m in maps for u in m.get("urls", []) if u in by_url
            ]
            if rid == "MAP-03":
                return (
                    yes(
                        any(broken(t) for t in targets),
                        "Errores confirmados en URLs muestreadas del sitemap.",
                    )
                    if targets
                    else unknown("Sin URLs de sitemap muestreadas.")
                )
            if rid == "MAP-04":
                return (
                    yes(
                        any(noindex(t) for t in targets),
                        "Noindex en URLs muestreadas del sitemap.",
                    )
                    if targets
                    else unknown("Sin URLs de sitemap muestreadas.")
                )
            if rid == "MAP-05":
                return (
                    yes(
                        any(
                            t.get("chain") or any(c != t["url"] for c in canonical(t))
                            for t in targets
                        ),
                        "Redirecciones o canonicals a otra URL en muestra de sitemap.",
                    )
                    if targets
                    else unknown("Sin URLs muestreadas.")
                )
            bad = []
            for m in maps:
                for date in m.get("lastmods", []):
                    try:
                        dt = datetime.fromisoformat(date.replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        if dt > datetime.now(timezone.utc) + timedelta(days=1):
                            bad.append(date)
                    except (ValueError, TypeError):
                        bad.append(date)
            return yes(bool(bad), "lastmod inválidos/futuros: " + str(bad[:10]))
        if rid.startswith("PERF-"):
            perf = external.get("performance", {}).get(p["url"], {})
            mapping = {
                "PERF-01": ("lcp_lab_ms", 4000),
                "PERF-02": ("cls_lab", 0.25),
                "PERF-03": ("tbt_lab_ms", 600),
                "PERF-04": ("lcp_field_ms", 4000),
                "PERF-05": ("inp_field_ms", 500),
                "PERF-06": ("cls_field", 0.25),
                "PERF-07": ("ttfb_lab_ms", 1800),
            }
            if rid in mapping:
                key, limit = mapping[rid]
                if key not in perf:
                    return unknown(
                        "Medición "
                        + key
                        + " no disponible. No se sustituye por otra métrica."
                    )
                meta = perf.get("provenance", {}).get(key, perf)
                detail = f"{key}={perf[key]}; fuente={meta.get('source')}; fecha={meta.get('at')}; ámbito={meta.get('scope', 'URL')}; dispositivo={meta.get('device', 'mobile')}."
                improving = {
                    "lcp_lab_ms": 2500,
                    "lcp_field_ms": 2500,
                    "cls_lab": 0.1,
                    "cls_field": 0.1,
                    "inp_field_ms": 200,
                }.get(key)
                if improving is not None and improving < perf[key] <= limit:
                    return observed(
                        detail + " Banda intermedia: oportunidad de mejora."
                    )
                return yes(perf[key] > limit, detail)
            if rid == "PERF-08":
                return (
                    yes(
                        bool(perf.get("opportunities")),
                        "Ahorros de laboratorio: " + str(perf.get("opportunities", [])),
                    )
                    if perf
                    else unknown("Sin Lighthouse.")
                )
            return (
                observed("Categorías Lighthouse: " + str(perf.get("scores")))
                if perf.get("scores")
                else unknown("Sin puntuaciones Lighthouse.")
            )
        if rid.startswith("EXT-"):
            key = {
                "EXT-01": "indexation",
                "EXT-02": "search_console",
                "EXT-03": "serps",
                "EXT-04": "backlinks",
                "EXT-05": "local",
            }[rid]
            return (
                observed("Fuente externa aportada: " + key)
                if external.get(key)
                else unknown("Fuente " + key + " no conectada o no aportada.")
            )
        # DOM checks cannot run on non-HTML, blocked, truncated, or unrendered shells.
        if not d:
            return (
                na("Respuesta no HTML.")
                if p.get("status") == 200
                and "html" not in headers.get("content-type", "")
                else unknown("DOM válido y completo no disponible.")
            )
        if d.get("shell") and not render.get("data"):
            return unknown("Posible shell JavaScript sin render completado.")
        links = d["links"]
        cans = canonical(p)
        metas = d["metas"]
        images = d["images"]
        headings = d["headings"]
        if rid == "IDX-04":
            return (
                yes(noindex(p), "Directiva noindex efectiva.")
                if p["url"] in intended
                else observed(
                    "Noindex: " + str(noindex(p)) + "; intención no confirmada."
                )
            )
        if rid == "IDX-06":
            vals = (
                metas.get("robots", [])
                + metas.get("googlebot", [])
                + ([headers["x-robots-tag"]] if "x-robots-tag" in headers else [])
            )
            return yes(
                len({v.strip().lower() for v in vals}) > 1, "Directivas: " + str(vals)
            )
        if rid == "IDX-07":
            return observed(
                "Restricciones de snippets: " + str(d["snippet_restrictions"])
            )
        if rid == "CAN-01":
            return observed("Canonical: " + str(cans or "no detectada"))
        if rid == "CAN-02":
            http_cans = [
                urljoin(p["url"], x)
                for x in re.findall(
                    r'<([^>]+)>;\s*rel=["\']?canonical', headers.get("link", ""), re.I
                )
            ]
            return yes(
                len(set(cans + http_cans)) > 1,
                "Destinos declarados: " + str(cans + http_cans),
            )
        if rid in ("CAN-03", "CAN-04"):
            targets = [by_url.get(c) for c in cans]
            if not cans:
                return na("Sin canonical declarada.")
            if not all(targets):
                return unknown("Destino canonical fuera de muestra.")
            return yes(
                any(broken(t) if rid == "CAN-03" else noindex(t) for t in targets),
                "Estado de destinos canonical comprobados.",
            )
        if rid == "CAN-05":
            return observed(
                "Canonical a otro host: "
                + str([c for c in cans if not in_scope(c, p["url"])])
            )
        if rid == "CAN-06":
            return yes(
                bool(d["text_hash"])
                and any(
                    o["url"] != p["url"] and o["data"]["text_hash"] == d["text_hash"]
                    for o in valid
                ),
                "Hash idéntico de contenido principal; agrupar variantes sin afirmar penalización.",
            )
        if rid == "CAN-07":
            if d["word_count"] < 100 or d["text_truncated"]:
                return unknown("Se necesitan 100 palabras completas por página.")

            def shingles(t):
                w = t.lower().split()
                return {tuple(w[i : i + 5]) for i in range(len(w) - 4)}

            a = shingles(d["text"])
            similar = []
            for o in valid:
                z = o["data"]
                if (
                    o["url"] == p["url"]
                    or z["word_count"] < 100
                    or z["text_truncated"]
                    or z["language"] != d["language"]
                ):
                    continue
                b = shingles(z["text"])
                score = len(a & b) / len(a | b)
                if score >= 0.9:
                    similar.append(o["url"])
            return yes(bool(similar), "Similitud Jaccard >=0.90: " + str(similar))
        if rid == "PAGE-01":
            return yes(not d["title"], "Título: " + d["title"])
        if rid in ("PAGE-02", "PAGE-05"):
            field = "title" if rid == "PAGE-02" else "description"
            dup = [
                o["url"]
                for o in valid
                if o["url"] != p["url"]
                and o["data"][field]
                and o["data"][field].strip().casefold() == d[field].strip().casefold()
                and o["data"]["text_hash"] != d["text_hash"]
                and not set(canonical(o)) & set(cans)
            ]
            return yes(
                bool(dup), "Repetido en páginas de contenido distintas: " + str(dup)
            )
        if rid == "PAGE-03":
            return observed(
                f"Título: {len(d['title'])} caracteres; umbrales editoriales 15–65."
            )
        if rid == "PAGE-04":
            return observed(
                "Meta descripción: "
                + ("presente" if d["description"] else "no detectada")
            )
        if rid == "PAGE-06":
            return observed(
                f"Descripción: {len(d['description'])} caracteres; umbrales editoriales 70–170."
            )
        if rid == "PAGE-07":
            return yes(
                not any(h["level"] == 1 for h in headings),
                "H1 presentes: " + str(sum(h["level"] == 1 for h in headings)),
            )
        if rid == "PAGE-08":
            return observed(
                "H1 presentes: " + str(sum(h["level"] == 1 for h in headings))
            )
        if rid == "PAGE-09":
            return yes(
                any(not h["text"] for h in headings)
                or any(
                    b["level"] > a["level"] + 1 for a, b in zip(headings, headings[1:])
                ),
                "Estructura observada: " + str(headings[:15]),
            )
        if rid == "PAGE-10":
            return (
                yes(
                    d["word_count"] < 100, "Palabras extraídas: " + str(d["word_count"])
                )
                if not d["text_truncated"]
                else unknown("Contenido truncado.")
            )
        if rid == "PAGE-11":
            return observed(
                "Idioma HTML: "
                + d["language"]
                + "; sintaxis reconocida="
                + str(lang_valid(d["language"]))
            )
        if rid == "PAGE-12":
            return observed("Paginación detectada: " + str(d["pagination"]))
        if rid == "LINK-01":
            return yes(
                any(a["href"].startswith("javascript:") for a in links),
                "Enlaces con javascript: requieren revisión de su función.",
            )
        if rid in ("LINK-02", "LINK-03"):
            targets = [t for t in related(p) if t]
            return (
                yes(
                    any(
                        t.get("chain") if rid == "LINK-02" else noindex(t)
                        for t in targets
                    ),
                    "Enlaces internos a redirección/noindex en destinos observados.",
                )
                if targets
                else unknown("Sin destinos comprobados.")
            )
        if rid == "LINK-04":
            return (
                yes(
                    any(not a["label"] for a in links),
                    "Enlaces sin texto, alt ni aria-label en DOM.",
                )
                if render.get("data")
                else unknown("Nombre accesible requiere DOM renderizado.")
            )
        if rid == "LINK-05":
            return (
                yes(p["depth"] > 3, "Profundidad mínima observada: " + str(p["depth"]))
                if p["url"] in intended and p.get("depth") is not None
                else unknown("Prioridad comercial o profundidad no confirmada.")
            )
        if rid == "LINK-06":
            return yes(
                p.get("discovery") == "sitemap" and incoming[p["url"]] == 0,
                "Candidata sin enlaces entrantes dentro de la muestra, no huérfana global.",
            )
        if rid == "LINK-07":
            targets = [
                t
                for t in crawl.get("external_links", [])
                if any(a.get("url") == t["url"] for a in links)
            ]
            return (
                yes(
                    any(
                        t.get("status") in (404, 410) and t.get("confirmed_error")
                        for t in targets
                    ),
                    "Destinos externos comprobados mediante GET repetido: "
                    + str([t["url"] for t in targets]),
                )
                if targets
                else unknown(
                    "Destinos externos no comprobados por el perfil de rastreo."
                )
            )
        if rid == "LINK-08":
            if not render.get("data"):
                return unknown("Fragmentos necesitan render.")
            bad = [
                a["href"]
                for a in links
                if a["href"].startswith("#")
                and a["href"] not in ("#", "#!")
                and not a["href"].startswith(("#/", "#!/"))
                and unquote(a["href"][1:]) not in d["ids"]
            ]
            return yes(bool(bad), "Fragmentos sin id/name: " + str(bad))
        if rid == "IMG-01":
            return yes(
                any(i["alt"] is None for i in images),
                "Imágenes sin atributo alt: "
                + str(sum(i["alt"] is None for i in images)),
            )
        if rid in ("IMG-02", "IMG-03", "IMG-04", "IMG-05"):
            if not render.get("data"):
                return unknown("Requiere imágenes solicitadas y medidas de navegador.")
            assets = render.get("assets", [])
            measured = render.get("metrics", {}).get("images", [])
            if rid == "IMG-02":
                return yes(
                    any(
                        a["type"] == "image"
                        and a["status"] in (404, 410)
                        and a["confirmed_error"]
                        for a in assets
                    ),
                    "Imágenes con error confirmado al solicitarlas.",
                )
            if rid == "IMG-03":
                return yes(
                    any(
                        a["type"] == "image" and a["bytes"] > 300 * 1024 for a in assets
                    ),
                    "Umbral de descarga: 300 KiB; sin atribución automática de LCP.",
                )
            if rid == "IMG-04":
                return yes(
                    any(
                        i["width"] > 0 and i["naturalWidth"] > 2 * i["width"]
                        for i in measured
                    ),
                    "Tamaño intrínseco superior a dos veces CSS; DPR de prueba 1.",
                )
            return yes(
                any(not i["reserved"] for i in measured),
                "Sin reserva explícita width/height o aspect-ratio; revisar otras reservas CSS.",
            )
        if rid == "IMG-06":
            lcp = render.get("lcp")
            return (
                yes(
                    lcp.get("tag") == "IMG" and lcp.get("loading") == "lazy",
                    "Elemento LCP observado: " + str(lcp),
                )
                if lcp
                else unknown(
                    "Elemento LCP no identificado con suficiente trazabilidad."
                )
            )
        if rid.startswith("JS-"):
            if not render.get("data"):
                return unknown("Render no ejecutado o incompleto.")
            if rid == "JS-01":
                return observed(
                    "Palabras HTML inicial / render: "
                    + str(p["initial"]["word_count"])
                    + " / "
                    + str(d["word_count"])
                )
            if rid == "JS-02":
                return (
                    yes(
                        not d["text"] and bool(render.get("errors")),
                        "Contenido vacío con error observable.",
                    )
                    if not render.get("blocked")
                    else unknown("Render parcial por recursos bloqueados.")
                )
            if rid == "JS-03":
                return observed(
                    "Metadatos cambiados: "
                    + str(
                        [
                            k
                            for k in ("title", "canonical", "metas")
                            if d[k] != p["initial"][k]
                        ]
                    )
                )
            if rid == "JS-04":
                return yes(
                    bool(render.get("errors")),
                    "Errores JS: " + str(render.get("errors", [])),
                )
            if rid == "JS-05":
                return yes(
                    render["metrics"]["scrollWidth"] > render["metrics"]["width"] + 8,
                    "Ancho documento / viewport: "
                    + str(render["metrics"]["scrollWidth"])
                    + " / "
                    + str(render["metrics"]["width"]),
                )
            return yes(
                not metas.get("viewport")
                or not any("device-width" in v for v in metas["viewport"]),
                "Viewport: " + str(metas.get("viewport")),
            )
        if rid == "SD-01":
            return observed(
                "Bloques JSON-LD: "
                + str(len(d["structured"]))
                + "; microdata/RDFa sin adaptador semántico."
            )
        if rid == "SD-02":
            return yes(
                bool(d["structured_errors"]),
                "Bloques JSON-LD inválidos: " + str(len(d["structured_errors"])),
            )
        if rid == "SD-03":
            rules = external.get("schema_rules", [])
            checked = []
            missing = []
            for e in entities(d["structured"]):
                types = e.get("@type", [])
                types = [types] if isinstance(types, str) else types
                for rule in rules:
                    if rule["type"] not in types:
                        continue
                    until = datetime.fromisoformat(
                        rule["valid_until"].replace("Z", "+00:00")
                    )
                    if until.tzinfo is None:
                        until = until.replace(tzinfo=timezone.utc)
                    if until < datetime.now(timezone.utc):
                        continue
                    checked.append(rule["type"])
                    missing.extend(
                        rule["type"] + "." + f
                        for f in rule["required_fields"]
                        if f not in e or e[f] is None or e[f] == ""
                    )
            return (
                yes(
                    bool(missing),
                    "Ruleset aportado vigente; campos requeridos ausentes: "
                    + str(missing),
                )
                if checked
                else unknown(
                    "Sin ruleset fechado vigente para los tipos presentes; no se inventan requisitos."
                )
            )
        if rid == "SD-04":
            seen = {}
            conflicts = []
            for e in entities(d["structured"]):
                if not isinstance(e.get("@id"), str):
                    continue
                for k, v in e.items():
                    if isinstance(v, (str, int, float, bool)):
                        key = (e["@id"], k)
                        if key in seen and seen[key] != v:
                            conflicts.append(key)
                        seen[key] = v
            return yes(
                bool(conflicts),
                "Campos contradictorios para mismo @id: " + str(conflicts),
            )
        if rid == "SD-05":
            comparisons = [
                c
                for c in external.get("entity_comparisons", [])
                if c["url"] == p["url"] and c["identity_confirmed"]
            ]

            def norm(value, field):
                return (
                    re.sub(r"\D", "", value)
                    if field == "telephone"
                    else " ".join(value.casefold().split())
                )

            mismatches = [
                c["entity_id"] + ":" + c["field"]
                for c in comparisons
                if norm(c["structured_value"], c["field"])
                != norm(c["visible_value"], c["field"])
            ]
            return (
                yes(
                    bool(mismatches),
                    "Comparaciones aportadas con identidad confirmada; discrepancias: "
                    + str(mismatches),
                )
                if comparisons
                else unknown(
                    "Correspondencia de entidad y variante con contenido visible no acreditada."
                )
            )
        if rid == "LOCAL-01":
            return observed(
                "Enlaces de contacto: "
                + str(
                    [
                        a["href"]
                        for a in links
                        if a["href"].startswith(("tel:", "mailto:"))
                    ]
                )[:900]
            )
        if rid == "LOCAL-02":
            contacts = [
                c
                for c in external.get("location_contacts", [])
                if c["identity_confirmed"]
            ]
            identities = {c["location_id"] for c in contacts if c["url"] == p["url"]}
            groups = {}
            for c in contacts:
                if c["location_id"] not in identities:
                    continue
                value = (
                    re.sub(r"\D", "", c["value"])
                    if c["kind"] == "telephone"
                    else c["value"].casefold().strip()
                )
                groups.setdefault((c["location_id"], c["kind"]), set()).add(value)
            return (
                yes(
                    any(len(v) > 1 for v in groups.values()),
                    "Datos normalizados por sede confirmada: " + str(groups),
                )
                if identities
                else unknown(
                    "Identidad de sede no confirmada; distintos teléfonos pueden ser departamentos."
                )
            )
        if rid == "LOCAL-03":
            bad = [
                a["href"]
                for a in links
                if (
                    a["href"].startswith("mailto:")
                    and not re.fullmatch(
                        r"[^@\s]+@[^@\s]+\.[^@\s]+",
                        unquote(a["href"][7:].split("?")[0]),
                    )
                )
                or (
                    a["href"].startswith("tel:")
                    and not re.fullmatch(
                        r"\+?[0-9(). -]{5,25}", unquote(a["href"][4:].split(";")[0])
                    )
                )
            ]
            return yes(bool(bad), "Enlaces de contacto malformados: " + str(bad))
        if rid == "LOCAL-04":
            return yes(
                any(
                    re.search(
                        r"contact|reserv|cita", a["label"] + " " + a["href"], re.I
                    )
                    and broken(by_url.get(a["url"]))
                    for a in links
                ),
                "Rutas de contacto identificadas con error confirmado.",
            )
        if rid == "LOCAL-05":
            return observed(
                "Formularios: " + str(d["forms"])[:900] + "; no se ha enviado ninguno."
            )
        if rid == "INT-01":
            return (
                observed("Anotaciones: " + str(d["hreflang"]))
                if d["hreflang"]
                else na("Sin variantes verificadas.")
            )
        if rid == "INT-02":
            return (
                yes(
                    any(
                        (x["lang"] != "x-default" and not lang_valid(x["lang"]))
                        or not x["raw"].startswith(("https://", "http://"))
                        for x in d["hreflang"]
                    ),
                    "Códigos/URLs hreflang comprobados con pycountry.",
                )
                if d["hreflang"]
                else na("Sin hreflang.")
            )
        if rid in ("INT-03", "INT-04"):
            targets = [by_url.get(x["url"]) for x in d["hreflang"]]
            if not targets:
                return na("Sin hreflang.")
            if not all(t and t.get("data") for t in targets):
                return unknown("Versiones fuera de muestra o sin DOM.")
            if rid == "INT-03":
                return yes(
                    any(
                        not any(x["url"] == p["url"] for x in t["data"]["hreflang"])
                        for t in targets
                    ),
                    "Retorno recíproco entre versiones comprobadas.",
                )
            return yes(
                any(broken(t) or noindex(t) for t in targets),
                "Estado/noindex de versiones comprobadas; canonicals ambiguas requieren interpretación.",
            )
        raise AssertionError("Regla sin implementación: " + rid)

    for rule in CATALOG:
        targets = [pages[0]] if rule["scope"] in ("origin", "site") and pages else pages
        if not targets:
            targets = [
                dict(url=lead["url"], requested_url=lead["url"], error="no_observation")
            ]
        for p in targets:
            try:
                state, detail = check(rule, p)
            except (ValueError, KeyError, TypeError) as e:
                state, detail = "unknown", "Evidencia incompatible: " + type(e).__name__
            eid = (
                "ev_"
                + hashlib.sha256((rule["id"] + p["url"]).encode()).hexdigest()[:16]
            )
            output.append(
                dict(
                    id=eid,
                    rule_id=rule["id"],
                    url=p["url"],
                    state=state,
                    priority=rule["max_priority"]
                    if state in ("fail", "warning")
                    else None,
                    kind=rule["kind"],
                    category=rule["category"],
                    title=rule["name"],
                    detail=detail,
                    guard=rule["false_positive_guard"],
                    action=rule["base_action"],
                    source_url=rule["source_url"],
                    observed_at=p.get("at", crawl.get("finished_at")),
                    page_id=p.get("id"),
                )
            )
    return output
