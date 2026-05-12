"""Integration tests for the build-steps slice.

Exercises the full request -> Postgres -> response path against the
inventory_test database. Each test gets a clean DB (see conftest.clean_db).
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


# ── helpers ──────────────────────────────────────────────────────────────────
async def _make_revision(client, label: str = "v2", is_default: bool = True) -> dict:
    return (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": label, "is_default": is_default})).json()


async def _make_set(client, revision_id: str, stage_key: str = "Assembly",
                    label: str = "v1", is_active: bool = True) -> dict:
    r = await client.post("/api/instruction-sets", json={
        "product_revision_id": revision_id, "stage_key": stage_key,
        "label": label, "is_active": is_active,
    })
    assert r.status_code == 200, r.text
    return r.json()


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


# ── instruction sets ─────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_set_and_activate(client, auth_user):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    v1 = await _make_set(client, rev["id"], label="v1", is_active=True)
    v2 = await _make_set(client, rev["id"], label="v2", is_active=False)

    listed = (await client.get(
        f"/api/instruction-sets?product_revision_id={rev['id']}&stage_key=Assembly"
    )).json()
    assert {s["label"] for s in listed} == {"v1", "v2"}
    actives = [s for s in listed if s["is_active"]]
    assert [s["label"] for s in actives] == ["v1"]

    r = await client.post(f"/api/instruction-sets/{v2['id']}/activate")
    assert r.status_code == 200
    refreshed = (await client.get(
        f"/api/instruction-sets?product_revision_id={rev['id']}&stage_key=Assembly"
    )).json()
    actives = [s for s in refreshed if s["is_active"]]
    assert len(actives) == 1
    assert actives[0]["id"] == v2["id"]


@pytest.mark.asyncio
async def test_clone_set_copies_steps_and_sub_steps(client, auth_user):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    v1 = await _make_set(client, rev["id"], label="v1", is_active=True)
    step = (await client.post("/api/build-steps", json={
        "instruction_set_id": v1["id"], "title": "Land wires",
    })).json()
    sub1 = (await client.post(f"/api/build-steps/{step['id']}/sub-steps",
        json={"title": "L1", "description": "Black wire."})).json()
    sub2 = (await client.post(f"/api/build-steps/{step['id']}/sub-steps",
        json={"title": "L2"})).json()

    cloned = (await client.post(f"/api/instruction-sets/{v1['id']}/clone",
        json={"label": "v2", "activate": True})).json()
    assert cloned["label"] == "v2"
    assert cloned["is_active"] is True

    # Source set steps untouched.
    src_steps = (await client.get(
        f"/api/build-steps?instruction_set_id={v1['id']}"
    )).json()
    assert len(src_steps) == 1

    # Cloned set has its own step rows (different ids) with same content.
    new_steps = (await client.get(
        f"/api/build-steps?instruction_set_id={cloned['id']}"
    )).json()
    assert len(new_steps) == 1
    assert new_steps[0]["title"] == "Land wires"
    assert new_steps[0]["id"] != step["id"]

    new_subs = (await client.get(
        f"/api/build-steps/{new_steps[0]['id']}/sub-steps"
    )).json()
    assert [s["title"] for s in new_subs] == ["L1", "L2"]
    assert new_subs[0]["description"] == "Black wire."


# ── build steps ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_and_list_steps(client, auth_user):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    s = await _make_set(client, rev["id"])

    s1 = (await client.post("/api/build-steps", json={
        "instruction_set_id": s["id"], "title": "Unbox parts",
        "description": "Verify carton against BOM", "required_photo_count": 0,
    })).json()
    s2 = (await client.post("/api/build-steps", json={
        "instruction_set_id": s["id"], "title": "Mount enclosure",
        "required_photo_count": 1,
    })).json()

    listed = (await client.get(f"/api/build-steps?instruction_set_id={s['id']}")).json()
    assert [r["title"] for r in listed] == ["Unbox parts", "Mount enclosure"]
    assert listed[0]["sort_order"] == 0
    assert listed[1]["required_photo_count"] == 1


@pytest.mark.asyncio
async def test_patch_step_autosave_payload(client, auth_user):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    s = await _make_set(client, rev["id"], stage_key="Firmware")
    step = (await client.post("/api/build-steps", json={
        "instruction_set_id": s["id"], "title": "Flash",
    })).json()

    r = await client.patch(f"/api/build-steps/{step['id']}",
        json={"title": "Flash bootloader", "required_photo_count": 2})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Flash bootloader"
    assert body["required_photo_count"] == 2


@pytest.mark.asyncio
async def test_reorder_steps(client, auth_user):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    s = await _make_set(client, rev["id"])
    ids = []
    for title in ("A", "B", "C"):
        row = (await client.post("/api/build-steps", json={
            "instruction_set_id": s["id"], "title": title,
        })).json()
        ids.append(row["id"])

    r = await client.post("/api/build-steps/reorder", json={"ids": list(reversed(ids))})
    assert r.status_code == 200
    assert r.json()["reordered"] == 3

    listed = (await client.get(f"/api/build-steps?instruction_set_id={s['id']}")).json()
    assert [row["title"] for row in listed] == ["C", "B", "A"]


@pytest.mark.asyncio
async def test_delete_step_cascades_status(client, auth_user, clean_db):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)

    rev = await _make_revision(client)
    s = await _make_set(client, rev["id"])
    step = (await client.post("/api/build-steps", json={
        "instruction_set_id": s["id"], "title": "X",
    })).json()

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


# ── sub-steps ────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_sub_step_crud(client, auth_user):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    s = await _make_set(client, rev["id"])
    step = (await client.post("/api/build-steps", json={
        "instruction_set_id": s["id"], "title": "Wire AC",
    })).json()

    sub = (await client.post(f"/api/build-steps/{step['id']}/sub-steps",
        json={"title": "Land L1", "description": "Black wire."})).json()
    assert sub["title"] == "Land L1"
    assert sub["description"] == "Black wire."

    listed = (await client.get(f"/api/build-steps/{step['id']}/sub-steps")).json()
    assert len(listed) == 1

    upd = (await client.patch(f"/api/build-sub-steps/{sub['id']}",
        json={"description": "Black wire, 3.5 N·m"})).json()
    assert upd["description"] == "Black wire, 3.5 N·m"

    d = await client.delete(f"/api/build-sub-steps/{sub['id']}")
    assert d.status_code == 200
    assert (await client.get(f"/api/build-steps/{step['id']}/sub-steps")).json() == []


# ── worker view ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_worker_view_uses_active_set(client, auth_user, clean_db):
    admin, admin_tok = await auth_user("admin"); client.cookies.set("auth_token", admin_tok)
    rev = await _make_revision(client)
    s_active = await _make_set(client, rev["id"], label="v1", is_active=True)
    s1 = (await client.post("/api/build-steps", json={
        "instruction_set_id": s_active["id"], "title": "Step one",
    })).json()
    s2 = (await client.post("/api/build-steps", json={
        "instruction_set_id": s_active["id"], "title": "Step two", "required_photo_count": 1,
    })).json()

    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:02", "EVSE", "v2",
        )

    body = (await client.get(f"/api/devices/{device_id}/stages/Assembly/build-steps")).json()
    assert body["instruction_set"]["id"] == s_active["id"]
    assert [s["step"]["title"] for s in body["steps"]] == ["Step one", "Step two"]


@pytest.mark.asyncio
async def test_worker_view_pins_to_started_set_after_activation(client, auth_user, clean_db):
    """Once a device has progress on a set, activating a new set must not
    swap the worker's view out from under them."""
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    v1 = await _make_set(client, rev["id"], label="v1", is_active=True)
    step_v1 = (await client.post("/api/build-steps", json={
        "instruction_set_id": v1["id"], "title": "Step v1",
    })).json()

    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:03", "EVSE", "v2",
        )

    # Device touches v1 → pinned.
    await client.post(f"/api/devices/{device_id}/build-steps/{step_v1['id']}/toggle",
        json={"checked": True})

    # Admin clones to v2 and activates.
    v2 = (await client.post(f"/api/instruction-sets/{v1['id']}/clone",
        json={"label": "v2", "activate": True})).json()

    body = (await client.get(f"/api/devices/{device_id}/stages/Assembly/build-steps")).json()
    # Even though v2 is now active, the device stays on v1 because it's
    # already started progress there.
    assert body["instruction_set"]["id"] == v1["id"]
    assert body["instruction_set"]["label"] == "v1"


@pytest.mark.asyncio
async def test_worker_view_returns_sub_steps_under_each_step(client, auth_user, clean_db):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    s = await _make_set(client, rev["id"])
    step = (await client.post("/api/build-steps", json={
        "instruction_set_id": s["id"], "title": "Wire AC",
    })).json()
    await client.post(f"/api/build-steps/{step['id']}/sub-steps",
        json={"title": "Land L1", "description": "Black wire."})
    await client.post(f"/api/build-steps/{step['id']}/sub-steps",
        json={"title": "Torque", "description": "3.5 N·m."})

    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:04", "EVSE", "v2",
        )

    body = (await client.get(f"/api/devices/{device_id}/stages/Assembly/build-steps")).json()
    assert [sub["title"] for sub in body["steps"][0]["sub_steps"]] == ["Land L1", "Torque"]


@pytest.mark.asyncio
async def test_toggle_writes_audit_log(client, auth_user, clean_db):
    _, tok = await auth_user("admin"); client.cookies.set("auth_token", tok)
    rev = await _make_revision(client)
    s = await _make_set(client, rev["id"])
    step = (await client.post("/api/build-steps", json={
        "instruction_set_id": s["id"], "title": "S",
    })).json()
    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:05", "EVSE", "v2",
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
