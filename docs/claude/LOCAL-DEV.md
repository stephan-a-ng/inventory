# LOCAL-DEV.md

How to run inventory locally with a working Google OAuth round-trip.

The canonical entry point is **`./deploy.sh local`** — it pulls the staging OAuth secrets and stands up the full docker-compose stack. This doc covers the constraints that aren't obvious from the script alone, plus the host-mode workflow (`./dev.sh`) when you want vite/uvicorn hot reload.

---

## Ports — what runs where

| Mode | Frontend | Backend | Postgres | Notes |
|---|---|---|---|---|
| **`./deploy.sh local`** (full docker stack) | `localhost:5180` (nginx) | `localhost:8000` | `localhost:5450` | Nginx proxies `/api/*` → backend; same origin for cookies. |
| **`./dev.sh` + `npm run dev` on host** | `localhost:5174` (vite default) or override `--port` | `localhost:8000` (host uvicorn) | `localhost:5450` (docker) | Vite proxies `/api/*` → backend (`vite.config.js`). HMR + uvicorn reload, sub-second iteration. |

Test database (integration tests): `localhost:5451` (`inventory_test`). Separate container, not the dev DB.

---

## GitHub API token (for the firmware-version check)

The DeviceDetail "Firmware version" card fetches each product's latest GitHub release. Both firmware repos are **private** (`moon-five-technologies/argo` for EVSE, `moon-five-technologies/OllieDriver` for BEMS), so the backend needs a token to read them. Without one, anonymous calls 404 and the card shows "Latest release: unavailable".

For local dev, the simplest move is to reuse your `gh` CLI token:

```bash
export GITHUB_API_TOKEN=$(gh auth token)
```

…then start the backend in the same shell (or pass `GITHUB_API_TOKEN=$(gh auth token)` inline in the uvicorn command). The token needs to be on an account with read access to the firmware org. The 1-hour in-process cache means you'll make at most one call per repo per hour per replica.

**For staging/production:** create a Secret Manager entry `inventory-github-api-token-<env>` (machine-user PAT scoped to the firmware repos, no broader), then add `GITHUB_API_TOKEN=inventory-github-api-token-<env>:latest` to the Cloud Run service's `--set-secrets` in `deploy.sh`. **Not wired up yet** — the firmware card will show "Latest release: unavailable" in deployed environments until this is done.

---

## Whitelisted localhost ports for OAuth

The staging Google OAuth client (`inventory-google-client-id-staging` → `329274314764-abao2senfdqf7hcfdvgfu4mqf6cop03g.apps.googleusercontent.com`) is what local dev re-uses, so the **redirect URI** the backend uses must be one of the URIs registered on that client. Current whitelist:

**Authorized JavaScript origin:**
- `http://localhost:5173`

**Authorized redirect URIs:**
- `http://localhost:8000/api/auth/google/callback`
- `http://localhost:5180/api/auth/google/callback`
- `http://localhost:8001/api/auth/google/callback`
- `https://inventory-api-staging-329274314764.us-central1.run.app/api/auth/google/callback`
- `https://inventory-frontend-staging-329274314764.us-central1.run.app/api/auth/google/callback`

**The redirect URI must match exactly** — Google does **not** treat localhost ports as interchangeable for `Web application` clients. If you run the frontend on a port that's not on this list (e.g. `:5143`, `:5175`), the callback request will fail with `redirect_uri_mismatch`.

To add a new local port:
1. https://console.cloud.google.com/apis/credentials?project=moonfive-crm → click the `inventory-staging` Web application client
2. Under **Authorized redirect URIs**, add `http://localhost:<your-port>/api/auth/google/callback`
3. Save (propagation is ~5 seconds)
4. Restart the backend with `GOOGLE_REDIRECT_URI=http://localhost:<your-port>/api/auth/google/callback` and `FRONTEND_URL=http://localhost:<your-port>`

Prefer the existing ports (5180 in docker-stack mode, or registering one new port that becomes "yours") over inventing new ones each time — keeping the list short keeps the OAuth surface small.

