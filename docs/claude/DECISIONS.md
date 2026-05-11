# DECISIONS.md

Architecture decision records. Each ADR captures a non-obvious choice and the alternatives we rejected, so the next engineer doesn't have to ask "why."

---

## ADR-001 — Two-app (FastAPI + React) instead of canonical Next.js

**Status:** accepted. Date: 2026-03-09 (original project scaffold).

**Decision.** Inventory ships as two separately-deployed services: a FastAPI backend (`inventory-api-*`) and a Vite-built React frontend served by nginx (`inventory-frontend-*`). The canonical MoonFive stack (see `../../claude-files/templates/STACK.md`) is Next.js full-stack with server actions. We diverge from it here.

**Why this and not Next.js.**

- Inventory was scaffolded before the Next.js standardization solidified.
- The backend has Python-shaped needs that drove the original choice: asyncpg, potential MQTT/EVSE integrations, and adjacency to other Python services in the MoonFive fleet (Delta, JustTheRecipes, Secrets).
- The frontend bundle is small (~5 routes) and the API contract is stable; collapsing to a single Next.js app would be a rewrite for no product win.
- STACK.md explicitly supports the two-app pattern for backend-heavy services. We qualify.

**What this costs.**

- Two deploys per env instead of one. Mitigated by `deploy.sh` doing both in a single command.
- An HTTP boundary between UI and data layer. Mitigated by keeping the API surface narrow (~25 endpoints) and using the `authFetch` wrapper everywhere.
- We can't share Pydantic / TS types directly. We accept the duplication — the API surface is small.

**Reconsider if.** Inventory becomes a customer-facing app with paid traffic, OR the API surface explodes past ~50 endpoints. Either signals it's time for the Next.js consolidation.

---

## ADR-002 — Raw asyncpg, no ORM

**Status:** accepted. Date: 2026-03-09.

**Decision.** Backend queries use raw parameterized SQL via `asyncpg` (`$1, $2, …`). No SQLAlchemy. No Tortoise. No SQLModel. Pydantic handles request/response shapes but not persistence.

**Why this and not SQLAlchemy.**

- The schema is small (6 tables) and the queries are explicit. ORM magic adds more cognitive cost than it saves.
- Every query is greppable — `grep -r "SELECT.*FROM devices" backend/` gives you every read path.
- N+1 problems become impossible: you write the join.
- asyncpg is the fastest Python Postgres driver; ORMs that wrap it add overhead.

**What this costs.**

- Manual model ↔ dict conversion (the `_serialize_device` helper). We accept this — it's ~30 lines per slice and totally legible.
- Migrations are not automated (see ADR-003).

**Reconsider if.** The schema grows past ~20 tables, OR we need cross-DB portability (Postgres + MySQL), OR a developer is repeatedly bitten by hand-rolling JOINs.

---

## ADR-003 — `schema.sql` loaded at boot, no Alembic (yet)

**Status:** accepted, with a planned revisit. Date: 2026-03-09.

