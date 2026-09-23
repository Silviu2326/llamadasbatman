"""Create a consistent SQLite backup without stopping the application."""

import argparse
import sqlite3
from pathlib import Path
from .db import DATA


def main():
    parser = argparse.ArgumentParser(
        description="Copia consistente de la base de auditorías"
    )
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    source = DATA / "auditor.db"
    if not source.exists():
        parser.error("La base de datos no existe en DATA_DIR.")
    if args.destination.exists():
        parser.error(
            "El destino ya existe. Elige otro nombre para conservar la copia anterior."
        )
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as origin, sqlite3.connect(args.destination) as target:
        origin.backup(target)
    print("Copia creada:", args.destination)


if __name__ == "__main__":
    main()
