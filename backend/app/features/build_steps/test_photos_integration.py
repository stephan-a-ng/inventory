"""Integration tests for the photo endpoints — exercises fake-gcs-server.

Skipped automatically when GCS isn't configured (e.g. CI without the
emulator). When `STORAGE_EMULATOR_HOST` is set, hits the real emulator and
asserts:
- multipart upload returns a signed URL
- the worker view includes signed URLs
- size and content-type validation reject bad payloads
"""
from __future__ import annotations

import io
import os

import pytest

# A 1×1 transparent PNG (smallest valid). Real magic bytes — passes sniff.
PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a"  # signature
    "0000000d49484452"  # IHDR
    "00000001000000010806000000"  # 1x1, RGBA
    "1f15c4890000000d49444154"  # IDAT
    "789c6300010000050001"
    "0d0a2db40000000049454e44ae426082"  # IEND
)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not os.getenv("STORAGE_EMULATOR_HOST"),
        reason="fake-gcs-server (STORAGE_EMULATOR_HOST) not configured",
    ),
]


@pytest.mark.asyncio
async def test_upload_reference_photo_round_trips(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)

    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()
    step = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "Test step",
    })).json()

    files = {"file": ("ref.png", PNG_1X1, "image/png")}
    r = await client.post(f"/api/build-steps/{step['id']}/reference-photo", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reference_photo_key"].startswith(f"build-steps/{step['id']}/reference.")
    assert body["reference_photo_url"] and "X-Goog-Signature" in body["reference_photo_url"]


@pytest.mark.asyncio
async def test_upload_rejects_oversize(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()
    step = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "X",
    })).json()
    # 5 MiB blob — should 413.
    blob = PNG_1X1 + b"\x00" * (5 * 1024 * 1024)
    files = {"file": ("huge.png", blob, "image/png")}
    r = await client.post(f"/api/build-steps/{step['id']}/reference-photo", files=files)
    assert r.status_code == 413


@pytest.mark.asyncio
async def test_upload_rejects_non_image(client, auth_user):
    user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2"})).json()
    step = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "X",
    })).json()
    files = {"file": ("notes.txt", b"hello", "image/jpeg")}  # lies about mime
    r = await client.post(f"/api/build-steps/{step['id']}/reference-photo", files=files)
    assert r.status_code == 415


@pytest.mark.asyncio
async def test_worker_photo_upload_lists_in_view(client, auth_user, clean_db):
    admin, admin_tok = await auth_user("admin")
    client.cookies.set("auth_token", admin_tok)
    rev = (await client.post("/api/product-revisions",
        json={"product_type": "EVSE", "label": "v2", "is_default": True})).json()
    step = (await client.post("/api/build-steps", json={
        "product_revision_id": rev["id"], "stage_key": "Assembly", "title": "S",
        "required_photo_count": 1,
    })).json()
    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            """INSERT INTO inventory.devices (mac_address, product_type, hardware_revision)
               VALUES ($1, $2, $3) RETURNING id""",
            "AA:BB:CC:DD:EE:99", "EVSE", "v2",
        )

    tech, tech_tok = await auth_user("technician")
    client.cookies.set("auth_token", tech_tok)
    r = await client.post(
        f"/api/devices/{device_id}/build-steps/{step['id']}/photos",
        files={"file": ("snap.png", PNG_1X1, "image/png")},
    )
    assert r.status_code == 200, r.text
    photo_id = r.json()["id"]
    assert r.json()["url"]

    view = (await client.get(f"/api/devices/{device_id}/stages/Assembly/build-steps")).json()
    assert len(view["steps"][0]["photos"]) == 1
    assert view["steps"][0]["photos"][0]["id"] == photo_id

    d = await client.delete(f"/api/devices/{device_id}/build-step-photos/{photo_id}")
    assert d.status_code == 200
