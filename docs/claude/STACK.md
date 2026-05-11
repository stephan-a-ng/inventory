# STACK.md

The **legacy two-app stack** for MoonFive Inventory Manager. New MoonFive web projects start on the canonical Next.js stack instead — see [DECISIONS.md](DECISIONS.md) ADR-001 for why this project diverges.

## Why two apps

Inventory predates the Next.js standardization and was built when the backend had specific Python needs (asyncpg, future MQTT/EVSE hooks, planned ingestion pipelines). Splitting backend and frontend was cheap at the time and the codebase has remained backend-heavy. There is no product win in collapsing to a single Next.js app today: the API contract is stable, the bundle is small, and Cloud Run hosts both for cents per month.

## Frameworks & runtime

| Choice | Version | Why this | Rejected alternative |
|---|---|---|---|
| **FastAPI** | ≥ 0.109 | Type-driven request/response models via Pydantic; first-class async; clean dependency injection for `get_current_user` / `require_role` | Flask (no async story), Django (heavyweight ORM/admin we don't need) |
| **asyncpg** | ≥ 0.29 | Fast, native-async Postgres driver. Raw parameterized SQL with `$1, $2, …` — no ORM hiding query shape | SQLAlchemy + asyncpg (extra layer, magic), psycopg sync (blocks the event loop) |
| **Pydantic** | 2.x | Models live in `backend/app/features/<slice>/models.py`; doubles as OpenAPI schema | dataclasses (no validation), marshmallow (older API) |
| **Python** | 3.11+ | Async ergonomics, structural pattern matching | — |
| **Vite** | 7.x | Fast dev server, ESBuild HMR | Webpack (slower), Next.js (covered by canonical stack) |
| **React** | 19.x | Concurrent features, modern Suspense | Vue / Svelte (no MoonFive team familiarity) |
| **TypeScript** | not in use here | Project predates the TS push. New frontend code is plain JSX. Migration is out of scope. | — |

## UI

| Choice | Why this | Rejected alternative |
|---|---|---|
| **Tailwind v4** | Single source of styling truth, zero runtime | styled-components (runtime cost), CSS Modules (verbose) |
| **shadcn-style local components** in `frontend/src/shared/components/ui/` (button, card, input, select, badge, sidebar, tooltip) | Components we own, no black-box dep | MUI / Chakra (heavyweight, fights Tailwind) |
| **Lucide icons** | One tree-shakeable icon set | Heroicons (smaller set), FontAwesome (bundle bloat) |
| **HEX Franklin** | Brand typeface; see [BRAND.md](BRAND.md) | Inter / Roboto (read too neutral, lose brand warmth) |
| **qrcode.react** | QR code rendering | Hand-rolled SVG (re-implements known patterns) |
| **@zxing/browser** | Barcode/QR scanning from camera | jsQR (no longer maintained), commercial SDKs (cost) |

## State & data

| Choice | Why this | Rejected alternative |
|---|---|---|
| **Zustand** | UI state only (selected device IDs, filters, pagination cursor). Server state stays on the server — refetch on action. | Redux (boilerplate), Context (re-render storm) |
| **`authFetch` wrapper** in `frontend/src/shared/lib/api.js` | One place attaches the JWT cookie + handles 401s | Direct `fetch` everywhere (auth handling duplicated), Axios interceptors (extra dep) |
| **No client cache (SWR / React Query)** | List endpoints are paginated server-side, mutations refetch. Cache invalidation isn't worth a dep. | SWR / React Query (overkill for ~10 endpoints) |

## Database & ORM

| Choice | Why this | Rejected alternative |
|---|---|---|
| **PostgreSQL 16** | Managed via Cloud SQL (shared `crm-db` instance, isolated by schema) | MySQL (less feature parity), SQLite (no production path) |
| **Raw asyncpg** | Query shape is explicit, no N+1 surprises, no migration of ORM expectations | SQLAlchemy (magic, performance cliffs), Tortoise (immature) |
| **`schema.sql` loaded at app boot** via the FastAPI lifespan | DDL is idempotent (CREATE TABLE IF NOT EXISTS); the DB is the source of truth. Alembic adds a migration layer we don't currently need. | Alembic (real migrations) — kept in `requirements.txt` for the eventual switch, but not wired in. See [DECISIONS.md](DECISIONS.md) ADR-003. |
| **`inventory` schema isolation** | Shared `crm-db` instance hosts multiple apps; `search_path: inventory` on the pool keeps tables namespaced | One DB per app (cost), shared `public` schema (collisions) |

## Auth

| Choice | Why this | Rejected alternative |
|---|---|---|
| **Custom JWT cookies + Google OAuth** | HttpOnly `auth_token` cookie, JWT signed with `JWT_SECRET` (HS256), 7-day expiry. Per-env Google OAuth clients enforced by deploy script. | NextAuth (we're not on Next.js), Auth0 / Clerk (vendor lock + cost) |
| **OAuth callback proxied through frontend nginx** | OAuth `state` cookie must be set on the frontend domain to survive the round trip — proxying `/api/auth/google/callback` through nginx means cookie domain matches | Direct backend callback (cookie domain mismatch breaks the flow) |
| **`@moonfive.tech` → admin, others → viewer** on first sign-in | Hardcoded domain → role mapping in the OAuth callback. New roles are assigned manually via SQL. | Per-user invitation flow (not built; we're a small team) |

## External integrations

| Choice | Why this | Rejected alternative |
|---|---|---|
| **`qrcode[pil]`** (Python) | Generates QR PNGs at `/api/devices/{id}/qr` | Client-side only (loses server-side caching potential) |
| **`@zxing/browser`** (frontend) | Camera-based barcode scanning in `features/scanning` | Other JS scanners (zbar-wasm, html5-qrcode) — zxing has the best ergonomics in React |

## Build & deploy

| Choice | Why this | Rejected alternative |
|---|---|---|
| **Cloud Run** (two services per env: `inventory-api-*` and `inventory-frontend-*`) | Autoscale to zero, per-env isolation via service names | App Engine (less flexible), GKE (overkill) |
| **Cloud SQL shared `crm-db`** with `inventory` schema | Single instance, multiple apps, isolated by schema — cost-effective | Dedicated instance per app (cost) |
| **Secret Manager** with `inventory-*` prefix | One source of truth, IAM-bound to runtime SA, per-env naming | `.env` baked into images (rotation nightmare) |
| **`deploy.sh`** (root of repo) | Single script gates staging + production deploys; production prompts for typed confirmation | Cloud Build pipelines (extra hop), manual gcloud calls (no guardrails) |
| **`gcloud run deploy --source ./backend`** for backend | Buildpacks build from source — no custom Dockerfile maintenance for the backend image | Local docker build + push (slower, requires local Docker) |
| **`docker buildx` + push to gcr.io** for frontend | Frontend image needs a custom multi-stage build (Vite build → nginx); buildpacks aren't a fit | Source deploy with buildpacks (doesn't produce a runnable nginx image) |

## Testing

See [TESTING.md](TESTING.md) for the full pyramid. Tooling at a glance:

- **pytest + pytest-asyncio** for backend. Two layers: unit (mocked DB) + integration (real test DB via `docker-compose.test.yml`).
- **Vitest** for frontend. Two named projects: `unit` (node) + `component` (jsdom + RTL).
- **Playwright** for critical-path e2e only.
- **Tests are colocated** next to the code they exercise.

## What we don't ship

- **No GraphQL.** REST is fine for ~25 endpoints. The OpenAPI schema FastAPI generates is enough.
- **No Redux / SWR / React Query.** Server state stays on the server.
- **No CSS-in-JS runtime.** Tailwind covers it.
- **No Storybook.** Component tests + the dev server have been enough.
- **No Jest.** Vitest covers it with less config.
- **No Alembic migrations (yet).** See [DECISIONS.md](DECISIONS.md) ADR-003. The dependency is in `requirements.txt` for the eventual switch.
- **No TypeScript on the frontend (yet).** See ADR-004.
