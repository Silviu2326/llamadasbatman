import json
import os
import secrets
import sqlite3
from pathlib import Path
from .models import now

DATA = Path(os.getenv("DATA_DIR", "./data"))


def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DATA / "auditor.db", timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def init():
    with connect() as c:
        c.executescript("""PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,domain TEXT UNIQUE NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audits(id TEXT PRIMARY KEY,lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,status TEXT NOT NULL,options TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,error TEXT,packet TEXT,analysis TEXT,cancelled INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS markets(lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,data TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS serps(id TEXT PRIMARY KEY,lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS scenarios(id TEXT PRIMARY KEY,lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,created_at TEXT NOT NULL,data TEXT NOT NULL,result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS costs(id INTEGER PRIMARY KEY,created_at TEXT NOT NULL,provider TEXT NOT NULL,operation TEXT NOT NULL,amount REAL,unit TEXT NOT NULL,detail TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS audits_queue ON audits(status,created_at);
        """)
        # A process interruption never leaves a job falsely running. Explicit retry is safe.
        c.execute(
            "UPDATE audits SET status='interrupted',error='El servidor se interrumpió. Puedes repetir la auditoría.' WHERE status='running'"
        )
        if not c.execute("SELECT 1 FROM settings WHERE key='secret'").fetchone():
            c.execute(
                "INSERT INTO settings VALUES (?,?)", ("secret", secrets.token_hex(32))
            )


def uid(prefix):
    return prefix + "_" + secrets.token_hex(8)


def encode(v):
    return json.dumps(v, ensure_ascii=False, allow_nan=False, default=str)


def get_setting(key):
    with connect() as c:
        r = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return r[0] if r else None


def cost(provider, operation, amount=None, unit="USD", detail=""):
    with connect() as c:
        c.execute(
            "INSERT INTO costs(created_at,provider,operation,amount,unit,detail) VALUES (?,?,?,?,?,?)",
            (now(), provider, operation, amount, unit, detail),
        )
