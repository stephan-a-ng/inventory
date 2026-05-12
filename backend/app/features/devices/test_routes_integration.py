"""Integration tests for device routes — real asyncpg against inventory_test."""
import pytest


pytestmark = pytest.mark.integration


async def test_list_devices_requires_auth(client):
    """Unauthenticated requests get 401."""
    r = await client.get("/api/devices")
    assert r.status_code == 401


async def test_list_devices_empty(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    r = await client.get("/api/devices")
    assert r.status_code == 200
    body = r.json()
    assert body["devices"] == []
    assert body["total"] == 0


async def test_create_device_assigns_device_name_and_first_stage(client, auth_user, integration_pool):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    r = await client.post(
        "/api/devices",
        json={
            "mac_address": "AA:BB:CC:DD:EE:01",
            "product_type": "AEMS",
            "serial_number": "SN-001",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mac_address"] == "AA:BB:CC:DD:EE:01"
    # Auto-generated name format: AEMS-NNNN
    assert body["device_name"].startswith("AEMS-")
    # First stage for AEMS (Assembly) is auto-assigned by the service.
    # The POST response doesn't carry the joined stage name (that comes from GET);
    # but the foreign key should be populated.
    assert body["current_stage_id"] is not None


async def test_create_device_rejects_invalid_mac(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    r = await client.post(
        "/api/devices",
        json={"mac_address": "not-a-mac", "product_type": "AEMS"},
    )
    assert r.status_code == 422  # pydantic validation


async def test_create_device_dedup_returns_409(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    payload = {"mac_address": "AA:BB:CC:DD:EE:02", "product_type": "AEMS"}
    r1 = await client.post("/api/devices", json=payload)
    assert r1.status_code == 200
    r2 = await client.post("/api/devices", json=payload)
    assert r2.status_code == 409


async def test_create_device_forbids_viewer(client, auth_user):
    user, token = await auth_user("viewer")
    client.cookies.set("auth_token", token)

    r = await client.post(
        "/api/devices",
        json={"mac_address": "AA:BB:CC:DD:EE:03", "product_type": "AEMS"},
    )
    assert r.status_code == 403


async def test_update_writes_audit_row(client, auth_user, integration_pool):
    """Mutating a device must produce an audit_log entry attributed to the user."""
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    create = await client.post(
        "/api/devices",
        json={"mac_address": "AA:BB:CC:DD:EE:04", "product_type": "AEMS"},
    )
    device_id = create.json()["id"]

    upd = await client.patch(f"/api/devices/{device_id}", json={"notes": "swapped board"})
    assert upd.status_code == 200

    async with integration_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT action, user_id FROM inventory.audit_log WHERE device_id = $1",
            device_id,
        )
    # One row for create, one for update.
    assert {r["action"] for r in rows} == {"created", "updated"}
    assert all(r["user_id"] == user["id"] for r in rows)


async def test_bulk_import_imports_valid_rows_and_reports_errors(client, auth_user):
    user, token = await auth_user("technician")
    client.cookies.set("auth_token", token)

    csv = (
        b"mac_address,product_type\n"
        b"AA:BB:CC:DD:EE:10,AEMS\n"
        b"AA:BB:CC:DD:EE:11,BEMS\n"
        b"not-a-mac,AEMS\n"
    )
    r = await client.post(
        "/api/devices/bulk-import",
        files={"file": ("devices.csv", csv, "text/csv")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 2
    assert any("Invalid MAC" in e for e in body["errors"])


async def test_stats_returns_total_and_per_stage(client, auth_user):
    """/api/devices/stats rolls up devices by canonical stage name."""
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    # Empty fleet still returns one entry per stage with count=0.
    r0 = await client.get("/api/devices/stats")
    assert r0.status_code == 200
    body0 = r0.json()
    assert body0["total"] == 0
    names0 = [s["name"] for s in body0["by_stage_name"]]
    # The seeded canonical stages are present, ordered ascending.
    assert names0[:6] == ["Assembly", "Firmware", "Calibration", "QA", "Staging", "Deployed"]

    # Create three devices across two product types — they should land at stage 1 ("Assembly").
    for mac, pt in [
        ("AA:BB:CC:DD:EE:30", "AEMS"),
        ("AA:BB:CC:DD:EE:31", "BEMS"),
        ("AA:BB:CC:DD:EE:32", "EVSE"),
    ]:
        r = await client.post("/api/devices", json={"mac_address": mac, "product_type": pt})
        assert r.status_code == 200, r.text

    r1 = await client.get("/api/devices/stats")
    body1 = r1.json()
    assert body1["total"] == 3
    assembly = next(s for s in body1["by_stage_name"] if s["name"] == "Assembly")
    assert assembly["count"] == 3
    assert assembly["order"] == 1


async def test_lookup_by_mac_normalizes_case(client, auth_user):
    """GET /api/devices/lookup/{mac} returns the device regardless of case."""
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    await client.post(
        "/api/devices",
        json={"mac_address": "AA:BB:CC:DD:EE:40", "product_type": "AEMS"},
    )

    hit = await client.get("/api/devices/lookup/aa:bb:cc:dd:ee:40")
    assert hit.status_code == 200
    assert hit.json()["mac_address"] == "AA:BB:CC:DD:EE:40"

    miss = await client.get("/api/devices/lookup/AA:BB:CC:DD:EE:FF")
    assert miss.status_code == 404


async def test_recent_audit_returns_cross_device_entries(client, auth_user):
    """GET /api/audit returns the most recent N audit rows across all devices."""
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    # Empty audit log is fine.
    r0 = await client.get("/api/audit?limit=5")
    assert r0.status_code == 200
    assert r0.json() == []

    # Two devices → two 'created' audit rows.
    await client.post("/api/devices", json={"mac_address": "AA:BB:CC:DD:EE:50", "product_type": "AEMS"})
    await client.post("/api/devices", json={"mac_address": "AA:BB:CC:DD:EE:51", "product_type": "BEMS"})

    r1 = await client.get("/api/audit?limit=5")
    body = r1.json()
    assert len(body) == 2
    # Newest first.
    macs = [e["device_mac"] for e in body]
    assert macs == ["AA:BB:CC:DD:EE:51", "AA:BB:CC:DD:EE:50"]
    assert all(e["action"] == "created" for e in body)
    assert all(e["user_email"] == user["email"] for e in body)
    # limit clamps the result set.
    r2 = await client.get("/api/audit?limit=1")
    assert len(r2.json()) == 1


async def test_bulk_import_dedup_skips_existing(client, auth_user):
    user, token = await auth_user("technician")
    client.cookies.set("auth_token", token)

    # Seed one
    await client.post(
        "/api/devices",
        json={"mac_address": "AA:BB:CC:DD:EE:20", "product_type": "AEMS"},
    )
    # Now import a CSV containing the same MAC
    csv = b"mac_address,product_type\nAA:BB:CC:DD:EE:20,AEMS\n"
    r = await client.post(
        "/api/devices/bulk-import",
        files={"file": ("dup.csv", csv, "text/csv")},
    )
    body = r.json()
    assert body["imported"] == 0
    assert any("already exists" in e for e in body["errors"])
