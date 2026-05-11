# TESTING.md

## The pyramid

```
       /\
      /E2E\           frontend/e2e/specs/*.spec.js          Playwright — critical paths only
     /------\
    /  Integ  \       backend: test_*_integration.py        pytest + real test DB
   /------------\
  /  Component   \    frontend: *.test.jsx (jsdom + RTL)    vitest component project
 /----------------\
/      Unit         \ backend: test_*.py (pure logic)       pytest unit
                      frontend: *.test.js (node)            vitest unit project
```

| Layer | Location | Tool | Env | Speed | Priority |
|---|---|---|---|---|---|
| Backend unit | `backend/app/features/<slice>/test_<file>.py` | pytest + pytest-asyncio | python (DB mocked) | < 100ms | High |
| Backend integration | `backend/app/features/<slice>/test_<file>_integration.py` | pytest + pytest-asyncio | python + real `inventory_test` DB | < 2s | High |
| Frontend unit | `frontend/src/**/*.test.js` | Vitest | node | < 100ms | High |
| Frontend component | `frontend/src/**/*.test.jsx` | Vitest + RTL | jsdom | < 500ms | Medium |
| E2E | `frontend/e2e/specs/*.spec.js` | Playwright | chromium + docker compose | 5–15s | High (critical paths only) |

## What goes in each layer

- **Backend unit** — pure functions, business rules, transforms, helpers. The `DatabasePool` is patched at the module boundary with an `AsyncMock` that returns rows. Fast feedback; should be the bulk of the suite for services with branching logic (csv parsing, stage advance, mac validation).
- **Backend integration** — real `inventory_test` DB via `pg_pool` + `clean_db` fixtures. Truncates tables in `beforeEach` (function-scoped). External services (Google OAuth callback) are mocked at the HTTP boundary using `httpx.MockTransport`. This is where route handlers get exercised end-to-end.
- **Frontend unit** — pure hooks, utilities. `fetch` is mocked at the global level. No JSX.
- **Frontend component** — RTL + jsdom. Mock `@/shared/lib/api`, react-router's `useNavigate`, anything that crosses the slice boundary. Test the user-visible behavior of one component, not its internals.
- **E2E** — the critical user flow: log in (via auth bypass fixture) → list devices → create one → click into detail → advance stage. Don't put edge cases here — they belong in integration.

## Backend: pytest setup

`backend/pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["app", "tests"]
python_files = ["test_*.py"]
addopts = [
    "--strict-markers",
    "--tb=short",
]
markers = [
    "integration: tests that hit a real Postgres",
]
```

`backend/tests/conftest.py` exports session-scoped fixtures:

- `pg_pool` — opens an `asyncpg.create_pool` against the test DB (`inventory_test`), runs `schema.sql`, yields the pool. The pool is configured with `search_path: inventory` to mirror production.
- `clean_db(pg_pool)` — function-scoped autouse for integration tests; truncates every table.
- `auth_user(role)` — factory that creates a row in `users` and returns `(user_dict, jwt_token)`.
- `client(pg_pool, auth_user)` — `httpx.AsyncClient` against the FastAPI app, optionally with an `auth_token` cookie pre-attached.

The test DB lives in a separate Postgres container started via `docker-compose.test.yml` on port `5451`. The pool refuses to start unless `DATABASE_URL` contains `inventory_test`.

**Why a separate container instead of a schema in the dev DB**: hermetic test runs. The test DB is reset on every CI run; the dev DB carries the developer's seed data. Mixing them is how stale-state bugs hide.

## Frontend: Vitest projects

`frontend/vitest.config.js` defines two named projects so each runs in the right environment:

```bash
npm run test:unit         # vitest run --project unit
npm run test:component    # vitest run --project component
```

- **unit** (node env, no DOM): tests for `lib/api.js`, store reducers, pure utilities.
- **component** (jsdom + RTL): tests for components in `features/<slice>/components/`.

**Why two projects** instead of one with conditional env: jsdom adds setup cost; component tests need RTL setup files. Splitting keeps unit tests fast.

## Playwright

`frontend/playwright.config.js` launches against the dev compose stack pointed at the test DB. Critical pieces:

- **`e2e/fixtures/auth.js`** — JWT-signing fixture that bypasses Google OAuth at the cookie layer. Mints a JWT with the same secret the backend uses (read from env) and sets the `auth_token` cookie before the page loads. Never use the real Google login form in tests.
- **`e2e/fixtures/db.js`** — raw `pg` truncate + seed (one admin user) before each spec. Refuses to run unless `DATABASE_URL` contains `inventory_test`.
- **One critical-path spec** initially: `e2e/specs/device-flow.spec.js` — log in → dashboard loads → create device via form → click into detail → advance stage → audit row appears.

## TDD discipline

- **Adding to a slice**: write the test first against the slice's barrel (or service file). Let it fail. Implement until green.
- **Refactoring existing code**: write a characterization test that pins current behavior first, then refactor. The test must pass before and after.
- **Bug fix**: reproduce the bug as a failing test before the fix. The test stays in the suite.

## Run a single test

```bash
# Backend
cd backend
pytest app/features/devices/test_device_service.py
pytest -k "test_creates_device"
pytest -m integration                    # only integration-marked tests
pytest app/features/devices/test_device_service.py::test_creates_device

# Frontend Vitest
cd frontend
npx vitest run --project unit src/features/auth/useAuth.test.js
npx vitest run -t "name fragment"

# Playwright
cd frontend
npx playwright test e2e/specs/device-flow.spec.js
npx playwright test --grep "advance stage"
npx playwright test --ui                 # interactive
```

## Common rules

- **Mock at the boundary, not inside.** If a service imports `DatabasePool`, mock `DatabasePool` — don't reach into the service to mock its internal SQL.
- **Don't share state between tests.** Integration tests truncate in `clean_db`. Component tests get fresh DOM per test.
- **No bare `Exception` catches in tests.** If something can throw, assert it does.
- **Don't conditionally skip based on env** (`if not os.getenv("X"): pytest.skip(...)`). Either the test runs or it shouldn't exist in this layer.
- **Test code is shipped code.** No `# type: ignore`, no `eslint-disable`, no `as any` (when TS lands).

## When tests get flaky

Flake is almost always a real bug — a missing `await`, a state leak, a race. Don't `.retry()` your way out of it. Treat the flake as a failing test until you can explain *why* it was non-deterministic.

Common sources here:

- Forgetting `await` on an asyncpg call inside a test
- Truncating `users` but not resetting the JWT issued in a previous test
- Playwright clicking before the API response has resolved — use `waitForResponse` for the API call, not arbitrary timeouts

## Reference: moonfive-testing skill

For Python-specific patterns like the `MockDatabaseManager` mock that wraps the asyncpg pool with deterministic behavior, see the [`moonfive-testing` skill](https://github.com/moonfive/.claude/skills/moonfive-testing). This project uses the patterns described there for backend unit tests.
