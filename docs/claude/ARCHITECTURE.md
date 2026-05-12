# ARCHITECTURE.md

## Two apps, both vertically sliced

```
inventory/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entry — mounts feature routers
│   │   ├── features/              # vertical slices
│   │   │   ├── auth/              # Google OAuth + JWT cookies + role guards
│   │   │   ├── devices/           # device CRUD, QR codes, CSV import/export
│   │   │   ├── stages/            # commissioning pipeline stages
│   │   │   ├── subsystems/        # subsystems + board revisions
│   │   │   ├── build_steps/       # product_revisions + firmware_versions
│   │   │   │                      #   + authored build steps + worker progress
│   │   │   └── audit/             # audit log
│   │   └── shared/
│   │       ├── db.py              # DatabasePool singleton (search_path=inventory)
│   │       ├── config.py          # env-driven config
│   │       ├── schema.sql         # DDL (CREATE TABLE IF NOT EXISTS …)
│   │       ├── photo_storage.py   # GCS chokepoint (upload, signed URL, delete)
│   │       └── models.py          # shared enums (ProductType)
│   ├── tests/
│   │   ├── conftest.py            # pg_pool, clean_db, auth_user, client fixtures
│   │   └── e2e/                   # cross-slice integration (auth + devices)
│   ├── Dockerfile
│   ├── Makefile                   # make test / test-unit / test-int
│   ├── pyproject.toml             # pytest config
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # React root
│   │   ├── app/
│   │   │   ├── App.jsx            # router
│   │   │   └── routes/            # thin route components that compose slices
│   │   ├── features/              # vertical slices
│   │   │   ├── auth/              # AuthGate + useAuth
│   │   │   ├── devices/           # Dashboard + Detail pages + components + store
│   │   │   ├── scanning/          # barcode scanner page + components
│   │   │   ├── import/            # bulk CSV import page + components
│   │   │   ├── audit/             # activity feed + audit timeline
│   │   │   ├── stages/            # admin stages panel
│   │   │   ├── subsystems/        # admin subsystems panel
│   │   │   └── buildSteps/        # admin (revisions/firmware/steps) +
│   │   │                          #   worker walkthrough + per-step runner
│   │   └── shared/
│   │       ├── components/        # ui/ + layout/AppSidebar
│   │       └── lib/               # api.js (authFetch) + utils.js
│   ├── e2e/                       # Playwright specs + fixtures
│   ├── vitest.config.js
│   ├── playwright.config.js
│   ├── Dockerfile / nginx.conf
│   └── package.json
├── docker-compose.yml             # dev: db :5450, backend :8000, frontend :5173
├── docker-compose.test.yml        # test DB on :5451
├── deploy.sh                      # ./deploy.sh staging|production
├── deploy.md
└── docs/claude/                   # ← you are here
```

## Slice contents

Each backend `features/<slice>/` may contain:

```
<slice>/
├── __init__.py        # the slice's public barrel — exports router + service callables
├── routes.py          # FastAPI routers (may be multiple, e.g. devices/ has routes.py + qr.py)
├── services.py        # business logic, calls into shared.db
├── models.py          # Pydantic request/response models + any slice-local enums
├── dependencies.py    # (auth only) get_current_user, require_role
├── test_*.py          # colocated unit tests (mocked DB)
└── test_*_integration.py   # colocated integration tests (real test DB)
```

Each frontend `features/<slice>/` may contain:

```
<slice>/
├── index.js           # the slice's public barrel
├── pages/             # full-page components routed from src/app/
├── components/        # components private to this slice
├── hooks/             # hooks private to this slice
├── stores/            # Zustand stores (only where slice owns UI state)
├── *.test.js(x)       # colocated unit + component tests
```

## Layering rule

```
            backend/app/main.py
                    ↓
            backend/app/features/<slice>/
                    ↓               ↘
            features/auth            shared/
                    ↓
                shared/
```

- `main.py` may import from any feature's `__init__.py` (the barrel).
- A feature may import from `features.auth` and `shared`.
- `shared/` may **never** import from `features/`.
- Cross-feature imports (other than `→ auth`) are forbidden — if two features genuinely need shared logic, lift it into `shared/`.

The same rule applies on the frontend:

```
            src/main.jsx → src/app/
                    ↓
            src/features/<slice>/
                    ↓               ↘
            features/auth          src/shared/
                    ↓
                src/shared/
```

- `src/app/` may import from any feature's `index.js` and from `@/shared/*`.
- A feature may import from `@/features/auth` and `@/shared/*`.
- `src/shared/` may never import from `features/`.
- Cross-feature imports must go through the barrel.

## Public API rule

Every slice has a barrel — `__init__.py` for Python, `index.js` for JS. Other slices and the entry layer (`main.py`, `src/app/`) import via that barrel only. Reaching into a slice's internals (e.g. `from backend.app.features.devices.services import _serialize_device` or `from @/features/devices/components/PipelineSection`) is forbidden.

What goes in the barrel:

- **Routes** that should be mounted on the FastAPI app (`router`)
- **Service callables** other slices legitimately need (e.g. `audit.log_action` is called by `devices` after each mutation)
- **Page components** the router needs (frontend)
- **Hooks / components** other slices reuse (e.g. `useAuth`, `AppSidebar`)

What stays internal:

- Helpers (`_serialize_device`, `_format_audit_row`)
- Database query strings
- Private React components
- Slice-local types

## Testing pyramid

See [TESTING.md](TESTING.md) for the full pyramid (unit → component → integration → e2e), tooling, and TDD discipline. The architectural commitment:

- Tests live **next to the code they exercise** (`test_*.py`, `*.test.jsx`, `*.test.js`).
- The pyramid is non-negotiable.
- E2E specs live in `frontend/e2e/specs/` and are reserved for critical user flows only.

## Where to put new code

| You're adding… | It goes in… |
|---|---|
| A new API endpoint that belongs to an existing slice | `backend/app/features/<slice>/routes.py` |
| A new service function | `backend/app/features/<slice>/services.py` |
| A new public Pydantic model | `backend/app/features/<slice>/models.py` (re-export from `__init__.py` if other slices need it) |
| A new slice | `backend/app/features/<new-slice>/` with `__init__.py`, `routes.py`, `services.py`, `models.py` |
| A new shared utility | `backend/app/shared/` (only if two+ features genuinely need it) |
| A new public route in the frontend | `frontend/src/app/routes/<route>.jsx` (thin — composes feature components) |
| A new page that belongs to a slice | `frontend/src/features/<slice>/pages/<Page>.jsx` |
| A new component private to a slice | `frontend/src/features/<slice>/components/` |
| A cross-cutting React utility | `frontend/src/shared/lib/` |
| A new shadcn-style primitive | `frontend/src/shared/components/ui/` |
| Layout chrome | `frontend/src/shared/components/layout/` |
| A new domain table | `backend/app/shared/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS …`) + update [DOMAIN.md](DOMAIN.md) |

## Build & runtime

**Backend:**
- `uvicorn app.main:app --host 0.0.0.0 --port 8000` (dev) / `--port 8080` (Cloud Run)
- FastAPI lifespan: open the DB pool → run `schema.sql` → ready.
- Pool uses `server_settings={'search_path': 'inventory'}` so every query lands in the `inventory` schema even when the underlying DB is shared (e.g. `crm_production`).

**Frontend:**
- `vite build` produces `dist/` → multi-stage Docker image with nginx serving SPA + proxying `/api/*` to the backend Cloud Run service via `BACKEND_URL` env var.
- Dev: `vite` proxies `/api/*` to `http://localhost:8000` (see `vite.config.js`).
