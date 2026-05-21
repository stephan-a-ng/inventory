"""API-key authentication for headless callers (flash tools, CI scripts).

Two key sources, tried in order:

1. **DB-backed keys** (preferred) — `api_keys` table, one row per operator,
   minted via the CLI Google-OAuth flow (`POST /api/auth/cli-exchange`).
   Revocable per-row; bumps `last_used_at` on each successful auth.

2. **Env var fallback** — `INVENTORY_API_KEY` shared secret. Useful for CI /
   bootstrapping. When matched, the caller is a "service" identity (no user).

Returns a user-shaped dict either way so downstream code can read `["role"]`,
`["email"]`, etc. The DB path returns the owning user's identity; the env-var
path returns a synthetic service user.
"""
import hmac
import os

from fastapi import HTTPException, Request

from .api_key_service import lookup_active_key


def _env_key() -> str | None:
    """The shared INVENTORY_API_KEY env var, or None if unset."""
    val = os.getenv("INVENTORY_API_KEY", "").strip()
    return val or None


async def require_api_key(request: Request) -> dict:
    """FastAPI dependency. Raises 401 unless the request carries a valid
    `X-API-Key` — either a per-operator DB key or the shared env-var key.

    Returns a user-shaped dict (`{id, email, name, role, auth}`) so route
    handlers and audit logging can attribute the call.
    """
    provided = request.headers.get("x-api-key", "").strip()
    if not provided:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    # 1. DB lookup (per-operator key). Constant-time hash compare happens
    #    inside lookup_active_key; that call also bumps last_used_at.
    row = await lookup_active_key(provided)
    if row is not None:
        return {
            "id": row["user_id"],
            "email": row.get("email") or "service:api-key",
            "name": row.get("user_name") or row.get("name") or "api-key",
            "role": row.get("role") or "technician",
            "auth": "api_key_db",
            "api_key_id": row["id"],
            "api_key_name": row["name"],
        }

    # 2. Env-var fallback (shared bootstrap key).
    env = _env_key()
    if env is not None and hmac.compare_digest(provided, env):
        return {
            "id": None,
            "email": "service:flash-tool",
            "name": "flash-tool",
            "role": "technician",
            "auth": "api_key_env",
        }

    raise HTTPException(status_code=401, detail="Invalid X-API-Key")
