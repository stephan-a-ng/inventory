# ROADMAP.md

Future work not yet scheduled. Things we know we should do, but haven't decided when.

## Operational hygiene

- **Dedicated Cloud Run runtime SAs.** All four services currently run as the default Compute SA (`329274314764-compute@developer.gserviceaccount.com`), which holds `roles/editor`. Migrate each service to its own SA with minimum bindings:
  - `inventory-api-<env>` → `roles/cloudsql.client` + `roles/secretmanager.secretAccessor` (per-secret bindings, not project-wide)
  - `inventory-frontend-<env>` → no GCP API access needed
- **Pre-commit `gitleaks`.** Catch accidental secret commits before they hit the remote. Wire into `pre-commit` hook + the CI step we don't yet have.
- **GitHub Actions for CI.** Run `make test` (backend) + `npm run test:all` (frontend) on every PR. Currently tests only run on developer machines.
- **Structured JSON logging.** Replace uvicorn default text logs with `structlog`-emitted JSON. Cloud Logging will auto-parse to `jsonPayload` for searchable fields.
- **Error reporting.** Sentry or Cloud Error Reporting on the backend, routed to an oncall channel.

## Feature work

- *(none captured yet — add as they come up)*

## Tooling upgrades

- **Alembic migrations** when we need a destructive schema change. See [DECISIONS.md](DECISIONS.md) ADR-003 for the reconsider-if trigger.
- **TypeScript on the frontend** if/when the component count grows past ~60 or we onboard a frontend-heavy engineer. See ADR-004.
- **Rate limiting on `/api/auth/google/callback`** — currently relies on the `@moonfive.tech` domain check for spam protection. Low risk, but adding `slowapi` is cheap insurance.

## Security audit follow-ups

- *(populate after the first SECURITY-AUDIT run)*
