"""API-key service: mint, lookup, list, revoke.

Plaintext keys look like `mfk_<32 url-safe base64 chars>`. The first 8 chars
(`mfk_xxxx`) form the prefix that we index for fast lookup; the full key's
SHA-256 is what we compare in constant time. Plaintext is returned exactly
once at mint time and never persisted.

One-time exchange codes for the CLI OAuth flow are held in-memory with a
5-minute TTL — keeps the long-lived plaintext key out of redirect URLs and
out of the DB. Lost on restart, which is fine: the user just re-runs the
login flow.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from app.shared.db import DatabasePool


KEY_PREFIX_LEN = 8           # "mfk_xxxx" — kept un-hashed for indexed lookup
EXCHANGE_TTL_SECONDS = 300   # 5 minutes


def _new_key() -> str:
    """`mfk_<32 url-safe base64 chars>` = ~190 bits of entropy."""
    return "mfk_" + secrets.token_urlsafe(24)


def _hash(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Pending CLI-exchange codes (in-memory)
# ---------------------------------------------------------------------------


@dataclass
class _PendingExchange:
    api_key_plaintext: str
    name: str
    expires_at: float


_PENDING: dict[str, _PendingExchange] = {}


def _gc_pending() -> None:
    now = time.time()
    dead = [k for k, v in _PENDING.items() if v.expires_at < now]
    for k in dead:
        _PENDING.pop(k, None)


def stash_pending_exchange(code: str, plaintext: str, name: str) -> None:
    """Hold a freshly-minted key in memory until the CLI POSTs the matching
    code back. Single-use: the corresponding `consume_pending_exchange()`
    call removes the entry."""
    _gc_pending()
    _PENDING[code] = _PendingExchange(
        api_key_plaintext=plaintext,
        name=name,
        expires_at=time.time() + EXCHANGE_TTL_SECONDS,
    )


def consume_pending_exchange(code: str) -> Optional[_PendingExchange]:
    """Look up + remove. Returns None if the code is unknown or expired."""
    _gc_pending()
    entry = _PENDING.pop(code, None)
    if entry is None:
        return None
    if entry.expires_at < time.time():
        return None
    return entry


# ---------------------------------------------------------------------------
# DB-backed key operations
# ---------------------------------------------------------------------------


async def mint_api_key(*, user_id: UUID, name: str) -> tuple[str, dict]:
    """Create a new API key for `user_id`. Returns (plaintext_key, db_row).

    Plaintext is the only place the key ever appears in full — the caller
    must hand it to the operator (or stash for one-time exchange) before
    discarding."""
    plaintext = _new_key()
    prefix = plaintext[:KEY_PREFIX_LEN]
    key_hash = _hash(plaintext)
    row = await DatabasePool.fetchrow(
        """INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING id, user_id, name, key_prefix, created_at, last_used_at, revoked_at""",
        user_id, name, prefix, key_hash,
    )
    return plaintext, dict(row)


async def lookup_active_key(plaintext: str) -> Optional[dict]:
    """Return the api_keys row (joined with the owning user) if the plaintext
    matches an unrevoked row, else None. Bumps last_used_at as a side effect.
    """
    if not plaintext or not plaintext.startswith("mfk_"):
        return None
    prefix = plaintext[:KEY_PREFIX_LEN]
    row = await DatabasePool.fetchrow(
        """SELECT k.id, k.user_id, k.name, k.key_hash, k.revoked_at,
                  u.email, u.role, u.name AS user_name
           FROM api_keys k
           LEFT JOIN users u ON u.id = k.user_id
           WHERE k.key_prefix = $1 AND k.revoked_at IS NULL""",
        prefix,
    )
    if row is None:
        return None
    if not hmac.compare_digest(row["key_hash"], _hash(plaintext)):
        return None
    await DatabasePool.execute(
        "UPDATE api_keys SET last_used_at = now() WHERE id = $1", row["id"]
    )
    return dict(row)


async def list_user_keys(user_id: UUID) -> list[dict]:
    rows = await DatabasePool.fetch(
        """SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
           FROM api_keys
           WHERE user_id = $1
           ORDER BY created_at DESC""",
        user_id,
    )
    return [dict(r) for r in rows]


async def revoke_key(*, user_id: UUID, key_id: UUID) -> bool:
    """Mark a key revoked. Only the owning user (or admin, enforced at the
    route layer) may revoke. Returns True if a row was updated."""
    result = await DatabasePool.execute(
        """UPDATE api_keys SET revoked_at = now()
           WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL""",
        key_id, user_id,
    )
    # asyncpg returns "UPDATE n" for executes
    return result.endswith(" 1") if isinstance(result, str) else bool(result)
