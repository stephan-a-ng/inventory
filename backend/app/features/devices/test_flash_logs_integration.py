"""Integration tests for the parsed-line flash-log subsystem.

No GCS stub anymore — log bodies live in `device_flash_logs.raw_bytes`
and the per-line projection lives in `device_flash_log_lines`. Tests
exercise the upload → parse → bulk-insert → query round trip.
"""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

import pytest

from app.features.auth.api_key_service import mint_api_key


pytestmark = pytest.mark.asyncio


SAMPLE_LOG = (
    b"=== watching /dev/cu.usbserial-10 for INVENTORY line (cap 120s) ===\n"
    b"I (667) atm90e32: Calibration applied\n"
    b"I (3435) INV: init self_role=mcu1 wifi_mac=fc:01:2c:ca:bd:88\n"
    b"W (5453) INV: no response within 2000 ms\n"
    b"E (7079) CableLock: Feedback timeout (expected unlocked)\n"
    b"load:0x3fce2820,len:0x14f0\n"
    b"I (9454) INV: INVENTORY: self {...}\n"
)


async def _make_device(client, auth_user) -> tuple[str, str, str]:
    user, jwt = await auth_user("admin")
    client.cookies.set("auth_token", jwt)
    create = await client.post(
        "/api/devices",
        json={"mac_address": "AA:BB:CC:00:01:01", "product_type": "EVSE"},
    )
    assert create.status_code == 200, create.text
    device_id = create.json()["id"]
    plaintext, _ = await mint_api_key(user_id=user["id"], name="flash-log-test")
    return device_id, plaintext, jwt


async def _upload(client, device_id, api_key, *, role="mcu1", body=SAMPLE_LOG):
    return await client.post(
        f"/api/devices/{device_id}/flash-logs",
        headers={"X-API-Key": api_key},
        files={"file": (f"{role}.log", io.BytesIO(body), "text/plain")},
        data={"mcu_role": role},
    )


# ---------------------------------------------------------------------------
# Upload + parsing
# ---------------------------------------------------------------------------


async def test_upload_creates_parent_and_lines(client, clean_db, pg_pool, auth_user):
    device_id, api_key, _ = await _make_device(client, auth_user)
    r = await _upload(client, device_id, api_key)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["device_id"] == device_id
    assert body["mcu_role"] == "mcu1"
    assert body["byte_size"] == len(SAMPLE_LOG)
    # 7 lines in SAMPLE_LOG (no trailing blank). Sanity-check we landed all of them.
    assert body["line_count"] == 7

    # Lines actually in the table.
    async with pg_pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM inventory.device_flash_log_lines WHERE flash_log_id = $1",
            body["id"],
        )
    assert count == 7


async def test_upload_persists_raw_bytes_on_parent(client, clean_db, pg_pool, auth_user):
    """`raw_bytes` is the escape hatch for re-parsing later if the line
    grammar evolves — make sure we're actually keeping it."""
    device_id, api_key, _ = await _make_device(client, auth_user)
    r = await _upload(client, device_id, api_key)
    log_id = r.json()["id"]
    async with pg_pool.acquire() as conn:
        raw = await conn.fetchval(
            "SELECT raw_bytes FROM inventory.device_flash_logs WHERE id = $1", log_id,
        )
    assert bytes(raw) == SAMPLE_LOG


async def test_upload_attributes_to_oauth_user(client, clean_db, pg_pool, auth_user):
    device_id, api_key, _ = await _make_device(client, auth_user)
    r = await _upload(client, device_id, api_key)
    assert r.status_code == 201
    assert r.json()["uploaded_by_email"]  # was the OAuth user behind the DB key


