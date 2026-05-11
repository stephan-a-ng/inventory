# PRE-PRODUCTION-CHECKLIST.md

Inventory is already in production. This document is the **change-readiness** checklist: run it before any major slice goes live, or whenever you're about to push a change that touches auth, data integrity, or external integrations.

For first-time-prod readiness, this checklist is also the contract.

Complements three other docs:
- [DEPLOYMENT.md](DEPLOYMENT.md) — how the deploy itself runs
- [SECURITY.md](SECURITY.md) — secret + key + CORS verification
- [TESTING.md](TESTING.md) — the pyramid the suite must already satisfy

If any item below is unchecked, **don't open prod traffic to the change.** A staging-only feature is fine; a prod-broken feature is not.

---

## How to use

1. Copy this file to a working doc — `pre-prod-YYYY-MM-DD-<change>.md` — and check items off as you verify them.
2. Each section has a hard rule and a verification command. Capture the command output in the working doc next to the check.
3. Anything you intentionally skip needs a one-line "why we accept this risk."

---

## 1. Logging & observability

The single biggest failure mode is "something broke and we have no idea what."

- [ ] **Errors reach a human.** Cloud Logging error reporting routes to the on-call channel, or a Sentry-equivalent is wired. "We'll check the dashboard" is not acceptable.
- [ ] **Structured JSON logs in any new logging.** Inventory currently uses uvicorn default text logs — adequate for an internal tool but plan a migration to `structlog` if user count grows. New `logger.info(...)` calls should already emit JSON via the structlog config (TODO when we ship it).
- [ ] **No PII in logs.** Emails are allowed (auditability). Passwords, JWTs, OAuth codes, refresh tokens — never. Spot-check:
  ```bash
  gcloud run services logs read inventory-api-staging \
    --project moonfive-crm --region us-central1 --limit 200 \
    | grep -iE '(password|token|authorization|bearer|jwt)'
  ```
- [ ] **No logs in tests.** Test runs emit zero log lines unless explicitly asserting on them.

---

## 2. Tests

- [ ] **All pyramid layers green on `main`.** Backend pytest (unit + integration), frontend Vitest (unit + component), Playwright (e2e).
  ```bash
  cd backend && make test
  cd frontend && npm run test:all
  ```
- [ ] **The change has tests in the right layer.** Pure logic → unit. DB write → integration. UI flow → component or e2e.
- [ ] **At least one e2e test for the critical path.** Currently: login → dashboard → create device → detail → advance stage.
- [ ] **Tests don't depend on real external services.** Google OAuth is mocked at `httpx.MockTransport` in integration tests; the e2e auth fixture bypasses OAuth entirely with a pre-signed JWT cookie.
- [ ] **Test DB is hermetic.** `clean_db` truncates every table in `beforeEach`. Tests run sequentially against the shared `inventory_test` DB.

---

## 3. Errors & resilience

- [ ] **Every external call has a timeout.** Default to 10s for HTTP. Inventory's only outbound call is Google's OAuth `code → token` exchange — verify it has an explicit `httpx.Timeout`.
- [ ] **Best-effort side effects don't block the user.** Audit log writes are awaited but a failure should not roll back a device update — wrap in `try / except` with a `logger.exception`.
- [ ] **Bulk operations are idempotent or report partial-success.** `POST /api/devices/bulk-import` returns `imported_count` + per-row errors; verify your change to bulk endpoints keeps this contract.
- [ ] **Foreign-key cascades behave.** `audit_log.device_id` cascades on device delete; `board_revisions.device_id` cascades on device delete; `commissioning_stages` block deletion if devices reference them. Verify any new FK has a deliberate ON DELETE.

---

## 4. Security

- [ ] **Run SECURITY-AUDIT (or equivalent) on the change.** Spot-check: any new third-party API key? Any new `VITE_*` exposure?
- [ ] **No secrets in `.env` files committed to the repo.** `git ls-files | grep -E '\.env(\.|$)'` should return only `.env.example`.
- [ ] **OAuth client IDs are per-env.** Staging OAuth callback never lands on prod and vice versa.
- [ ] **CORS allowlist matches the prod frontend exactly — no `*`.**
  ```bash
  curl -sS https://inventory-api-production-329274314764.us-central1.run.app/api/health -i \
    | grep -i access-control
  ```
