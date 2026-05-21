"""Integration tests for the API-key + CLI-OAuth surface.

Covers:
  * `POST /api/auth/cli-exchange` — round-trip an in-memory pending code
    into a plaintext key
  * DB-backed key auth via `require_api_key` — minted key auths the
    provision endpoint as the owning user
  * `GET /api/auth/api-keys` — list keys for the JWT-authenticated user
  * `DELETE /api/auth/api-keys/{id}` — revocation
  * Revoked keys no longer authenticate

The Google OAuth dance itself (`/cli-login` → Google → `/google/callback`)
is excluded — it requires a real Google round-trip. The CLI flow's two
ends (state stashing in the callback, exchange handing back plaintext)
are unit-tested by calling `mint_api_key` + `stash_pending_exchange`
directly to drive a full round-trip without the network leg.
"""
from __future__ import annotations

import pytest

from app.features.auth.api_key_service import mint_api_key, stash_pending_exchange


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# CLI exchange round-trip (without the Google round-trip)
# ---------------------------------------------------------------------------


async def test_cli_exchange_returns_stashed_plaintext(client, clean_db, auth_user):
    """Simulate what the modified Google callback does: mint + stash, then
    exercise /api/auth/cli-exchange — should hand back the plaintext key
    exactly once."""
    user, _ = await auth_user("admin")
    plaintext, _ = await mint_api_key(user_id=user["id"], name="test-cli")
    stash_pending_exchange("state-abc-1234567890", plaintext, "test-cli")

    r = await client.post("/api/auth/cli-exchange", json={"state": "state-abc-1234567890"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["api_key"] == plaintext
    assert body["name"] == "test-cli"


async def test_cli_exchange_is_single_use(client, clean_db, auth_user):
    user, _ = await auth_user("admin")
    plaintext, _ = await mint_api_key(user_id=user["id"], name="test")
    stash_pending_exchange("state-zzz-12345678", plaintext, "test")

    r1 = await client.post("/api/auth/cli-exchange", json={"state": "state-zzz-12345678"})
    assert r1.status_code == 200
    r2 = await client.post("/api/auth/cli-exchange", json={"state": "state-zzz-12345678"})
    assert r2.status_code == 404


async def test_cli_exchange_unknown_state_404(client, clean_db):
    r = await client.post("/api/auth/cli-exchange", json={"state": "never-stashed-1234"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# DB-backed key authenticates downstream endpoints
# ---------------------------------------------------------------------------


async def test_minted_key_auths_provision_as_owning_user(client, clean_db, pg_pool, auth_user):
    user, _ = await auth_user("admin")
    plaintext, _ = await mint_api_key(user_id=user["id"], name="auth-test-key")

    # Use the key on the provision endpoint — should work and create the device.
    payload = {
        "product_type": "EVSE",
        "mcus": [{"role": "mcu1", "wifi_sta_mac": "BB:CC:DD:00:00:01"}],
    }
    r = await client.post(
        "/api/devices/provision", json=payload, headers={"X-API-Key": plaintext}
    )
    assert r.status_code == 201, r.text
    assert r.json()["created"] is True

    # last_used_at on the key should now be populated.
    async with pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT last_used_at FROM api_keys WHERE key_prefix = $1", plaintext[:8]
        )
    assert row["last_used_at"] is not None


async def test_revoked_key_no_longer_auths(client, clean_db, pg_pool, auth_user):
    user, _ = await auth_user("admin")
    plaintext, row = await mint_api_key(user_id=user["id"], name="will-revoke")

    async with pg_pool.acquire() as conn:
        await conn.execute(
            "UPDATE api_keys SET revoked_at = now() WHERE id = $1", row["id"]
        )

    r = await client.post(
        "/api/devices/provision",
        json={"product_type": "EVSE", "mcus": [{"role": "mcu1", "wifi_sta_mac": "BB:CC:DD:00:01:01"}]},
        headers={"X-API-Key": plaintext},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# /api/auth/api-keys list + create + delete (browser-authenticated)
# ---------------------------------------------------------------------------


async def test_list_api_keys_returns_user_keys_without_plaintext(client, clean_db, auth_user):
    user, token = await auth_user("admin")
    _, k1 = await mint_api_key(user_id=user["id"], name="key-A")
    _, k2 = await mint_api_key(user_id=user["id"], name="key-B")

    client.cookies.set("auth_token", token)
    r = await client.get("/api/auth/api-keys")
    assert r.status_code == 200
    body = r.json()
    names = sorted(k["name"] for k in body["keys"])
    assert names == ["key-A", "key-B"]
    for k in body["keys"]:
        assert "api_key" not in k          # plaintext must never leak in list
        assert k["key_prefix"].startswith("mfk_")


async def test_create_api_key_returns_plaintext_once(client, clean_db, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    r = await client.post("/api/auth/api-keys", json={"name": "manual-mint"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["api_key"].startswith("mfk_")
    assert body["name"] == "manual-mint"


async def test_delete_api_key_revokes_it(client, clean_db, pg_pool, auth_user):
    user, token = await auth_user("admin")
    _, row = await mint_api_key(user_id=user["id"], name="to-delete")
    client.cookies.set("auth_token", token)

    r = await client.delete(f"/api/auth/api-keys/{row['id']}")
    assert r.status_code == 204
    async with pg_pool.acquire() as conn:
        revoked = await conn.fetchval(
            "SELECT revoked_at FROM api_keys WHERE id = $1", row["id"]
        )
    assert revoked is not None


async def test_delete_api_key_404_if_not_owner(client, clean_db, auth_user):
    """User A's key is invisible to user B."""
    user_a, _ = await auth_user("admin")
    user_b, token_b = await auth_user("admin")
    _, row = await mint_api_key(user_id=user_a["id"], name="user-a-key")
    client.cookies.set("auth_token", token_b)

    r = await client.delete(f"/api/auth/api-keys/{row['id']}")
    assert r.status_code == 404


async def test_list_api_keys_requires_auth(client, clean_db):
    r = await client.get("/api/auth/api-keys")
    assert r.status_code == 401
