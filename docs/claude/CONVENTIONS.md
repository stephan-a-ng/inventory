# CONVENTIONS.md

Coding standards for the two-app stack. Python rules apply to `backend/`; JS rules apply to `frontend/`.

## Python (backend)

### File naming

| Type | Convention | Example |
|---|---|---|
| Modules under a slice | `snake_case.py` | `device_service.py` |
| Slice barrel | `__init__.py` | `backend/app/features/auth/__init__.py` |
| Tests | `test_*.py` next to the file under test | `test_device_service.py`, `test_devices_routes.py` |
| Integration tests | `test_*_integration.py` | `test_devices_integration.py` |

### Imports

Use absolute imports rooted at `app.*`. Order:

```python
# 1. stdlib
import json
from uuid import UUID

# 2. third-party
import asyncpg
from fastapi import APIRouter, Depends

# 3. shared
from app.shared.db import DatabasePool
from app.shared.models import ProductType

# 4. other features (only via the barrel)
from app.features.auth import get_current_user, require_role
from app.features.audit import log_action

# 5. same-slice relative imports
from .models import DeviceCreate, DeviceOut
from .services import list_devices
```

**Never import from another slice's internals.** `from app.features.devices.services import _serialize_device` is private — the slice owns it. If another slice needs it, the owning slice re-exports it from its `__init__.py`.

### Type hints

Type-hint all function signatures. Use modern syntax:

```python
async def list_devices(
    product_type: str | None = None,
    stage_id: UUID | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    ...
```

Pydantic models live in the slice's `models.py`. Prefer `BaseModel` for request/response shapes; use plain TypedDict / dataclass only when the value never crosses an API boundary.

### Async patterns

- Every route handler is `async def`. Every service function that touches the DB is `async def`.
- No `asyncio.run()` inside FastAPI code — let the framework own the event loop.
- Use `asyncio.gather(...)` for parallel independent queries.
- `await DatabasePool.fetch(...)` / `fetchrow` / `fetchval` / `execute` — never reach for `acquire()` directly unless you need a transaction.

### Parameterized queries

```python
# ✅ correct
row = await DatabasePool.fetchrow(
    "SELECT id, mac_address FROM devices WHERE id = $1",
    device_id,
)

# ❌ forbidden — SQL injection
row = await DatabasePool.fetchrow(
    f"SELECT id, mac_address FROM devices WHERE id = '{device_id}'"
)
```

`asyncpg` uses positional `$1, $2, …` parameters — not `%s` or `?`.

### Comments

Default rule: don't comment what good naming already says.

- **Docstrings on every exported function / class / module-level helper** — one line minimum, more if there's a non-obvious WHY.
- **Inline comments only when the WHY is non-obvious** — a hidden invariant, an external-API quirk, a workaround for a specific bug, an ordering constraint.
- **Module docstring on every non-trivial file** — one line describing the file's role.

Don't:

- Don't repeat the function name (`# Creates a booking.` above `def create_booking(...)`)
- Don't reference current tasks or PR numbers (that's what commits are for)
- Don't write multi-paragraph essays

### Style

- PEP 8 with line length 100.
- Use f-strings, not `%` or `.format()`.
- Prefer `dict | None` over `Optional[dict]` (Python 3.10+).
- Don't catch broad exceptions silently — `except Exception:` with a `logger.exception(...)` is the floor.

## JavaScript / JSX (frontend)

### File naming

| Type | Convention | Example |
|---|---|---|
| React components | `PascalCase.jsx` | `DeviceTable.jsx`, `AppSidebar.jsx` |
| Pages | `PascalCase.jsx` | `Dashboard.jsx`, `DeviceDetail.jsx` |
| Hooks | `useFoo.js` or `useFoo.jsx` (with JSX if it returns JSX) | `useAuth.jsx`, `useScanner.js` |
| Stores | `camelCase.js` ending in `Store.js` | `deviceStore.js` |
| Slice barrel | `index.js` | `frontend/src/features/devices/index.js` |
| Tests | mirror the file under test | `DeviceTable.test.jsx`, `useAuth.test.jsx` |
| Utility modules | `camelCase.js` | `api.js`, `utils.js` |

### Imports

Use the `@/` alias for everything inside `frontend/src/`. Order:

```jsx
// 1. third-party
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

// 2. shared (cross-feature primitives)
import { Button } from "@/shared/components/ui/button";
import { authFetch } from "@/shared/lib/api";

// 3. other features (only via the barrel)
import { useAuth } from "@/features/auth";
import { log } from "@/features/audit";

// 4. same-slice relative imports
import { DeviceForm } from "../components/DeviceForm";
import { useDeviceStore } from "../stores/deviceStore";
```

**Never import from another feature's internals.** `@/features/devices/components/PipelineSection` is private to the `devices` slice — if `app/routes/Settings.jsx` wants it, the slice re-exports it from `index.js`.

### React conventions

- Function components only. No class components.
- Hooks live in `frontend/src/features/<slice>/hooks/` or `frontend/src/shared/lib/` depending on scope.
- `useEffect` cleanup is non-optional for subscriptions, timers, intervals, and event listeners.
- Memo / `useMemo` / `useCallback` only when you have measured a problem — not by default.

### State management

- **Zustand stores live in `features/<slice>/stores/`** — UI state that the slice owns. Cross-slice state goes through a shared store under `frontend/src/shared/stores/` (only if genuinely shared — currently none).
- **Server state stays on the server.** Refetch on every action. No client cache layer (SWR / React Query) — see [STACK.md](STACK.md).

### Comments

Same rule as Python: only write a comment when the WHY is non-obvious. Don't restate code. Don't reference task numbers. Don't write essays.

### Style

- 2-space indent. ESLint config in `frontend/eslint.config.js`.
- Single quotes in JS, double quotes in JSX attributes (matches Prettier defaults the repo already uses).
- Prefer `const` over `let`. Never `var`.
- Destructure props at the top of the component body.

## Tests

See [TESTING.md](TESTING.md) for the full pyramid. The naming-and-location rules:

- **Backend unit** (`test_<service>.py`): pure logic, no DB, no network. Patch the `DatabasePool` at the module boundary.
- **Backend integration** (`test_<routes>_integration.py`): real test DB via `pg_pool` + `clean_db` fixtures. Mock external services (Google OAuth) at the HTTP layer.
- **Frontend unit** (`*.test.js` in vitest's `unit` project): pure functions, hooks with mocked `fetch`.
- **Frontend component** (`*.test.jsx` in vitest's `component` project): RTL + jsdom. Mock `@/shared/lib/api` at the module level.
- **E2E** (`frontend/e2e/specs/*.spec.js`): use the auth fixture to skip Google OAuth. One spec for the critical path; edge cases belong in integration.

## Commits

- Conventional commits: `feat(slice):`, `fix(slice):`, `refactor(slice):`, `test:`, `docs:`, `chore:`.
- Title under 72 chars. Body explains the why.
- End with `Co-Authored-By:` if you collaborated with an AI.
- One logical change per commit. Refactors that move files should not also rewrite logic in the same commit.
