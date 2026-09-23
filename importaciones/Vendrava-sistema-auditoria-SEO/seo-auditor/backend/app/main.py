import asyncio
import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import Field
from . import db, worker, providers
from .models import (
    ExternalInput,
    Strict,
    LeadInput,
    AuditInput,
    MarketInput,
    Serp,
    Scenario,
    ProviderRequest,
    now,
)
from .economics import calculate, qualify, competitor_summary
from .analysis import analyze, build_ai_packet
from .reports import report_html
from .rules import CATALOG, evaluate


@asynccontextmanager
async def lifespan(app):
    db.init()
    task = asyncio.create_task(worker.loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Vendrava Auditorías",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)
PUBLIC = {"/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/health"}
failed_logins = {}


@app.middleware("http")
async def security(request: Request, call_next):
    if request.url.path.startswith("/api/") or request.url.path in (
        "/docs",
        "/openapi.json",
        "/redoc",
    ):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            allowed = os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:8787,http://127.0.0.1:8787,http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if origin and origin not in allowed:
                return JSONResponse({"detail": "Origen no permitido."}, 403)
            if int(request.headers.get("content-length", "0")) > 2 * 1024**2:
                return JSONResponse({"detail": "Solicitud demasiado grande."}, 413)
            # Read with a streaming cap, then replay through Starlette's body cache.
            data = b""
            async for chunk in request.stream():
                data += chunk
                if len(data) > 2 * 1024**2:
                    return JSONResponse({"detail": "Solicitud demasiado grande."}, 413)
            request._body = data
        if request.url.path not in PUBLIC:
            token = request.cookies.get("audit_session", "")
            with db.connect() as c:
                session = c.execute(
                    "SELECT expires FROM sessions WHERE token=?",
                    (hashlib.sha256(token.encode()).hexdigest(),),
                ).fetchone()
            if not session or session["expires"] < time.time():
                return JSONResponse({"detail": "Inicia sesión."}, 401)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    )
    return response


@app.exception_handler(ValueError)
async def value_error(request, exc):
    return JSONResponse({"detail": str(exc)}, 422)


@app.exception_handler(providers.ProviderError)
async def provider_error(request, exc):
    return JSONResponse({"detail": str(exc)}, 422)


class Credentials(Strict):
    password: str = Field(min_length=12, max_length=200)


class CSVInput(Strict):
    content: str = Field(max_length=1000000)


class IDs(Strict):
    ids: list[str] = Field(min_length=1, max_length=100)
    profile: str = "lite"


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/auth/status")
def auth_status(request: Request):
    token = request.cookies.get("audit_session", "")
    with db.connect() as c:
        r = c.execute(
            "SELECT expires FROM sessions WHERE token=?",
            (hashlib.sha256(token.encode()).hexdigest(),),
        ).fetchone()
    return {
        "setup_required": db.get_setting("password") is None,
        "authenticated": bool(r and r["expires"] > time.time()),
    }


@app.post("/api/auth/setup")
def setup(data: Credentials):
    salt = secrets.token_hex(16)
    value = (
        salt
        + ":"
        + hashlib.pbkdf2_hmac(
            "sha256", data.password.encode(), salt.encode(), 300000
        ).hex()
    )
    with db.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        if c.execute("SELECT 1 FROM settings WHERE key='password'").fetchone():
            raise HTTPException(409, "La cuenta ya está creada.")
        c.execute("INSERT INTO settings VALUES (?,?)", ("password", value))
    return {"ok": True}


