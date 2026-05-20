"""API-key authentication for headless callers (flash tools, CI scripts).

The existing Google OAuth + JWT cookie flow assumes a browser. The factory
flash workflow runs from a developer's terminal and posts a device-provision
payload with no browser in sight, so it needs a different auth path.

Current implementation: a single shared secret loaded from the
`INVENTORY_API_KEY` env var, compared in constant time against the
`X-API-Key` request header. This is intentionally minimal — the production
upgrade path is a DB-backed `api_keys` table with per-operator records,
last-used timestamps, and revocation. Tracked in docs/claude/SECURITY.md.

Usage in a route:

    @router.post("/provision", dependencies=[Depends(require_api_key)])
    async def provision_device(...):
        ...
"""
import hmac
import os

from fastapi import HTTPException, Request


def _expected_key() -> str | None:
    """Return the configured API key, or None if not set."""
    val = os.getenv("INVENTORY_API_KEY", "").strip()
    return val or None


async def require_api_key(request: Request) -> dict:
    """FastAPI dependency. Raises 401 unless the request carries a valid
    `X-API-Key` matching `INVENTORY_API_KEY`. Returns a synthetic service
    user dict so downstream code that expects `user["id"]` / `user["role"]`
    still works.

    503 if no key is configured server-side — fails closed rather than
    silently allowing every caller.
    """
    expected = _expected_key()
    if expected is None:
        raise HTTPException(
            status_code=503,
            detail="INVENTORY_API_KEY not configured on the server",
        )
    provided = request.headers.get("x-api-key", "").strip()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
    return {
        "id": None,
        "email": "service:flash-tool",
        "name": "flash-tool",
        "role": "technician",
        "auth": "api_key",
    }
