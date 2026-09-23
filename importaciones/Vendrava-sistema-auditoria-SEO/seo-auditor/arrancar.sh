#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
docker compose up --build -d
printf '\nAbre http://localhost:8787 y crea tu contraseña.\n'
