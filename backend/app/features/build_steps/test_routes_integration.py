"""Integration tests for the build-steps slice.

Exercises the full request -> Postgres -> response path against the
inventory_test database. Each test gets a clean DB (see conftest.clean_db).
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


# ── product revisions ────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_list_revisions_empty_after_truncate(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    r = await client.get("/api/product-revisions?product_type=EVSE")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_and_list_revision(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    r = await client.post(
        "/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2", "notes": "first cut", "is_default": True},
    )
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["label"] == "v2"
    assert created["is_default"] is True

    listed = await client.get("/api/product-revisions?product_type=EVSE")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["id"] == created["id"]


@pytest.mark.asyncio
async def test_revision_label_unique_per_product(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    r1 = await client.post("/api/product-revisions", json={"product_type": "EVSE", "label": "v2"})
    assert r1.status_code == 200
    r2 = await client.post("/api/product-revisions", json={"product_type": "EVSE", "label": "v2"})
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_set_default_clears_previous(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    a = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v1", "is_default": True})).json()
    b = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2", "is_default": False})).json()

    r = await client.post(f"/api/product-revisions/{b['id']}/set-default")
    assert r.status_code == 200
    assert r.json()["is_default"] is True

    rows = (await client.get("/api/product-revisions?product_type=EVSE")).json()
    defaults = [row for row in rows if row["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == b["id"]


@pytest.mark.asyncio
async def test_non_admin_cannot_create_revision(client, auth_user):
    user, token = await auth_user("technician")
    client.cookies.set("auth_token", token)
    r = await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})
    assert r.status_code == 403


# ── firmware versions ────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_firmware_under_revision(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()

    r = await client.post(f"/api/product-revisions/{rev['id']}/firmware-versions",
        json={"version": "2.4.1", "is_standard": True})
    assert r.status_code == 200, r.text
    assert r.json()["is_standard"] is True

    listed = (await client.get(f"/api/product-revisions/{rev['id']}/firmware-versions")).json()
    assert len(listed) == 1
    assert listed[0]["version"] == "2.4.1"


@pytest.mark.asyncio
async def test_set_firmware_standard_clears_previous(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()
    a = (await client.post(f"/api/product-revisions/{rev['id']}/firmware-versions",
        json={"version": "2.4.0", "is_standard": True})).json()
    b = (await client.post(f"/api/product-revisions/{rev['id']}/firmware-versions",
        json={"version": "2.4.1"})).json()

    r = await client.post(f"/api/firmware-versions/{b['id']}/set-standard")
    assert r.status_code == 200
    assert r.json()["is_standard"] is True

    listed = (await client.get(f"/api/product-revisions/{rev['id']}/firmware-versions")).json()
    standards = [f for f in listed if f["is_standard"]]
    assert len(standards) == 1
    assert standards[0]["id"] == b["id"]


# ── build steps ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_and_list_steps(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()

    s1 = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"],
        "stage_key": "Assembly",
        "title": "Unbox parts",
        "description": "Verify carton against BOM",
        "required_photo_count": 0,
    })).json()
    s2 = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"],
        "stage_key": "Assembly",
        "title": "Mount enclosure",
        "required_photo_count": 1,
    })).json()

    listed = (await client.get(
        f"/api/build-steps?product_revision_id={rev['id']}&stage_key=Assembly"
    )).json()
    assert [s["title"] for s in listed] == ["Unbox parts", "Mount enclosure"]
    assert listed[0]["sort_order"] == 0
    assert listed[1]["sort_order"] == 1
    assert listed[1]["required_photo_count"] == 1


@pytest.mark.asyncio
async def test_patch_step_autosave_payload(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()
    step = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Firmware", "title": "Flash",
    })).json()

    r = await client.patch(f"/api/build-steps/{step['id']}",
        json={"title": "Flash bootloader", "required_photo_count": 2})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Flash bootloader"
    assert body["required_photo_count"] == 2


@pytest.mark.asyncio
async def test_reorder_steps(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()
    ids = []
    for title in ("A", "B", "C"):
        s = (await client.post("/api/build-steps", json={
            "product_revision_id": rev["id"], "stage_key": "Assembly", "title": title,
        })).json()
        ids.append(s["id"])

    # Reverse order
    r = await client.post("/api/build-steps/reorder", json={"ids": list(reversed(ids))})
    assert r.status_code == 200
    assert r.json()["reordered"] == 3

    listed = (await client.get(
        f"/api/build-steps?product_revision_id={rev['id']}&stage_key=Assembly"
    )).json()
    assert [s["title"] for s in listed] == ["C", "B", "A"]


@pytest.mark.asyncio
async def test_delete_step_cascades_status(client, auth_user, clean_db):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2", "is_default": True})).json()
    step = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "X",
    })).json()

    # Create a device + toggle status, so we have a row to cascade away.
    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:01", "EVSE", "v2",
        )
    await client.post(f"/api/devices/{device_id}/build-steps/{step['id']}/toggle",
        json={"checked": True})

    async with clean_db.acquire() as conn:
        before = await conn.fetchval(
            "SELECT COUNT(*) FROM inventory.device_build_step_status WHERE build_step_id = $1",
            step["id"],
        )
        assert before == 1

    r = await client.delete(f"/api/build-steps/{step['id']}")
    assert r.status_code == 200

    async with clean_db.acquire() as conn:
        after = await conn.fetchval(
            "SELECT COUNT(*) FROM inventory.device_build_step_status WHERE build_step_id = $1",
            step["id"],
        )
        assert after == 0


# ── worker view ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_worker_view_resolves_revision_and_merges_status(client, auth_user, clean_db):
    user, token = await auth_user("technician")
    client.cookies.set("auth_token", token)

    # Admin creates a revision + steps. Switch tokens for that.
    admin, admin_tok = await auth_user("admin")
    client.cookies.set("auth_token", admin_tok)
    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2", "is_default": True})).json()
    s1 = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "Step one",
    })).json()
    s2 = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "Step two",
        "required_photo_count": 1,
    })).json()

    # Create a device tagged hardware_revision='v2' so it resolves to our rev.
    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:02", "EVSE", "v2",
        )

    # Technician toggles step 1.
    client.cookies.set("auth_token", token)
    await client.post(f"/api/devices/{device_id}/build-steps/{s1['id']}/toggle",
        json={"checked": True})

    body = (await client.get(f"/api/devices/{device_id}/stages/Assembly/build-steps")).json()
    assert body["revision"]["id"] == rev["id"]
    assert len(body["steps"]) == 2
    assert body["steps"][0]["step"]["title"] == "Step one"
    assert body["steps"][0]["status"]["checked"] is True
    assert body["steps"][1]["status"]["checked"] is False


@pytest.mark.asyncio
async def test_worker_view_falls_back_to_default_revision(client, auth_user, clean_db):
    admin, admin_tok = await auth_user("admin")
    client.cookies.set("auth_token", admin_tok)
    # Two revisions for EVSE — only v1 marked default. Device has hardware_revision='unknown'.
    await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v1", "is_default": True})
    rev2 = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2", "is_default": False})).json()
    # Step on v2 only, just to confirm v1 (default) gets resolved and returns []
    await client.post("/api/build-steps", json={
        "product_revision_id": rev2["id"], "stage_key": "Assembly", "title": "v2-only",
    })

    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:03", "EVSE", "unknown",
        )

    body = (await client.get(f"/api/devices/{device_id}/stages/Assembly/build-steps")).json()
    assert body["revision"]["label"] == "v1"
    assert body["steps"] == []


@pytest.mark.asyncio
async def test_toggle_writes_audit_log(client, auth_user, clean_db):
    admin, admin_tok = await auth_user("admin")
    client.cookies.set("auth_token", admin_tok)
    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2", "is_default": True})).json()
    step = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "S",
    })).json()
    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:04", "EVSE", "v2",
        )

    r = await client.post(f"/api/devices/{device_id}/build-steps/{step['id']}/toggle",
        json={"checked": True})
    assert r.status_code == 200

    async with clean_db.acquire() as conn:
        log = await conn.fetchrow(
            "SELECT action, new_value FROM inventory.audit_log WHERE device_id = $1",
            device_id,
        )
    assert log is not None
    assert log["action"] == "build_step_toggled"