@app.post("/api/auth/login")
def login(data: Credentials, request: Request, response: Response):
    ip = request.client.host if request.client else "local"
    attempts = failed_logins.setdefault(ip, [])
    attempts[:] = [t for t in attempts if t > time.time() - 600]
    if len(attempts) >= 8:
        raise HTTPException(429, "Espera diez minutos antes de volver a intentarlo.")
    saved = db.get_setting("password")
    if not saved:
        raise HTTPException(409, "Crea primero la contraseña de administrador.")
    salt, password = saved.split(":")
    actual = hashlib.pbkdf2_hmac(
        "sha256", data.password.encode(), salt.encode(), 300000
    ).hex()
    if not hmac.compare_digest(password, actual):
        attempts.append(time.time())
        raise HTTPException(401, "Contraseña incorrecta.")
    token = secrets.token_urlsafe(40)
    with db.connect() as c:
        c.execute("DELETE FROM sessions WHERE expires<?", (time.time(),))
        c.execute(
            "INSERT INTO sessions VALUES (?,?)",
            (hashlib.sha256(token.encode()).hexdigest(), time.time() + 12 * 3600),
        )
    response.set_cookie(
        "audit_session",
        token,
        httponly=True,
        samesite="strict",
        secure=os.getenv("COOKIE_SECURE", "false") == "true",
        max_age=43200,
    )
    return {"ok": True}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    with db.connect() as c:
        c.execute(
            "DELETE FROM sessions WHERE token=?",
            (
                hashlib.sha256(
                    request.cookies.get("audit_session", "").encode()
                ).hexdigest(),
            ),
        )
    response.delete_cookie("audit_session")
    return {"ok": True}