**Decision.** The full DB schema is in `backend/app/shared/schema.sql`. The FastAPI lifespan runs it on every boot. Every `CREATE TABLE` is `IF NOT EXISTS`; every column addition is `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. There is no migration history table and no `alembic upgrade head`.

**Why this and not Alembic.**

- The schema changes infrequently. Hand-rolling idempotent DDL has been cheaper than maintaining a migration history.
- A single source-of-truth file is easier to scan than a chronological migrations folder.
- `alembic` is still in `requirements.txt` as a placeholder for the eventual switch.

**What this costs.**

- We can't do destructive migrations (rename a column, change a type) safely. We'd have to write a one-off script.
- The schema file accumulates `ALTER TABLE` blocks over time — not the cleanest history.
- Test-DB setup runs the same `schema.sql` — works fine today, but if we ever need different fixtures we'll need to fork the file.

**Reconsider if.** We need to rename / retype a column with live prod data, OR we add a developer who's used to migration-first workflows and finds the lifespan-loaded SQL surprising.

---

## ADR-004 — Plain JSX, no TypeScript on the frontend

**Status:** accepted with reservations. Date: 2026-03-09.

**Decision.** The frontend is plain JSX. No TS, no `.d.ts` files. ESLint catches the obvious issues.

**Why this and not TypeScript.**

- The frontend was scaffolded quickly. Adding TS at scaffold time would have slowed the first three phases of build-out.
- The component count is small (~30 components, ~10 pages). The type cost is genuinely not high.
- Pydantic on the backend gives us API-shape safety; the lack of frontend types means we duplicate validation in JSX, but the surface is small.

**What this costs.**

- No autocomplete on API response shapes — devs read `backend/app/features/<slice>/models.py` to know what they get.
- Refactors of shared shapes (e.g. `DeviceOut`) need manual sweeps across the frontend.

**Reconsider if.** The frontend grows past ~60 components, OR we onboard a frontend-heavy engineer.

---

## ADR-005 — `inventory` Postgres schema inside the shared `crm-db` instance

**Status:** accepted. Date: 2026-05-11 (consolidation under `moonfive-crm` GCP project).

**Decision.** Production and staging both run their Postgres database inside the existing `crm-db` Cloud SQL instance. Tables live in an `inventory` schema (`CREATE SCHEMA inventory`). The asyncpg pool sets `server_settings={'search_path': 'inventory'}` so every query lands in the right schema without code changes.

**Why this and not a dedicated instance.**

- Cloud SQL instances cost real money even when idle. The CRM app already pays for `crm-db`; piggybacking is free.
- Schema isolation is well-understood — Postgres `search_path` keeps queries scoped, and a migration mistake in Inventory cannot touch CRM tables.
- The `inventory-*` secret naming + per-env database (`crm_staging`, `crm_production`) prevents cross-app, cross-env mistakes.

**What this costs.**

- A `pg_dump --schema=inventory` is now the right backup command, not a full-instance dump.
- A developer used to "one database per app" needs to learn the `search_path` trick — but it's set in one place (`backend/app/shared/db.py`).
- If CRM ever needs an upgrade that requires downtime, Inventory shares the downtime.

**Reconsider if.** Inventory's write load grows enough to compete with CRM for instance resources, OR we need a Postgres extension CRM doesn't want.

---

## ADR-006 — OAuth callback proxied through frontend nginx

**Status:** accepted. Date: 2026-05-11 (deployed; before that, dev only).

**Decision.** Google OAuth's redirect URI points at the **frontend** Cloud Run URL (`https://inventory-frontend-<env>-…/api/auth/google/callback`), not the backend. The frontend's nginx proxies `/api/auth/google/callback` to the backend service.

**Why this and not direct-to-backend.**

- The `oauth_state` CSRF cookie is set on the frontend domain when the user clicks "Sign in with Google."
- If Google redirects directly back to the backend domain, the cookie isn't sent — different origin, different cookie jar.
- Proxying through the frontend means the request stays on the frontend domain, the cookie travels, the backend validates state, and the auth cookie can be set on the same domain the SPA reads from.

**What this costs.**

- One extra hop on the callback (frontend nginx → backend Cloud Run). Negligible — both are in the same region.
- The OAuth client's redirect URI list must register the frontend URL, not the backend. Easy to get wrong on a new env; documented in [DEPLOYMENT.md](DEPLOYMENT.md).

**Reconsider if.** We move to a single-app deployment (Next.js consolidation) — at which point the question disappears.

---

## Adding a new ADR

Use this skeleton:

```markdown
## ADR-NNN — <one-line decision>

**Status:** accepted | superseded by ADR-XXX. Date: YYYY-MM-DD.

**Decision.** <one paragraph>

**Why this and not <alternative>.** <bullets>

**What this costs.** <bullets>

**Reconsider if.** <triggers>
```

Don't delete superseded ADRs — mark them and write the new one.
