# WORKFLOWS.md

Day-to-day commands. Everything here assumes you're in the repo root unless otherwise noted.

## Bring up the dev stack

```bash
docker compose up                       # db :5450, backend :8000, frontend :5173
docker compose up -d db backend         # background, just the API
docker compose down                     # stop and remove containers
docker compose down -v                  # also drop the pgdata volume (reset DB)
```

Endpoints:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000 (docs at `/docs`)
- Postgres: `localhost:5450` (db `inventory`, user/password `postgres`/`postgres`)

## Add an endpoint to an existing slice

1. **Test first.** Open `backend/app/features/<slice>/test_<service>.py` (or `test_<routes>_integration.py`) and write a failing test for the new behavior. Pick the right layer:
   - Pure logic → unit (`test_<service>.py` with the pool mocked)
   - Hits the DB → integration (`test_<routes>_integration.py` with the real test DB)
2. Run `pytest app/features/<slice>/test_<file>.py` and confirm the test fails for the right reason.
3. Implement until green.
4. If the new code becomes part of the slice's contract, re-export it from `__init__.py`.

## Add a brand-new backend slice

1. `mkdir -p backend/app/features/<slice>` and create `__init__.py`, `routes.py`, `services.py`, `models.py`.
2. In `__init__.py`, export the FastAPI `router` and any service callables other slices will use.
3. In `backend/app/main.py`, import and mount the router via the barrel: `from app.features.<slice> import router as <slice>_router; app.include_router(<slice>_router)`.
4. Add the slice to the layering diagram in [ARCHITECTURE.md](ARCHITECTURE.md).
5. Write code TDD-first per the workflow above.

## Add a new frontend page

1. Create `frontend/src/features/<slice>/pages/<Page>.jsx`.
2. Compose components from `features/<slice>/components/` and shared UI.
3. Use `authFetch` from `@/shared/lib/api` for all API calls.
4. Wire the route in `frontend/src/app/App.jsx` and (if applicable) `frontend/src/shared/components/layout/AppSidebar.jsx`.
5. Write at least one component test under `features/<slice>/components/<Component>.test.jsx`.

## Add a domain field

1. Edit `backend/app/shared/schema.sql` — add an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` block.
2. Restart the backend (`docker compose restart backend`) — the lifespan re-runs `schema.sql`.
3. Update the Pydantic model in `backend/app/features/<slice>/models.py`.
4. Update [DOMAIN.md](DOMAIN.md).
5. Update integration tests that seeded the table without the new field.

## Run tests

```bash
# Backend
cd backend
make test                               # all pytest layers
make test-unit                          # unit only
make test-int                           # integration only — needs test DB
pytest app/features/devices/            # all tests in one slice
pytest -k "bulk_import"                 # by test-name fragment

# Frontend
cd frontend
npm run test:unit                       # vitest, node
npm run test:component                  # vitest, jsdom
npm run test:e2e                        # playwright
npm run test:all                        # all three

# Bring up the test DB first if running integration / e2e:
docker compose -f docker-compose.test.yml up -d
```

If `make test-int` or `npm run test:e2e` complains about `DATABASE_URL`, you forgot to bring up the test DB.

## Run a single test

```bash
# pytest
pytest app/features/devices/test_device_service.py::test_creates_device
pytest -k "test_creates_device"

# vitest
npx vitest run --project unit src/features/auth/useAuth.test.js
npx vitest run -t "name fragment"

# playwright
npx playwright test e2e/specs/device-flow.spec.js
npx playwright test --grep "advance stage"
npx playwright test --ui                # interactive
```

## Manual smoke test

```bash
docker compose up
# Open http://localhost:5173
# Log in with a @moonfive.tech account
# Walk the critical path:
#   1. Dashboard loads, devices list shows
#   2. Create a new device via the modal
#   3. Click into Detail
#   4. Advance the stage
#   5. Audit timeline shows the new entry
```

## Deploy

```bash
./deploy.sh staging                     # fast — confirm with the user first (prod is live)
./deploy.sh production                  # gated: typed confirmation
```

After a successful deploy, the script prints the live URL. Always surface that to the user.

Full env-split rules, OAuth bootstrap, secret rotation, and pitfalls live in [DEPLOYMENT.md](DEPLOYMENT.md). Don't shortcut the deploy script — its guards are the only thing standing between you and a cross-env credential mixup.

## Reset the dev DB

```bash
docker compose down -v                  # drops pgdata
docker compose up -d db
docker compose up backend               # lifespan re-runs schema.sql + seeds
```

## Inspect production logs

```bash
gcloud run services logs read inventory-api-production \
  --project moonfive-crm --region us-central1 --limit 50

gcloud run services logs tail inventory-api-staging \
  --project moonfive-crm --region us-central1
```
