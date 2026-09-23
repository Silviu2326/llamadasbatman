import asyncio
import json
import logging
from . import db
from .crawler import crawl
from .rules import evaluate
from .models import now
from .providers import pagespeed

log = logging.getLogger(__name__)


async def process(job):
    with db.connect() as c:
        lead = json.loads(
            c.execute(
                "SELECT data FROM leads WHERE id=?", (job["lead_id"],)
            ).fetchone()[0]
        )
        market = c.execute(
            "SELECT data FROM markets WHERE lead_id=?", (job["lead_id"],)
        ).fetchone()
        serps = [
            json.loads(r[0])
            for r in c.execute(
                "SELECT data FROM serps WHERE lead_id=?", (job["lead_id"],)
            )
        ]

    def cancelled():
        with db.connect() as c:
            r = c.execute(
                "SELECT cancelled FROM audits WHERE id=?", (job["id"],)
            ).fetchone()
            return not r or bool(r[0])

    options = json.loads(job["options"])
    result = await crawl(lead, options, cancelled)
    external = {"serps": serps}
    if options.get("performance") and not cancelled():
        external["performance"] = {}
        limit = {"lite": 0, "standard": 2, "extended": 6}[options["profile"]]
        for p in [p for p in result["pages"] if p.get("status") == 200][:limit]:
            if cancelled():
                break
            try:
                external["performance"][p["url"]] = await pagespeed(p["url"])
            except Exception as e:
                result["warnings"].append(str(e)[:200])
    packet = dict(
        version="2.0",
        audit_id=job["id"],
        lead=lead,
        crawl=result,
        external=external,
        market=json.loads(market[0]) if market else None,
    )
    packet["findings"] = evaluate(result, lead, external)
    state = "cancelled" if cancelled() else "completed" if result["pages"] else "failed"
    with db.connect() as c:
        c.execute(
            "UPDATE audits SET status=?,finished_at=?,packet=?,error=? WHERE id=?",
            (
                state,
                now(),
                db.encode(packet),
                "; ".join(result["warnings"]) if state == "failed" else None,
                job["id"],
            ),
        )


async def loop():
    while True:
        with db.connect() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute(
                "SELECT * FROM audits WHERE status='queued' AND cancelled=0 ORDER BY created_at LIMIT 1"
            ).fetchone()
            if row:
                c.execute("UPDATE audits SET status='running' WHERE id=?", (row["id"],))
        if not row:
            await asyncio.sleep(0.6)
            continue
        try:
            await process(dict(row))
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("Audit job failed")
            with db.connect() as c:
                c.execute(
                    "UPDATE audits SET status='failed',finished_at=?,error=? WHERE id=?",
                    (now(), type(e).__name__ + ": " + str(e)[:200], row["id"]),
                )
