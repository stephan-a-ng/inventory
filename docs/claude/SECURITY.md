# SECURITY.md

How Inventory Manager handles secrets, credentials, and trust boundaries — the rules that keep API keys out of bundles, off committed `.env` files, and out of unrestricted blast radius.

These rules are MoonFive-wide. They exist because the org lost real money to an unrestricted Google API key auto-propagated into a public JS bundle (citrineos, 2026-05-07, ~259K unauthorized Gemini calls). Every rule below maps to a concrete failure mode.

---

## The hard rules

1. **No API key, secret, token, or credential in any frontend bundle.** `VITE_*` and equivalents are public — anything there ships to every browser. Backend proxy is the only acceptable pattern for any paid API. Inventory currently exposes nothing of this kind; keep it that way.
2. **No `.env` with real values is ever committed.** Only `.env.example`. `.gitignore` includes `.env`, `.env.local`, `.env.*.local`, `.env.*.backup`, with `!.env.example` allowed.
3. **Every API key has at least one restriction.** Browser keys → HTTP referrer. Server keys → IP allowlist. An API key with `apiTargets` only is **not** restricted.
4. **Secret naming is `inventory-<resource>-<env>`.** Cloud Run services receive secrets via `--set-secrets`, never `--set-env-vars=KEY=value` for sensitive values.
5. **Cloud Run runtime SA is the runtime identity.** Currently `329274314764-compute@developer.gserviceaccount.com` (the default Compute SA). This is a known suboptimal — see ROADMAP.md for migration to a dedicated SA. New services should not be created on the default SA.
6. **JWT cookie hygiene** — `auth_token` is `httpOnly`, `Secure` in production, `SameSite=Lax`. Never set `SameSite=None` without a documented cross-origin requirement.
7. **No PII in logs.** Emails are fine for auditability (it's how we attribute changes). Passwords, JWTs, OAuth codes, refresh tokens — never.

---

## What we ship (and don't)

Inventory's footprint is small. There are no AI provider calls, no payment SDKs, no Maps keys, no third-party JS analytics. The only external integrations are:

| Integration | Where the key lives | Why it's safe |
|---|---|---|
| Google OAuth (sign-in) | Client ID is public-by-design (it's in the OAuth redirect URL). Client secret is in Secret Manager, read by the backend. | Standard OAuth pattern; client secret never leaves the server. |
| QR generation (Python `qrcode`) | No key required | — |
| Camera barcode scan (browser `@zxing/browser`) | Runs entirely in the browser | — |

If someone adds an AI integration, a payment SDK, or a third-party API key, they MUST re-read this doc and update the table above in the same PR.

---

## Secrets — what goes where

| Secret | Where it lives | Read by |
|---|---|---|
| DB connection string | Secret Manager `inventory-database-url-<env>` | Cloud Run runtime SA (backend service) |
| JWT signing key | Secret Manager `inventory-jwt-secret-<env>` | Cloud Run runtime SA (backend service) |
| Google OAuth client ID | Secret Manager `inventory-google-client-id-<env>` (also documented in `deploy.sh` comment block — these are kept in sync) | Cloud Run runtime SA (backend service) |
| Google OAuth client secret | Secret Manager `inventory-google-client-secret-<env>` | Cloud Run runtime SA (backend service) |

Local dev uses a `.env` file at the repo root (gitignored) for the staging OAuth client ID + secret, so a developer can run the OAuth flow against `localhost`. `.env.production` mirrors this for occasional production-OAuth testing — also gitignored.

---

## CORS, cookies, and auth defaults

| Setting | Value | Why |
|---|---|---|
| CORS `allow_origins` | explicit list: `[FRONTEND_URL]` (the env's frontend URL) — no wildcards | An origin allowlist + `allow_credentials=True` is the only safe combination |
| CORS `allow_methods` | explicit list (`GET, POST, PATCH, DELETE, OPTIONS`) | `["*"]` with credentials enables cross-origin DELETE from any allowed origin's compromise |
| CORS `allow_credentials` | `True` (cookies must travel) | Required for the JWT cookie to round-trip |
| Auth cookie `samesite` | `Lax` | Adequate for our top-level navigation login flow; `Strict` breaks OAuth callback |
| Auth cookie `httponly` | `True` always | Blocks JS access to the token |
| Auth cookie `secure` | `True` in production | Blocks transmission over HTTP |
| Auth cookie domain | not set (host-only) | We never need to share the cookie cross-subdomain |
| JWT expiry | 7 days | Inventory is internal-tooling — UX wins over short-rotation here. Revisit if we add multi-tenant. |
| `login` rate limit | not implemented yet | See ROADMAP — currently low risk because login requires a `@moonfive.tech` Google account |
| OpenAPI / docs endpoint (`/docs`) | enabled in all envs | Inventory is internal; the schema isn't sensitive. **If this app ever serves external users, gate `/docs` to non-prod.** |

---

## Frontend secrets — the only acceptable patterns

A frontend bundle is public. For Inventory specifically:

```
✅ ALLOWED in the frontend bundle / Vite env vars:
- API base URL (currently same-origin via nginx proxy, so no env var needed)
- Google OAuth client ID (public-by-design)
- Build-time constants (version banner, feature flags)

❌ FORBIDDEN — and currently absent — in the frontend bundle:
- Any *_API_KEY for an AI / payment / mapping provider
- Any *_SECRET
- Database connection strings
- JWT signing keys
- The Google OAuth client SECRET (only the ID is public)
- Direct credentials to any GCP service
```

If a future feature ever needs a frontend-callable third-party API, it goes through a backend proxy. No exceptions.

---

## Cloud Run service account hygiene

**Current state (known suboptimal):** all four services (`inventory-api-staging`, `inventory-frontend-staging`, `inventory-api-production`, `inventory-frontend-production`) run as the default Compute SA, which holds `roles/editor` project-wide. This is wider blast radius than necessary.

**Target state:** a dedicated SA per service with minimum bindings:
- `inventory-api-<env>` needs: `roles/cloudsql.client`, `roles/secretmanager.secretAccessor` (on the four `inventory-*-<env>` secrets only)
- `inventory-frontend-<env>` needs: nothing — it's a static nginx; no GCP API calls

Migration is in ROADMAP.md. Don't add NEW services on the default SA.

---

## Webhooks

Inventory has no inbound webhooks. If you add one (Stripe, GitHub, etc.):

1. **Verify the signature** against the provider's signing secret (loaded from Secret Manager).
2. **Dedupe on `event_id`** — store recent IDs in Postgres with a 24h TTL.
3. **Be idempotent.** A retry of the same event upserts the same end state.
4. **Never authenticate via bare bearer-in-header alone** — always pair with HMAC.

---

## Common pitfalls (real ones we've seen in MoonFive code, not necessarily this repo)

| Symptom | Root cause | Fix |
|---|---|---|
| Maps key in `assets/index-*.js` | Hardcoded literal in component | Backend proxy or restricted build-arg from Secret Manager |
| ~$15k Gemini bill on a project that doesn't use Gemini | Pre-existing browser key without HTTP-referrer restriction; Generative Language API was enabled for a different app on the same project | Apply HTTP-referrer restriction to every browser key on day 1; disable Generative Language API where unused |
| `git ls-tree HEAD .env` shows it's tracked | `.gitignore` only covers `.env*.local`, not bare `.env` | Expand `.gitignore` to include bare `.env`; `git rm --cached .env` |
| First-deploy `.env.production` ends up in git | A developer ran `cp .env.example .env.production` filling in real values and committed | Use the deploy bootstrap process; values live in Secret Manager from day 1 |

---

## Required at the start of every new project (Inventory's state)

| Requirement | Status |
|---|---|
| Bootstrap secrets in Secret Manager (per [DEPLOYMENT.md](DEPLOYMENT.md)) | ✓ |
| Per-env Google OAuth clients | ✓ |
| `.gitignore` covers `.env*` patterns | ✓ |
| Pre-commit / CI `gitleaks` run | **Missing** — see ROADMAP |
| Workload Identity Federation for CI (vs JSON SA keys) | N/A — no CI yet |
| Dedicated runtime SA per Cloud Run service | **Missing** — see ROADMAP |
| Cloud Monitoring alert on paid-API quotas | N/A — no paid APIs |
| Billing budget alert | Cross-app, set on the `moonfive-crm` project |
| `AI_DAILY_SPEND_CAP` | N/A — no AI integrations |
| SECURITY-AUDIT run quarterly | **Pending** — first run scheduled |

---

## When you find a violation

1. **Don't push a "fix" directly to main.** All changes go through PR review — especially urgent security fixes.
2. **Contain first, rotate second, fix-the-pattern third.** Restricting an unrestricted key is reversible in seconds; rotation breaks running services; pattern fixes take days.
3. **Log the action.** Add a row to `docs/claude/ROADMAP.md` (or open an issue) with UID, old prefix, new prefix, who, when, verified-when.
4. **Verify, don't assume.** Each containment / rotation has a verification step (`gcloud ... describe` to confirm restrictions; provider console to confirm old key is revoked).
