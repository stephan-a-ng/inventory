"""Integration tests for PoP endpoints — covers installer-app spec §10 acceptance criteria."""
import pytest

pytestmark = pytest.mark.integration


async def _create_device(client, mac: str, product_type: str = "CHARGER") -> dict:
    r = await client.post(
        "/api/devices",
        json={"mac_address": mac, "product_type": product_type},
    )
    assert r.status_code == 200, r.text
    return r.json()


async def test_create_charger_returns_pop_field(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    body = await _create_device(client, "AA:BB:CC:00:00:01", "CHARGER")
    assert "pop" in body
    assert body["pop"].startswith("mfp_")
    assert len(body["pop"]) == 30
    assert "pop_generated_at" in body


async def test_create_non_charger_omits_pop_field(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    body = await _create_device(client, "AA:BB:CC:00:00:02", "AEMS")
    assert "pop" not in body
    assert "pop_generated_at" not in body


async def test_pop_stored_encrypted_in_db(client, auth_user, integration_pool):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    body = await _create_device(client, "AA:BB:CC:00:00:03", "CHARGER")
    async with integration_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT pop FROM inventory.devices WHERE mac_address = $1",
            "AA:BB:CC:00:00:03",
        )
    # Ciphertext: Fernet token starts with "gAAAAA" (version 0x80 base64url).
    # Crucially, the plaintext PoP should NOT appear in the DB column.
    assert row["pop"] != body["pop"]
    assert row["pop"].startswith("gAAAAA")


async def test_get_pop_admin(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    created = await _create_device(client, "AA:BB:CC:00:00:10")

    r = await client.get("/api/devices/AA:BB:CC:00:00:10/pop")
    assert r.status_code == 200, r.text
    assert r.json()["pop"] == created["pop"]
    assert r.headers.get("cache-control") == "no-store"


async def test_get_pop_technician(client, auth_user):
    _, admin_token = await auth_user("admin")
    _, tech_token = await auth_user("technician", email="tech1@moonfive.tech")

    client.cookies.set("auth_token", admin_token)
    await _create_device(client, "AA:BB:CC:00:00:11")

    client.cookies.set("auth_token", tech_token)
    r = await client.get("/api/devices/AA:BB:CC:00:00:11/pop")
    assert r.status_code == 200


async def test_get_pop_installer(client, auth_user):
    _, admin_token = await auth_user("admin")
    _, inst_token = await auth_user("installer", email="installer@partner.com")

    client.cookies.set("auth_token", admin_token)
    await _create_device(client, "AA:BB:CC:00:00:12")

    client.cookies.set("auth_token", inst_token)
    r = await client.get("/api/devices/AA:BB:CC:00:00:12/pop")
    assert r.status_code == 200


async def test_get_pop_via_bearer_header(client, auth_user):
    _, admin_token = await auth_user("admin")
    _, inst_token = await auth_user("installer", email="installer2@partner.com")

    client.cookies.set("auth_token", admin_token)
    await _create_device(client, "AA:BB:CC:00:00:13")

    # Wipe cookie, use Authorization header instead — mobile-app path.
    client.cookies.clear()
    r = await client.get(
        "/api/devices/AA:BB:CC:00:00:13/pop",
        headers={"Authorization": f"Bearer {inst_token}"},
    )
    assert r.status_code == 200, r.text


async def test_get_pop_viewer_forbidden(client, auth_user):
    _, admin_token = await auth_user("admin")
    _, viewer_token = await auth_user("viewer", email="viewer@partner.com")

    client.cookies.set("auth_token", admin_token)
    await _create_device(client, "AA:BB:CC:00:00:14")

    client.cookies.set("auth_token", viewer_token)
    r = await client.get("/api/devices/AA:BB:CC:00:00:14/pop")
    assert r.status_code == 403


async def test_get_pop_unauthenticated(client):
    r = await client.get("/api/devices/AA:BB:CC:00:00:99/pop")
    assert r.status_code == 401


async def test_get_pop_unknown_mac_404(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    r = await client.get("/api/devices/FF:FF:FF:FF:FF:FF/pop")
    assert r.status_code == 404


async def test_get_pop_case_insensitive(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    created = await _create_device(client, "AA:BB:CC:00:00:20")

    r = await client.get("/api/devices/aa:bb:cc:00:00:20/pop")
    assert r.status_code == 200
    assert r.json()["pop"] == created["pop"]


async def test_get_pop_409_when_pop_missing(client, auth_user, integration_pool):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    # Create a charger then null out its PoP to simulate a legacy row.
    body = await _create_device(client, "AA:BB:CC:00:00:21")
    async with integration_pool.acquire() as conn:
        await conn.execute(
            "UPDATE inventory.devices SET pop = NULL WHERE mac_address = $1",
            body["mac_address"],
        )

    r = await client.get(f"/api/devices/{body['mac_address']}/pop")
    assert r.status_code == 409


async def test_rotate_pop_first_time_for_legacy_charger(client, auth_user, integration_pool):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    body = await _create_device(client, "AA:BB:CC:00:00:30")
    async with integration_pool.acquire() as conn:
        await conn.execute(
            "UPDATE inventory.devices SET pop = NULL, pop_generated_at = NULL WHERE mac_address = $1",
            body["mac_address"],
        )

    r = await client.post(f"/api/devices/{body['mac_address']}/pop")
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["rotated_from_existing"] is False
    assert data["pop"].startswith("mfp_")
    assert r.headers.get("cache-control") == "no-store"


async def test_rotate_pop_existing_returns_new_value(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    created = await _create_device(client, "AA:BB:CC:00:00:31")
    r = await client.post(f"/api/devices/{created['mac_address']}/pop")
    assert r.status_code == 201
    data = r.json()
    assert data["rotated_from_existing"] is True
    assert data["pop"] != created["pop"]


async def test_rotate_pop_non_admin_forbidden(client, auth_user):
    _, admin_token = await auth_user("admin")
    _, tech_token = await auth_user("technician", email="t@moonfive.tech")

    client.cookies.set("auth_token", admin_token)
    created = await _create_device(client, "AA:BB:CC:00:00:32")

    client.cookies.set("auth_token", tech_token)
    r = await client.post(f"/api/devices/{created['mac_address']}/pop")
    assert r.status_code == 403


async def test_rotate_pop_rejects_non_charger(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    created = await _create_device(client, "AA:BB:CC:00:00:33", "AEMS")
    r = await client.post(f"/api/devices/{created['mac_address']}/pop")
    assert r.status_code == 409


async def test_audit_log_records_pop_events_without_value(
    client, auth_user, integration_pool
):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    created = await _create_device(client, "AA:BB:CC:00:00:40")
    # Fetch + rotate to hit all three actions.
    await client.get(f"/api/devices/{created['mac_address']}/pop")
    await client.post(f"/api/devices/{created['mac_address']}/pop")

    async with integration_pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT action, old_value, new_value FROM inventory.audit_log
               WHERE action LIKE 'pop_%' ORDER BY created_at ASC"""
        )
    actions = [r["action"] for r in rows]
    assert actions == ["pop_generated", "pop_fetched", "pop_rotated"]
    # Crucial: the plaintext PoP must NEVER be in old_value or new_value.
    import json
    for r in rows:
        for field in (r["old_value"], r["new_value"]):
            if not field:
                continue
            blob = field if isinstance(field, str) else json.dumps(field)
            assert "mfp_" not in blob, f"PoP value leaked in {r['action']}: {blob}"


async def test_csv_export_omits_pop(client, auth_user):
    _, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    await _create_device(client, "AA:BB:CC:00:00:50")

    r = await client.get("/api/devices/export")
    assert r.status_code == 200
    csv_text = r.text
    assert "pop" not in csv_text.split("\n")[0].lower()
    assert "mfp_" not in csv_text