- [ ] **Debug / dev endpoints are gated.** `/docs` is currently public (acceptable — internal tool). If this changes, re-evaluate.
- [ ] **Auth gates on every authenticated route.** Spot-check `backend/app/features/<slice>/routes.py`:
  ```bash
  grep -L "Depends(get_current_user)\|require_role" backend/app/features/*/routes.py
  ```
  Public routes are only `/api/auth/google` + `/api/auth/google/callback` + `/api/health`.

---

## 5. Data & schema

- [ ] **Prod DB schema is in sync with `main`.** `schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS …`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`). The backend lifespan re-runs it on each deploy — but verify a real `psql` connection sees the new column:
  ```bash
  # via Cloud SQL proxy
  gcloud sql connect crm-db --user=crm_production --database=crm_production --project=moonfive-crm
  inventory=> \d devices
  ```
- [ ] **Backups are running.** Cloud SQL automated backups are on at the instance level (shared with CRM).
- [ ] **No destructive operations in deployed code paths.** `TRUNCATE`, `DROP TABLE`, `DELETE` without WHERE — none of these run in prod code.

---

## 6. Deploy safety

- [ ] **`deploy.sh production` enforces typed confirmation.** Verified — the script reads `[y/N]` and aborts otherwise.
- [ ] **Rollback is documented and timed.** Cloud Run revision history → click "rollback" on the previous revision. Practice it once on staging if you haven't this quarter.
- [ ] **SSL is valid.**
  ```bash
  curl -I https://inventory-frontend-production-329274314764.us-central1.run.app
  ```
- [ ] **Deploy URL is surfaced after every deploy.** The script ends with the live URL printed.

---

## 7. Performance & scale

Inventory's traffic is low (internal use). The bar is correspondingly lower than for revenue-path apps, but still:

- [ ] **List endpoints are paginated.** `GET /api/devices` is paginated at 50; new list endpoints should match.
- [ ] **Database indexes match the queries you actually run.** Common filters (product_type, stage_id, mac_address) should hit indexes — verify with `EXPLAIN ANALYZE` on a staging query if you're worried.
- [ ] **Cloud Run min instances = 0.** Cold start is acceptable for an internal tool.
- [ ] **Static assets are cached.** Frontend `nginx.conf` sets `Cache-Control: public, max-age=31536000, immutable` on hashed bundles — verify.

---

## 8. Documentation

- [ ] **README or root CLAUDE.md tells a new engineer how to run the app locally** in under 5 minutes.
- [ ] **`docs/claude/CLAUDE.md` is up to date** — stack, slices, critical rules.
- [ ] **[DOMAIN.md](DOMAIN.md) has a glossary of every entity** an engineer might encounter unfamiliar.
- [ ] **[DECISIONS.md](DECISIONS.md) captures any non-obvious choice** the next engineer will look at and ask "why."
- [ ] **A runbook exists for the top "page me at 3am" alerts.** Even if it's "ssh into Cloud Run logs, restart" — write it down.

---

## 9. Final pre-flight, the morning of

```bash
# 1. Clean working tree, on main
git status
git rev-parse --abbrev-ref HEAD     # → main

# 2. All tests green
cd backend && make test
cd ../frontend && npm run test:all

# 3. Staging health
curl -sS https://inventory-api-staging-329274314764.us-central1.run.app/api/health
curl -I  https://inventory-frontend-staging-329274314764.us-central1.run.app

# 4. Staging looks right — manual click-through the critical path

# 5. Production deploy
./deploy.sh production

# 6. Smoke test prod
curl -sS https://inventory-api-production-329274314764.us-central1.run.app/api/health
curl -I  https://inventory-frontend-production-329274314764.us-central1.run.app

# 7. Confirm a real user flow end-to-end. Don't trust 200 codes — actually log in, do the thing, log out.
```

---

## When something fails post-launch

1. **First five minutes:** `gcloud run services logs read inventory-api-production --limit 50 --project moonfive-crm --region us-central1`. Filter to ERROR severity.
2. **Roll back if user-facing.** Cloud Run revision rollback is faster than a hotfix.
3. **Open a postmortem within 24h** for any user-visible incident. Not a blame doc — a "how did this slip past the checklist" doc. The checklist gets a new line item out of every postmortem.