def lead_get(id):
    with db.connect() as c:
        row = c.execute("SELECT data FROM leads WHERE id=?", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Empresa no encontrada.")
    return json.loads(row[0])


def audit_get(id):
    with db.connect() as c:
        r = c.execute("SELECT * FROM audits WHERE id=?", (id,)).fetchone()
    if not r:
        raise HTTPException(404, "Auditoría no encontrada.")
    result = dict(r)
    for k in ("options", "packet", "analysis"):
        result[k] = json.loads(result[k]) if result[k] else None
    return result


def market_get(id):
    with db.connect() as c:
        r = c.execute("SELECT data FROM markets WHERE lead_id=?", (id,)).fetchone()
    return MarketInput.model_validate_json(r[0]) if r else MarketInput(keywords=[])


def serps_get(id):
    with db.connect() as c:
        return [
            json.loads(r[0])
            for r in c.execute("SELECT data FROM serps WHERE lead_id=?", (id,))
        ]


def scenarios_get(id):
    with db.connect() as c:
        rows = c.execute(
            "SELECT * FROM scenarios WHERE lead_id=? ORDER BY created_at DESC", (id,)
        ).fetchall()
    return [
        dict(
            id=r["id"],
            created_at=r["created_at"],
            data=json.loads(r["data"]),
            result=json.loads(r["result"]),
        )
        for r in rows
    ]


def create_lead(data, demo=False):
    lead = data.model_dump()
    lead.update(id=db.uid("lead"), created_at=now(), demo=demo)
    domain = urlsplit(lead["url"]).hostname.removeprefix("www.")
    with db.connect() as c:
        if c.execute("SELECT 1 FROM leads WHERE domain=?", (domain,)).fetchone():
            raise HTTPException(409, "Ya existe una empresa con ese dominio.")
        c.execute(
            "INSERT INTO leads VALUES (?,?,?,?)",
            (lead["id"], domain, db.encode(lead), lead["created_at"]),
        )
    return lead


@app.get("/api/leads")
def list_leads():
    with db.connect() as c:
        leads = []
        for r in c.execute("SELECT data FROM leads ORDER BY created_at DESC"):
            lead = json.loads(r[0])
            last = c.execute(
                "SELECT id,status,created_at,error FROM audits WHERE lead_id=? ORDER BY created_at DESC LIMIT 1",
                (lead["id"],),
            ).fetchone()
            lead["last_audit"] = dict(last) if last else None
            leads.append(lead)
    return leads


@app.post("/api/leads", status_code=201)
def add_lead(data: LeadInput):
    return create_lead(data)


@app.put("/api/leads/{id}")
def update_lead(id: str, data: LeadInput):
    old = lead_get(id)
    new = data.model_dump()
    new.update(id=id, created_at=old["created_at"], demo=old.get("demo", False))
    # Domain is immutable: historical evidence belongs to the original business.
    if new["url"] != old["url"]:
        raise HTTPException(409, "Crea otro lead para auditar una URL raíz diferente.")
    with db.connect() as c:
        c.execute("UPDATE leads SET data=? WHERE id=?", (db.encode(new), id))
    return new


@app.delete("/api/leads/{id}")
def delete_lead(id: str):
    lead_get(id)
    with db.connect() as c:
        if c.execute(
            "SELECT 1 FROM audits WHERE lead_id=? AND status='running'", (id,)
        ).fetchone():
            raise HTTPException(
                409, "Cancela y espera a que termine el trabajo antes de eliminar."
            )
        c.execute("DELETE FROM leads WHERE id=?", (id,))
    return {"ok": True}


@app.post("/api/leads/import")
def import_leads(data: CSVInput):
    reader = csv.DictReader(io.StringIO(data.content.lstrip("\ufeff")))
    if not reader.fieldnames or not {"name", "url"} <= set(reader.fieldnames):
        raise ValueError(
            "CSV requiere columnas name,url. Opcionales: sector,country,language,business_model."
        )
    results = []
    rows = list(reader)
    if len(rows) > 100:
        raise ValueError(
            "Máximo 100 leads por importación; no se ha importado ninguna fila."
        )
    for i, row in enumerate(rows):
        try:
            payload = {
                k: v
                for k, v in row.items()
                if k
                in ("name", "url", "sector", "country", "language", "business_model")
                and v
            }
            lead = create_lead(LeadInput(**payload))
            results.append({"row": i + 2, "id": lead["id"], "status": "created"})
        except (ValueError, HTTPException) as e:
            results.append(
                {
                    "row": i + 2,
                    "status": "rejected",
                    "reason": str(getattr(e, "detail", e))[:300],
                }
            )
    return results


@app.get("/api/leads/{id}")
def detail(id: str):
    lead = lead_get(id)
    with db.connect() as c:
        audits = [
            dict(r)
            for r in c.execute(
                "SELECT id,status,created_at,finished_at,error FROM audits WHERE lead_id=? ORDER BY created_at DESC",
                (id,),
            )
        ]
    return dict(
        lead=lead,
        audits=audits,
        market=market_get(id).model_dump(),
        serps=serps_get(id),
        scenarios=scenarios_get(id),
    )


@app.post("/api/leads/{id}/audits", status_code=202)
def queue_audit(id: str, options: AuditInput):
    lead = lead_get(id)
    if lead.get("demo"):
        raise HTTPException(
            422,
            "El dominio de demostración es ficticio. Crea un lead con una web real para rastrear.",
        )
    aid = db.uid("audit")
    with db.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        if c.execute(
            "SELECT 1 FROM audits WHERE lead_id=? AND status IN ('running','queued')",
            (id,),
        ).fetchone():
            raise HTTPException(409, "Ya hay una auditoría en curso para este lead.")
        c.execute(
            "INSERT INTO audits(id,lead_id,status,options,created_at) VALUES (?,?,?,?,?)",
            (aid, id, "queued", db.encode(options.model_dump()), now()),
        )
    return {"id": aid, "status": "queued"}


@app.post("/api/audits/batch")
def audit_batch(data: IDs):
    options = AuditInput(profile=data.profile)
    results = []
    for id in data.ids:
        try:
            results.append(queue_audit(id, options))
        except HTTPException as e:
            results.append({"lead_id": id, "error": e.detail})
    return results


@app.get("/api/audits/{id}")
def get_audit(id: str):
    return audit_get(id)


@app.post("/api/audits/{id}/cancel")
def cancel_audit(id: str):
    audit_get(id)
    with db.connect() as c:
        c.execute(
            "UPDATE audits SET cancelled=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END WHERE id=?",
            (id,),
        )
    return {"ok": True}


@app.post("/api/audits/{id}/analysis")
async def run_analysis(id: str):
    audit = audit_get(id)
    if audit["status"] != "completed" or not audit["packet"]:
        raise HTTPException(409, "Completa primero la auditoría automática.")
    calculations = [s["result"] for s in scenarios_get(audit["lead_id"])[:3]]
    result = await analyze(audit["packet"], calculations)
    with db.connect() as c:
        c.execute("UPDATE audits SET analysis=? WHERE id=?", (db.encode(result), id))
    return result


@app.get("/api/audits/{id}/ai-input")
def ai_input(id: str):
    audit = audit_get(id)
    if not audit["packet"]:
        raise HTTPException(409, "Expediente no disponible.")
    return build_ai_packet(
        audit["packet"], [s["result"] for s in scenarios_get(audit["lead_id"])[:3]]
    )


@app.get("/api/catalog")
def catalog():
    return CATALOG


@app.get("/api/connections")
def connections():
    return providers.status()


@app.get("/api/costs")
def costs():
    with db.connect() as c:
        return [
            dict(r) for r in c.execute("SELECT * FROM costs ORDER BY id DESC LIMIT 200")
        ]


@app.put("/api/leads/{id}/market")
def save_market(id: str, data: MarketInput):
    lead_get(id)
    q = qualify(data)
    with db.connect() as c:
        c.execute(
            "INSERT INTO markets VALUES (?,?,?) ON CONFLICT(lead_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
            (id, db.encode(data.model_dump()), now()),
        )
    return q


@app.post("/api/validate/market")
def validate_market(data: MarketInput):
    qualify(data)
    return data.model_dump()


@app.post("/api/validate/scenario")
def validate_scenario(data: Scenario):
    return data.model_dump()


@app.post("/api/leads/{id}/market/import")
def import_market(id: str, data: CSVInput):
    rows = []
    for row in csv.DictReader(io.StringIO(data.content.lstrip("\ufeff"))):
        if "volume" in row:
            row["volume"] = float(row["volume"]) if row["volume"] else None
        if "fit_weight" in row:
            row["fit_weight"] = float(row["fit_weight"] or 0)
        if "brand" in row:
            row["brand"] = row["brand"].lower() in ("true", "1", "yes", "sí")
        rows.append(row)
    model = MarketInput(keywords=rows, overlap_reviewed=False)
    save_market(id, model)
    return model.model_dump()


@app.post("/api/leads/{id}/serps")
def add_serp(id: str, data: Serp):
    lead_get(id)
    sid = db.uid("serp")
    with db.connect() as c:
        c.execute(
            "INSERT INTO serps VALUES (?,?,?)",
            (sid, id, db.encode(data.model_dump(mode="json"))),
        )
    return {"id": sid}


@app.get("/api/leads/{id}/competitors")
def competitors(id: str):
    return competitor_summary(market_get(id), serps_get(id), lead_get(id)["url"])


@app.post("/api/leads/{id}/calculate")
def preview_calc(id: str, data: Scenario):
    lead_get(id)
    return calculate(market_get(id), data)


@app.post("/api/leads/{id}/scenarios", status_code=201)
def save_scenario(id: str, data: Scenario):
    lead = lead_get(id)
    result = calculate(market_get(id), data)
    result["business_snapshot"] = lead
    sid = db.uid("scenario")
    created = now()
    with db.connect() as c:
        c.execute(
            "INSERT INTO scenarios VALUES (?,?,?,?,?)",
            (sid, id, created, db.encode(data.model_dump()), db.encode(result)),
        )
    return dict(id=sid, created_at=created, data=data.model_dump(), result=result)


@app.post("/api/leads/{id}/providers/volumes")
async def fetch_volumes(id: str, data: ProviderRequest):
    lead_get(id)
    result = await providers.volumes(data)
    # Provider results are proposals: user reviews grouping and commercial fit before save.
    return {"keywords": result["keywords"], "overlap_reviewed": False}


@app.post("/api/leads/{id}/providers/serps")
async def fetch_serps(id: str, data: ProviderRequest):
    lead_get(id)
    snapshots = await providers.serps(data)
    for s in snapshots:
        s.pop("raw", None)
        add_serp(id, Serp.model_validate(s))
    return {"imported": len(snapshots)}


@app.post("/api/discover")
async def discover(data: ProviderRequest):
    snapshots = await providers.serps(data)
    found = {}
    for s in snapshots:
        for item in s["items"]:
            domain = urlsplit(item["url"]).hostname
            if domain not in found:
                found[domain] = dict(
                    name=item["title"][:180] or domain,
                    url="https://" + domain,
                    source=s["source"],
                    keyword=s["keyword"],
                )
    return list(found.values())


@app.post("/api/leads/{id}/market/classify")
async def classify(id: str):
    from .analysis import classify_market

    return await classify_market(lead_get(id), market_get(id))


@app.post("/api/audits/{id}/external", status_code=201)
def enrich_audit(id: str, data: ExternalInput):
    import copy
    from .crawler import in_scope
    from .models import normalize_url

    old = audit_get(id)
    if old["status"] != "completed" or not old["packet"]:
        raise HTTPException(409, "Completa primero la auditoría.")
    packet = copy.deepcopy(old["packet"])
    external = packet.setdefault("external", {})
    aid = db.uid("audit")
    for key in ("search_console", "indexation", "backlinks", "local"):
        values = getattr(data, key)
        if values:
            external[key] = {
                "source": data.source,
                "at": data.captured_at.isoformat(),
                "rows": values,
            }
    for key in ("schema_rules", "entity_comparisons", "location_contacts"):
        values = getattr(data, key)
        if values:
            external[key] = [v.model_dump(mode="json") for v in values]
    for url, metrics in data.performance.items():
        url = normalize_url(url)
        if not in_scope(url, packet["lead"]["url"]):
            raise ValueError("Métricas fuera del dominio auditado.")
        if metrics.scope == "URL" and metrics.sufficient_sample:
            target = external.setdefault("performance", {}).setdefault(url, {})
            record = metrics.model_dump(mode="json", exclude_none=True)
            provenance = target.setdefault("provenance", {})
            for key, value in record.items():
                if key.endswith("_field_ms") or key == "cls_field":
                    target[key] = value
                    provenance[key] = record
        else:
            external.setdefault("origin_or_insufficient_metrics", {})[url] = (
                metrics.model_dump(mode="json")
            )
    packet["audit_id"] = aid
    packet["parent_audit_id"] = id
    packet["enriched_at"] = now()
    packet["findings"] = evaluate(packet["crawl"], packet["lead"], external)
    with db.connect() as c:
        c.execute(
            "INSERT INTO audits(id,lead_id,status,options,created_at,finished_at,packet) VALUES (?,?,?,?,?,?,?)",
            (
                aid,
                old["lead_id"],
                "completed",
                db.encode(old["options"]),
                now(),
                now(),
                db.encode(packet),
            ),
        )
    return {"id": aid, "parent_audit_id": id}


@app.get("/api/leads/{id}/export.json")
def export_json(id: str):
    info = detail(id)
    info["audit_details"] = [audit_get(a["id"]) for a in info["audits"]]
    return Response(
        db.encode(info),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="auditoria.json"'},
    )


@app.get("/api/leads/{id}/report.html")
def export_report(id: str):
    info = detail(id)
    audits = [a for a in info["audits"] if a["status"] == "completed"]
    audit = audit_get(audits[0]["id"]) if audits else None
    return HTMLResponse(
        report_html(
            info["lead"], audit, info["scenarios"], info["market"], competitors(id)
        ),
        headers={"Content-Disposition": 'attachment; filename="informe-seo.html"'},
    )


@app.post("/api/demo")
def demo():
    from .crawler import extract

    with db.connect() as c:
        existing = c.execute(
            "SELECT id FROM leads WHERE domain='envases.example'"
        ).fetchone()
    if existing:
        return {"id": existing[0]}
    lead = create_lead(
        LeadInput(
            name="Envases Demo",
            url="https://envases.example",
            sector="Industria",
            services=["Envases a medida"],
            minimum_order="Tiradas industriales; dato ilustrativo",
        ),
        True,
    )
    for name, url, sector in [
        ("Clínica Demo", "https://clinica.example", "Salud"),
        ("Taller Demo", "https://taller.example", "Automoción"),
    ]:
        try:
            create_lead(LeadInput(name=name, url=url, sector=sector), True)
        except HTTPException:
            pass
    html = '<html lang="es"><head><title>Envases Demo · Fabricación a medida</title></head><body><main><h2>Fabricamos envases a medida</h2><p>Ejemplo ficticio de un fabricante industrial. Este contenido solo sirve para probar la aplicación.</p><img src="caja.jpg"><a href="/contacto">Contacto</a></main></body></html>'
    p = dict(
        url=lead["url"],
        requested_url=lead["url"],
        id="page_demo",
        status=200,
        headers={"content-type": "text/html"},
        at=now(),
        chain=[],
        depth=0,
        discovery="home",
        data=extract(html, lead["url"]),
        initial=extract(html, lead["url"]),
    )
    crawl_data = dict(
        version="2.0",
        started_at=now(),
        finished_at=now(),
        root=lead["url"],
        pages=[p],
        robots=[],
        sitemaps=[],
        warnings=["Ejemplo ficticio. No se ha rastreado una empresa real."],
        scope={"crawled_urls": 1, "discovered_urls": 2, "partial": True},
        usage={"requests": 0, "bytes": 0, "elapsed_seconds": 0},
        profile="lite",
    )
    aid = db.uid("audit")
    packet = dict(
        version="2.0",
        audit_id=aid,
        lead=lead,
        crawl=crawl_data,
        external={},
        market=None,
        findings=evaluate(crawl_data, lead),
    )
    with db.connect() as c:
        c.execute(
            "INSERT INTO audits(id,lead_id,status,options,created_at,finished_at,packet) VALUES (?,?,?,?,?,?,?)",
            (
                aid,
                lead["id"],
                "completed",
                '{"profile":"lite"}',
                now(),
                now(),
                db.encode(packet),
            ),
        )
    market = MarketInput(
        keywords=[
            dict(
                keyword="fabricante envases personalizados",
                group_id="industrial",
                volume=2250,
                status="included",
                reason="Supuesto del ejemplo industrial.",
                source="Datos ficticios para demostración",
                period=now()[:7],
            ),
            dict(
                keyword="cajas para mudanzas",
                group_id="mudanzas",
                volume=5250,
                status="excluded",
                reason="Comprador particular fuera del segmento del ejemplo.",
                source="Datos ficticios para demostración",
                period=now()[:7],
            ),
        ],
        overlap_reviewed=True,
    )
    save_market(lead["id"], market)
    save_scenario(lead["id"], Scenario())
    add_serp(
        lead["id"],
        Serp(
            keyword="fabricante envases personalizados",
            geography="ES",
            captured_at=now(),
            source="SERP ficticia de demostración",
            items=[
                {
                    "position": 1,
                    "url": "https://competidor.example/envases",
                    "title": "Competidor ficticio",
                    "kind": "direct",
                }
            ],
        ),
    )
    return {"id": lead["id"]}


DIST = Path(
    os.getenv("FRONTEND_DIST", str(Path(__file__).parents[2] / "frontend" / "dist"))
)
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Ruta no encontrada.")
        return FileResponse(DIST / "index.html")
