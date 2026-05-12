# CLAUDE.md — MoonFive Inventory Manager

> **Always-loaded.** This is the index. Load other `docs/claude/*.md` files when their topic applies.

## What this is

Hardware device inventory tracking system for MoonFive's commissioning pipeline (Assembly → Firmware → Calibration → QA → Staging → Deployed). Tracks ~500+ devices across product types AEMS, BEMS, CHARGER, and NETWORKING. Supports QR codes, barcode scanning, per-device audit trails, CSV import/export, bulk stage operations, per-product-type configurable stages and subsystems, and per-device board-revision tracking.

Two-app deployment: FastAPI backend + React frontend, both on Cloud Run. Live at `https://inventory-frontend-production-329274314764.us-central1.run.app` (production) and the matching `-staging-` URL.

## Stack

The **legacy two-app stack** — see [STACK.md](STACK.md) for the full list with rationale; the short form:

- **Backend**: FastAPI + asyncpg + Pydantic 2 (no ORM, raw parameterized SQL)
- **Frontend**: React 19 (Vite) + Tailwind v4 + Zustand
- **Auth**: Custom JWT cookies + Google OAuth (per-env clients)
- **DB**: PostgreSQL 16 — production lives in the `inventory` schema inside the shared `crm-db` Cloud SQL instance
- **UI**: shadcn-style locally-owned components + Lucide icons + HEX Franklin
- **Deploy**: GCP Cloud Run (two services per env) + Secret Manager (project `moonfive-crm`)
- **Testing**: pytest + pytest-asyncio (backend), Vitest + RTL (frontend), Playwright (e2e)

This is **not** the canonical MoonFive Next.js stack. See [DECISIONS.md](DECISIONS.md) ADR-001 for why this project stays on the two-app pattern.

## Critical rules

1. **Vertical slicing** — code lives in `backend/app/features/<slice>/` and `frontend/src/features/<slice>/`. Slice boundaries: `auth`, `devices`, `stages`, `subsystems`, `audit`, plus frontend-only `scanning` and `import`. Cross-slice imports must go through the slice's barrel (`__init__.py` for Python, `index.js` for JS).
2. **One file owns the DB pool**: `backend/app/shared/db.py` — the `DatabasePool` singleton with `search_path: inventory` baked in. Tests reset state via `backend/tests/conftest.py` against a separate test pool.
3. **One file owns the API client**: `frontend/src/shared/lib/api.js` — `authFetch` lives here. Components import it through `@/shared/lib/api`, never reach into useAuth's internals.
4. **Parameterized SQL only.** Always `$1, $2, …` with asyncpg. Never string-interpolate user input into a query.
5. **JWT cookie, never localStorage.** `auth_token` is httpOnly + SameSite + Secure-in-prod. Touch the cookie only in `features/auth`.
6. **TDD is the default.** Write the failing test first against the slice's barrel, then implement. See [TESTING.md](TESTING.md).
7. **Tests are colocated** with the code they exercise (`test_*.py` next to the service; `*.test.jsx` next to the component). The three-layer pyramid is non-negotiable — see [TESTING.md](TESTING.md).
8. **After every deploy, surface the URL.** When `./deploy.sh staging` finishes, report `https://inventory-frontend-staging-329274314764.us-central1.run.app`. When `./deploy.sh production` finishes, report the production URL. Always.
9. **The app is in production. Confirm before deploying to staging.** Staging is shared infra that real people use; ~5 min Cloud Build invalidates whatever they were testing. Ask first. The deploy script already enforces typed confirmation for production.
10. **Schema isolation is sacred.** Tables live in the `inventory` schema, not `public`. The pool's `search_path` enforces this. Don't write queries that reference unqualified `crm.*` tables — the search path doesn't include them.

## Pointers

| File | Load when |
|---|---|
| [STACK.md](STACK.md) | Picking a library, evaluating "should we use X?", onboarding |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Adding a feature, structural questions, where to put new code |
| [CONVENTIONS.md](CONVENTIONS.md) | Writing or reviewing any code (Python + JS naming, imports, comments) |
| [TESTING.md](TESTING.md) | Writing tests, deciding which layer, debugging flakes |
| [WORKFLOWS.md](WORKFLOWS.md) | Day-to-day commands: dev loop, single test, schema change, smoke |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Cloud Run deploys, staging/prod split, secret rotation — wraps `deploy.sh` |
| [PRE-PRODUCTION-CHECKLIST.md](PRE-PRODUCTION-CHECKLIST.md) | Before any major slice goes live — logging, tests, security, deploy safety |
| [SECURITY.md](SECURITY.md) | Handling any secret/credential — frontend exposure rules, API-key restrictions, Cloud Run SA hygiene |
| [BRAND.md](BRAND.md) | Visual / UI work — palette, typography, spacing, component patterns |
| [DOMAIN.md](DOMAIN.md) | Anything touching Device, Stage, Subsystem, BoardRevision, AuditLog, User |
| [SERIAL-NUMBERS.md](SERIAL-NUMBERS.md) | Auto-generating, validating, or displaying device serial numbers (M5-XXX-Gn-YYWWNN format with Luhn check) |
| [DECISIONS.md](DECISIONS.md) | Debugging odd choices ("why no ORM? why no Next.js? why schema.sql not Alembic?") |
| [ROADMAP.md](ROADMAP.md) | Future upgrades not yet scheduled |

## Quick development

```bash
# Bring up the full dev stack
docker compose up

# Endpoints
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# Postgres: localhost:5450 (db=inventory, user=postgres, password=postgres)

# Test pyramid
cd backend && make test                  # pytest unit + integration
cd frontend && npm run test:unit         # vitest, node
cd frontend && npm run test:component    # vitest, jsdom + RTL
cd frontend && npm run test:e2e          # playwright, real dev server, test DB
cd frontend && npm run test:all          # all three frontend layers
```

## Project conventions in one sentence

If you can't put the code under exactly one of `backend/app/features/<slice>/`, `backend/app/shared/`, `frontend/src/features/<slice>/`, `frontend/src/shared/`, or `frontend/src/app/`, stop and read [ARCHITECTURE.md](ARCHITECTURE.md).
