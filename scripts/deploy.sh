#!/usr/bin/env bash
# Deploy Omni Ecomm Engine to Hetzner. Run on host inside /root/omni-ecomm-engine.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "[deploy] .env missing — copy .env.example and fill secrets" >&2
  exit 1
fi

git fetch --all --prune
git reset --hard origin/main

docker compose pull || true
docker compose build
docker compose up -d --remove-orphans

echo "[deploy] services up. Health:"
sleep 4
curl -sS http://127.0.0.1:8005/api/health | head -c 600
echo
