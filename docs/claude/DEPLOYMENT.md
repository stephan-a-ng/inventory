# DEPLOYMENT.md

How Inventory Manager is deployed, and the rules that keep `staging` and `production` from contaminating each other.

The canonical deploy entry point is **`deploy.sh`** at the repo root. This document describes the pattern; `deploy.sh` and `deploy.md` are the live source of truth.

---

## Environments

| Field | `staging` | `production` |
|---|---|---|
| Frontend URL | `https://inventory-frontend-staging-329274314764.us-central1.run.app` | `https://inventory-frontend-production-329274314764.us-central1.run.app` |
| Backend URL | `https://inventory-api-staging-329274314764.us-central1.run.app` | `https://inventory-api-production-329274314764.us-central1.run.app` |
| Cloud Run services | `inventory-api-staging`, `inventory-frontend-staging` | `inventory-api-production`, `inventory-frontend-production` |
| Cloud SQL instance | `moonfive-crm:us-central1:crm-db` (shared) | `moonfive-crm:us-central1:crm-db` (shared) |
| DB / schema | `crm_staging` database, `inventory` schema | `crm_production` database, `inventory` schema |
| Secrets prefix | `inventory-*-staging` | `inventory-*-production` |
| Google OAuth client | staging-only Client ID | production-only Client ID |
| Authorized OAuth domain | `moonfive.tech` | `moonfive.tech` |

> **The Cloud SQL instance is shared with the CRM app.** Isolation happens at the **schema** level: `search_path: inventory` on the pool keeps every query inside the `inventory` schema. A migration mistake in inventory cannot affect the CRM tables in the same database.

---

## The hard rules

These are MoonFive-wide; do not relax them.

1. **Every credential is per-env.** OAuth client (id + secret), JWT signing key, DB connection string. No reuse.
2. **Secret naming is a contract: `inventory-<resource>-<env>`.** All secrets live in Secret Manager under the `moonfive-crm` project with this exact shape. `deploy.sh` looks them up by suffix; if the suffix is wrong, the deploy fails closed.
3. **Service names carry the env.** `inventory-<api|frontend>-<env>` — a staging image cannot land on the prod service because the names don't match.
4. **Production deploys require typed confirmation.** `deploy.sh production` prompts `Have you verified staging works? [y/N]` and aborts on anything other than y/Y.
5. **The app is in production.** Staging deploys after launch require user confirmation — staging is shared infra real people use, and a ~5 min Cloud Build invalidates whatever they were testing. Ask first.
6. **OAuth client IDs are stored in two places** (Secret Manager + the `deploy.sh` `OAuth client IDs` comment block) deliberately. The comment block is documentation; Secret Manager is the live value. If you rotate one, update the other in the same PR.
7. **After every deploy, surface the URL.** The script ends with the live URL; don't break that habit.

---

## Day-to-day commands

```bash
# Deploy staging (confirm with the user first — production is live)
./deploy.sh staging

# Deploy production (script prompts for typed confirmation)
./deploy.sh production
```

The script:

- Backend: `gcloud run deploy <service> --source ./backend` — buildpacks build from source, no local Docker required.
- Frontend: `docker buildx build --platform linux/amd64 ...` → push to `gcr.io/moonfive-crm/...:latest` → `gcloud run deploy <service> --image ...`. The frontend image is custom (multi-stage Vite build → nginx), so buildpacks aren't a fit.
- Health-checks both services after deploy and exits non-zero if either fails.

---

## OAuth — per-env clients

Both environments have their own Google OAuth client registered in Google Cloud Console. **Do not swap these between environments.**

| | Staging | Production |
|---|---|---|
| Client ID | `329274314764-abao2senfdqf7hcfdvgfu4mqf6cop03g.apps.googleusercontent.com` | `329274314764-hrtrqcs0ij7gl4j0bctgp6hg69irkn1c.apps.googleusercontent.com` |
| Redirect URI | `https://inventory-frontend-staging-329274314764.us-central1.run.app/api/auth/google/callback` | `https://inventory-frontend-production-329274314764.us-central1.run.app/api/auth/google/callback` |
| Client ID secret | `inventory-google-client-id-staging` | `inventory-google-client-id-production` |
| Client secret secret | `inventory-google-client-secret-staging` | `inventory-google-client-secret-production` |

**Important:** the OAuth callback is registered on the **frontend** URL, not the backend. The frontend's nginx proxies `/api/auth/google/callback` to the backend so the `oauth_state` cookie (set on the frontend domain) is still present when Google redirects back. Direct-to-backend callbacks break with a cookie-domain mismatch.

---

## Secrets — what lives where

