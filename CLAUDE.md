# MoonFive Inventory Manager

Hardware device inventory tracking system for MoonFive's commissioning pipeline (Assembly → Firmware → Calibration → QA → Staging → Deployed). Tracks devices across product types AEMS, BEMS, CHARGER, and NETWORKING with QR codes, barcode scanning, audit trails, CSV import/export, and bulk operations.

**Stack:** FastAPI + asyncpg backend, React 19 + Vite frontend, PostgreSQL 16, Google OAuth + JWT cookies. Deployed to Cloud Run.

## Documentation

The full engineering docs live under **`docs/claude/`**:

| File | Load when |
|---|---|
| [docs/claude/CLAUDE.md](docs/claude/CLAUDE.md) | **Always-loaded index.** Stack, slices, critical rules. |
| [docs/claude/STACK.md](docs/claude/STACK.md) | Picking a library, evaluating "should we use X?", onboarding |
| [docs/claude/ARCHITECTURE.md](docs/claude/ARCHITECTURE.md) | Adding a feature, where to put new code, vertical slicing rules |
| [docs/claude/CONVENTIONS.md](docs/claude/CONVENTIONS.md) | Python + JS naming, imports, comments, async patterns |
| [docs/claude/TESTING.md](docs/claude/TESTING.md) | Writing tests, deciding which layer, debugging flakes |
| [docs/claude/WORKFLOWS.md](docs/claude/WORKFLOWS.md) | Day-to-day commands: dev loop, single test, schema change, smoke |
| [docs/claude/DEPLOYMENT.md](docs/claude/DEPLOYMENT.md) | Cloud Run deploys, staging/prod split, secret rotation |
| [docs/claude/PRE-PRODUCTION-CHECKLIST.md](docs/claude/PRE-PRODUCTION-CHECKLIST.md) | Before any major change goes live |
| [docs/claude/SECURITY.md](docs/claude/SECURITY.md) | Secrets, credentials, trust boundaries |
| [docs/claude/BRAND.md](docs/claude/BRAND.md) | Visual / UI work — palette, typography, spacing |
| [docs/claude/DOMAIN.md](docs/claude/DOMAIN.md) | Device, Stage, Subsystem, BoardRevision, AuditLog, User |
| [docs/claude/DECISIONS.md](docs/claude/DECISIONS.md) | ADRs — why we made the choices we did |
| [docs/claude/ROADMAP.md](docs/claude/ROADMAP.md) | Future upgrades not yet scheduled |

`deploy.sh` and `deploy.md` at the repo root are the live deploy entry points.

## Quick start

```bash
docker compose up                       # frontend :5173, backend :8000, postgres :5450
```

See [docs/claude/WORKFLOWS.md](docs/claude/WORKFLOWS.md) for the full developer loop.