---

## Why the redirect goes through the frontend port, not the backend

The OAuth callback lands on `/api/auth/google/callback`, where the backend exchanges the code for a JWT and **sets `auth_token` as a cookie**. That cookie is scoped to the origin of the response — i.e. the origin Google redirected to.

If you registered `localhost:8000` (backend) as the redirect URI, the cookie attaches to `localhost:8000`. The browser sitting on `localhost:5180` would never see it, so the next page load would still be unauthenticated. Hence the production pattern: register the **frontend** origin, let nginx (docker) or vite's proxy (host mode) forward `/api/*` to the backend transparently, and the cookie lands on the same origin as the page.

(`localhost:8000` is on the whitelist as an escape hatch for testing the backend in isolation with `curl` — not for browser sign-in.)

---

## Bringing up the docker stack

```bash
cd /Users/stephan/MoonFive/inventory
./deploy.sh local      # pulls staging OAuth secrets, writes .env, docker compose up
```

Then:
- Open http://localhost:5180
- Click "Sign in with Google"
- Pick your `@moonfive.tech` account → you're an `admin` on first sign-in

To stop: `docker compose down` (keeps the postgres volume) or `docker compose stop` (keeps containers, just stops).

---

## Bringing up the host hot-reload stack (alternative)

For sub-second iteration on Python or React code:

```bash
cd /Users/stephan/MoonFive/inventory
./dev.sh               # starts only the db container

# in one terminal:
cd backend
source .venv/bin/activate
DATABASE_URL=postgresql://postgres:postgres@localhost:5450/inventory \
JWT_SECRET=dev-secret-key \
GOOGLE_CLIENT_ID=$(gcloud secrets versions access latest --secret=inventory-google-client-id-staging --project=moonfive-crm) \
GOOGLE_CLIENT_SECRET=$(gcloud secrets versions access latest --secret=inventory-google-client-secret-staging --project=moonfive-crm) \
GOOGLE_REDIRECT_URI=http://localhost:5180/api/auth/google/callback \
FRONTEND_URL=http://localhost:5180 \
POP_ENCRYPTION_KEY=ouu1aARMcEOxbR04uMSR_VlhXAhAqPSfzHR8iIeUknA= \
uvicorn app.main:app --reload --port 8000

# in another terminal:
cd frontend
npx vite --port 5180   # must match a whitelisted port, see above
```

If you'd rather use the vite default `:5174`, register `http://localhost:5174/api/auth/google/callback` on the OAuth client first (see whitelist section).

---

## Common pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| `{"detail": "Google OAuth not configured"}` | Backend started without `GOOGLE_CLIENT_ID` set | Set the env (see commands above) or use `./deploy.sh local` which writes `.env` |
| Firmware card shows "Latest release: unavailable" + repo link | Anonymous GitHub call 404'd because the firmware repos are private | Set `GITHUB_API_TOKEN=$(gh auth token)` before starting the backend; restart |
| Google returns `Error 400: redirect_uri_mismatch` | The port you're running on isn't whitelisted on the OAuth client | Add `http://localhost:<port>/api/auth/google/callback` to the client in GCP Console |
| Sign-in succeeds but you keep getting bounced back to the login page | Cookie set on a different origin than the page | Make sure `GOOGLE_REDIRECT_URI` is on the **frontend** port (not 8000) and same-origin with `FRONTEND_URL` |
| `port is already allocated` on `docker compose up` | Another worktree's stack is using 5180/5450/8000 | `docker stop <container>` to free it, or use a different worktree's containers |

---

## Database

Local dev DB is **`inventory`** (database name, not schema) on `localhost:5450`, user `postgres`, password `postgres`, schema `inventory` (set on the connection pool's search_path).

- Reset: `docker compose down -v && ./deploy.sh local` (drops the `pgdata` volume — destroys local data)
- Schema replays on every backend startup (`schema.sql` is idempotent — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.)

The integration-test DB is **`inventory_test`** on `localhost:5451`, separate container, never shares state with the dev DB.
