"""Integration tests for per-device user-attributed notes."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


async def _make_device(clean_db, mac="AA:BB:CC:DD:EE:F1") -> str:
    async with clean_db.acquire() as conn:
        return str(await conn.fetchval(
            "INSERT INTO inventory.devices (mac_address, product_type) VALUES ($1, $2) RETURNING id",
            mac, "EVSE",
        ))


@pytest.mark.asyncio
async def test_create_and_list_note_includes_author(client, auth_user, clean_db):
    user, token = await auth_user("technician", email="jade@moonfive.tech")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db)

    r = await client.post(f"/api/devices/{device_id}/notes", json={"body": "Wires landed and torqued."})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["body"] == "Wires landed and torqued."
    assert body["author"]["email"] == "jade@moonfive.tech"

    listed = (await client.get(f"/api/devices/{device_id}/notes")).json()
    assert len(listed) == 1
    assert listed[0]["author"]["email"] == "jade@moonfive.tech"


@pytest.mark.asyncio
async def test_notes_sorted_newest_first(client, auth_user, clean_db):
    user, token = await auth_user("technician")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db)

    bodies = ["first", "second", "third"]
    for b in bodies:
        await client.post(f"/api/devices/{device_id}/notes", json={"body": b})
    listed = (await client.get(f"/api/devices/{device_id}/notes")).json()
    assert [n["body"] for n in listed] == ["third", "second", "first"]


@pytest.mark.asyncio
async def test_viewer_cannot_create(client, auth_user, clean_db):
    user, token = await auth_user("viewer")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db)
    r = await client.post(f"/api/devices/{device_id}/notes", json={"body": "hi"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_author_can_edit_own_note(client, auth_user, clean_db):
    user, token = await auth_user("technician", email="a@moonfive.tech")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db)
    created = (await client.post(f"/api/devices/{device_id}/notes", json={"body": "v1"})).json()
    r = await client.patch(f"/api/device-notes/{created['id']}", json={"body": "v2"})
    assert r.status_code == 200
    assert r.json()["body"] == "v2"


@pytest.mark.asyncio
async def test_other_tech_cannot_edit_someones_note(client, auth_user, clean_db):
    jade, jade_tok = await auth_user("technician", email="jade@moonfive.tech")
    client.cookies.set("auth_token", jade_tok)
    device_id = await _make_device(clean_db)
    note = (await client.post(f"/api/devices/{device_id}/notes", json={"body": "Jade's note"})).json()

    sam, sam_tok = await auth_user("technician", email="sam@moonfive.tech")
    client.cookies.set("auth_token", sam_tok)
    r = await client.patch(f"/api/device-notes/{note['id']}", json={"body": "hacked"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_delete_anyones_note(client, auth_user, clean_db):
    jade, jade_tok = await auth_user("technician", email="jade@moonfive.tech")
    client.cookies.set("auth_token", jade_tok)
    device_id = await _make_device(clean_db)
    note = (await client.post(f"/api/devices/{device_id}/notes", json={"body": "x"})).json()

    admin, admin_tok = await auth_user("admin", email="admin@moonfive.tech")
    client.cookies.set("auth_token", admin_tok)
    r = await client.delete(f"/api/device-notes/{note['id']}")
    assert r.status_code == 200

    listed = (await client.get(f"/api/devices/{device_id}/notes")).json()
    assert listed == []


@pytest.mark.asyncio
async def test_empty_body_rejected(client, auth_user, clean_db):
    user, token = await auth_user("technician")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db)
    r = await client.post(f"/api/devices/{device_id}/notes", json={"body": ""})
    assert r.status_code == 422  # Pydantic min_length