| Secret | Staging name | Production name |
|---|---|---|
| DB connection string (Unix socket) | `inventory-database-url-staging` | `inventory-database-url-production` |
| JWT signing key | `inventory-jwt-secret-staging` | `inventory-jwt-secret-production` |
| Google OAuth client ID | `inventory-google-client-id-staging` | `inventory-google-client-id-production` |
| Google OAuth client secret | `inventory-google-client-secret-staging` | `inventory-google-client-secret-production` |

All are bound to the Cloud Run runtime SA (`329274314764-compute@developer.gserviceaccount.com`) via `--set-secrets` at deploy time. Rotation does not require a code change — `Cloud Run :latest` resolves to the newest version on next deploy.

---

## Rotating a secret

```bash
# 1. Generate the new value (or paste from a vendor console).

# 2. Add a new version to Secret Manager.
echo -n "NEW_VALUE" | gcloud secrets versions add inventory-<resource>-<env> \
  --data-file=- --project=moonfive-crm

# 3. If it's an OAuth client ID, also update the documentation in deploy.sh's
#    `OAuth client IDs` comment block in the same PR.

# 4. Redeploy so Cloud Run picks up :latest.
./deploy.sh <env>
```

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| OAuth `redirect_uri_mismatch` on login | Cloud Run URL changed, or the callback URI in Google Console doesn't match | Add the new URL to the env's OAuth client redirect URI list |
| `oauth_state` cookie missing on callback | `GOOGLE_REDIRECT_URI` points at the backend service instead of the frontend | Set `GOOGLE_REDIRECT_URI` to `<FRONTEND_URL>/api/auth/google/callback`. The nginx proxy handles the round-trip. |
| 502 from frontend service after deploy | nginx `BACKEND_URL` env var is wrong (e.g. internal Docker host name instead of Cloud Run URL) | Verify the frontend service has `BACKEND_URL=<api-cloud-run-url>` |
| Backend can't connect to Cloud SQL | The `INSTANCE_CONNECTION_NAME` env var is missing OR the service isn't bound to the Cloud SQL instance | `gcloud run services describe <service>` and confirm the `--add-cloudsql-instances` flag was applied |
| Queries against `users` / `devices` return "relation does not exist" | `search_path` not set, so Postgres looks in `public` | This should not happen — the pool sets `search_path: inventory` at connection time. If it does, check `backend/app/shared/db.py` `server_settings`. |
| `gcloud sql databases list` shows both `crm_*` and inventory tables in the same db | Expected — inventory uses the `inventory` *schema* inside the same database. Tables aren't shared with CRM. | — |

---

## Bootstrapping a new env

Inventory's bootstrap has already been done for staging and production. If you ever need to add a new env (e.g. `preview`), the rough sequence is:

1. **Create the OAuth client** in Google Cloud Console with the right redirect URI.
2. **Create the Postgres database + user** in the `crm-db` Cloud SQL instance:
   ```bash
   gcloud sql databases create crm_preview --instance=crm-db --project=moonfive-crm
   gcloud sql users create crm_preview --instance=crm-db --password="$(openssl rand -base64 32)" --project=moonfive-crm
   ```
3. **Create the four secrets** with the `inventory-*-preview` naming, IAM-bind them to the runtime SA.
4. **Add an env branch** to `deploy.sh` (mirrors the staging/production branches).
5. **First deploy**: `./deploy.sh preview`.

---

## Why we keep the OAuth callback on the frontend

Google sends the user back to the redirect URI with a `code` query param. The backend needs the `oauth_state` cookie set during the initial redirect to validate against CSRF. That cookie is set on the **frontend** domain (because the frontend served the initial `/api/auth/google` request via nginx). If Google redirects directly to the backend URL, the cookie is missing — different domain.

The nginx proxy on the frontend service forwards `/api/auth/google/callback` to the backend service. The cookie travels because the request is still on the frontend domain. The backend reads the cookie, validates state, exchanges the code, mints a JWT, and sets the `auth_token` cookie — also on the frontend domain.

---

## Reference: live files

- **`deploy.sh`** (root) — the script.
- **`deploy.md`** (root) — concise operator notes.
- **`backend/Dockerfile`** — used by buildpacks via `--source ./backend` (a Dockerfile in the source dir is auto-detected).
- **`frontend/Dockerfile`** — multi-stage Vite + nginx build.
- **`frontend/nginx.conf.template`** — substitutes `BACKEND_URL` at container start; sets the API proxy.
- **`backend/app/shared/db.py`** — sets `server_settings={'search_path': 'inventory'}` on every connection.

---

## Stack-specific deployment patterns

For other MoonFive Python/FastAPI services, see the [`moonfive-deploy` skill](https://github.com/moonfive/.claude/skills/moonfive-deploy). The hard rules above (per-env secrets, naming contract, OAuth split) apply regardless of stack.
