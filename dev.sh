#!/usr/bin/env bash
# Hot-reload local dev loop.
#
# What this does:
#   - Postgres stays in Docker (no install needed) on :5450
#   - Backend (FastAPI) runs on the HOST via uvicorn --reload on :8000
#   - You run the frontend (vite) on the host in a separate terminal on :5174
#
# Frontend HMR + backend reload = sub-second iteration.
#
# Usage:
#   ./dev.sh            # starts db + backend, prints next steps
#   ./dev.sh down       # stops the db container (backend uvicorn dies with Ctrl-C)
#
# First-run setup, if needed:
#   cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
#   cd frontend && npm install

set -euo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == "down" ]]; then
  docker compose stop db
  echo "Stopped postgres. (Backend uvicorn is your foreground process — Ctrl-C it.)"
  exit 0
fi

# 1) Postgres in Docker. Compose's `db` service already maps localhost:5450 → container 5432.
echo "→ Starting postgres on localhost:5450..."
docker compose up -d db
# Wait for it to accept connections.
until docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; do
  sleep 0.5
done
echo "  ✓ postgres ready"

# Optional: stop dockerized backend/frontend so they don't compete for the ports we're about to use.
if docker compose ps backend 2>/dev/null | grep -q "Up"; then
  echo "→ Stopping dockerized backend (we're running it on the host instead)..."
  docker compose stop backend >/dev/null
fi
if docker compose ps frontend 2>/dev/null | grep -q "Up"; then
  echo "→ Stopping dockerized frontend (we'll run vite on the host instead)..."
  docker compose stop frontend >/dev/null
fi

# 2) Backend on the host with --reload.
cd backend
if [[ ! -d ".venv" ]]; then
  echo "✗ backend/.venv not found. Run:"
  echo "    cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt"
  exit 1
fi

# Env mirrors docker-compose.yml.
export DATABASE_URL="postgresql://postgres:postgres@localhost:5450/inventory"
export JWT_SECRET="${JWT_SECRET:-dev-secret-key-change-in-production}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:5174}"
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
export GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
export GOOGLE_REDIRECT_URI="${GOOGLE_REDIRECT_URI:-http://localhost:8000/api/auth/google/callback}"

cat <<EOF

────────────────────────────────────────────────────────────────────────
  Backend (host) :  http://localhost:8000   ← uvicorn --reload starting now
  Frontend (host):  http://localhost:5174   ← run \`cd frontend && npm run dev\` in another terminal
  Postgres (docker):  localhost:5450

  /api requests from the frontend are proxied to :8000 by vite.config.js,
  so cookies + CORS work end-to-end as long as you use the :5174 origin.

  Ctrl-C this process to stop the backend. \`./dev.sh down\` stops postgres.
────────────────────────────────────────────────────────────────────────

EOF

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