async def test_upload_rejects_unauthenticated(client, clean_db, auth_user):
    device_id, _, _ = await _make_device(client, auth_user)
    r = await client.post(
        f"/api/devices/{device_id}/flash-logs",
        files={"file": ("x.log", io.BytesIO(b"hi"), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 401


async def test_upload_rejects_empty(client, clean_db, auth_user):
    device_id, api_key, _ = await _make_device(client, auth_user)
    r = await _upload(client, device_id, api_key, body=b"")
    assert r.status_code == 400


async def test_upload_rejects_oversize(client, clean_db, auth_user):
    device_id, api_key, _ = await _make_device(client, auth_user)
    too_big = b"x" * (5 * 1024 * 1024 + 1)
    r = await _upload(client, device_id, api_key, body=too_big)
    assert r.status_code == 413


async def test_upload_404_for_missing_device(client, clean_db, auth_user):
    user, _ = await auth_user("admin")
    plaintext, _ = await mint_api_key(user_id=user["id"], name="t")
    r = await client.post(
        "/api/devices/00000000-0000-0000-0000-000000000000/flash-logs",
        headers={"X-API-Key": plaintext},
        files={"file": ("x.log", io.BytesIO(b"hello"), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Per-capture line listing (the per-MCU "View" modal will hit this)
# ---------------------------------------------------------------------------


async def test_list_lines_for_capture_returns_parsed_and_raw(
    client, clean_db, auth_user,
):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    upload = await _upload(client, device_id, api_key)
    log_id = upload.json()["id"]

    client.cookies.set("auth_token", jwt)
    r = await client.get(f"/api/devices/flash-logs/{log_id}/lines")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["capture"]["id"] == log_id
    lines = body["lines"]
    assert len(lines) == 7
    # Standard ESP_LOGx lines should be fully parsed.
    info_lines = [l for l in lines if l["level"] == "I"]
    assert any(l["tag"] == "atm90e32" for l in info_lines)
    # Framing marker is raw-only (level/tag/message all None, raw populated).
    framing = next(l for l in lines if l["raw"].startswith("==="))
    assert framing["level"] is None
    assert framing["tag"] is None
    # Bootloader line ("load:0x...") is also raw-only.
    bootloader = next(l for l in lines if l["raw"].startswith("load:"))
    assert bootloader["level"] is None


async def test_list_lines_paginates_via_after_cursor(client, clean_db, auth_user):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    upload = await _upload(client, device_id, api_key)
    log_id = upload.json()["id"]

    client.cookies.set("auth_token", jwt)
    # First page of 3 lines, then the rest.
    r1 = await client.get(f"/api/devices/flash-logs/{log_id}/lines?limit=3")
    assert r1.status_code == 200
    page1 = r1.json()["lines"]
    assert len(page1) == 3
    assert [l["line_no"] for l in page1] == [1, 2, 3]

    r2 = await client.get(
        f"/api/devices/flash-logs/{log_id}/lines?after=3&limit=10"
    )
    page2 = r2.json()["lines"]
    assert [l["line_no"] for l in page2] == [4, 5, 6, 7]


async def test_list_lines_requires_auth(client, clean_db, auth_user):
    device_id, api_key, _ = await _make_device(client, auth_user)
    upload = await _upload(client, device_id, api_key)
    log_id = upload.json()["id"]
    client.cookies.clear()
    r = await client.get(f"/api/devices/flash-logs/{log_id}/lines")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Capture listing on the device (sized for DeviceInfoModal's "Flash history")
# ---------------------------------------------------------------------------


async def test_list_captures_newest_first(client, clean_db, auth_user):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    for role in ("mcu1", "mcu2", "mcu1"):
        r = await _upload(client, device_id, api_key, role=role)
        assert r.status_code == 201

    client.cookies.set("auth_token", jwt)
    r = await client.get(f"/api/devices/{device_id}/flash-logs")
    assert r.status_code == 200
    body = r.json()
    assert len(body["logs"]) == 3
    captured_at_values = [l["captured_at"] for l in body["logs"]]
    # Strictly newest-first.
    assert captured_at_values == sorted(captured_at_values, reverse=True)


# ---------------------------------------------------------------------------
# Cross-cutting search (the real point of the rewrite)
# ---------------------------------------------------------------------------


async def test_search_by_tag(client, clean_db, auth_user):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    await _upload(client, device_id, api_key)
    client.cookies.set("auth_token", jwt)

    r = await client.get("/api/flash-log-lines?tag=atm90e32")
    assert r.status_code == 200
    lines = r.json()["lines"]
    assert lines
    assert all(l["tag"] == "atm90e32" for l in lines)


async def test_search_by_level_error(client, clean_db, auth_user):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    await _upload(client, device_id, api_key)
    client.cookies.set("auth_token", jwt)

    r = await client.get("/api/flash-log-lines?level=E")
    assert r.status_code == 200
    lines = r.json()["lines"]
    assert lines
    assert all(l["level"] == "E" for l in lines)
    assert any(l["tag"] == "CableLock" for l in lines)


async def test_search_message_substring(client, clean_db, auth_user):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    await _upload(client, device_id, api_key)
    client.cookies.set("auth_token", jwt)

    r = await client.get("/api/flash-log-lines?q=Feedback")
    assert r.status_code == 200
    lines = r.json()["lines"]
    assert lines and any("Feedback timeout" in (l["message"] or "") for l in lines)


async def test_search_combines_filters(client, clean_db, auth_user):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    await _upload(client, device_id, api_key)
    client.cookies.set("auth_token", jwt)

    # tag=INV intersected with level=W should yield just the warn line.
    r = await client.get("/api/flash-log-lines?tag=INV&level=W")
    assert r.status_code == 200
    lines = r.json()["lines"]
    assert len(lines) == 1
    assert lines[0]["message"] == "no response within 2000 ms"


async def test_search_scoped_to_device(client, clean_db, pg_pool, auth_user):
    """Two devices, one of them logs gfi_monitor — searching by device_id
    must not bleed in lines from the other."""
    device_id, api_key, jwt = await _make_device(client, auth_user)
    # Make a second device and a second capture
    user, _ = await auth_user("admin")
    client.cookies.set("auth_token", jwt)
    second = await client.post(
        "/api/devices",
        json={"mac_address": "AA:BB:CC:00:02:02", "product_type": "EVSE"},
    )
    assert second.status_code == 200, second.text
    second_id = second.json()["id"]
    other_key, _ = await mint_api_key(user_id=user["id"], name="second")
    await _upload(client, second_id, other_key, body=b"I (1) gfi_monitor: trip\n")

    # Original device gets the standard sample (which has no gfi_monitor lines).
    await _upload(client, device_id, api_key)

    # Cross-device search returns one row total.
    r = await client.get("/api/flash-log-lines?tag=gfi_monitor")
    assert len(r.json()["lines"]) == 1

    # Scoping to the original device returns zero rows.
    r2 = await client.get(
        f"/api/flash-log-lines?tag=gfi_monitor&device_id={device_id}"
    )
    assert r2.json()["lines"] == []


async def test_search_since_filter(client, clean_db, auth_user):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    await _upload(client, device_id, api_key)
    client.cookies.set("auth_token", jwt)

    # Far-future cutoff: zero rows. params= avoids URL-encoding the `+`
    # in tz offsets, which trips parse_datetime as a literal space.
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = await client.get("/api/flash-log-lines", params={"since": future})
    assert r.status_code == 200, r.text
    assert r.json()["lines"] == []

    # Recent past cutoff: all rows.
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    r2 = await client.get("/api/flash-log-lines", params={"since": past})
    assert r2.status_code == 200, r2.text
    assert len(r2.json()["lines"]) == 7
