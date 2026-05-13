"""Integration tests for GET /api/devices/{id}/firmware-status.

Stubs FirmwareReleaseService.get_latest_tag so no real GitHub calls happen;
exercises the real DB + auth + serializer end-to-end.
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from app.features.devices import firmware_routes
from app.features.devices.firmware_release_service import FirmwareReleaseService

pytestmark = pytest.mark.integration


async def _make_device(clean_db, *, product_type: str, firmware: str | None = None,
                       deviation: str | None = None, mac: str = "AA:BB:CC:DD:EE:01") -> str:
    async with clean_db.acquire() as conn:
        return str(await conn.fetchval(
            """INSERT INTO inventory.devices
                   (mac_address, product_type, firmware_version, firmware_deviation_reason)
               VALUES ($1, $2, $3, $4)
               RETURNING id""",
            mac, product_type, firmware, deviation,
        ))


@pytest.fixture
def stub_latest(monkeypatch):
    """Replace get_latest_tag with a value the test controls."""
    def _set(value):
        async def fake(product_type):
            return value
        monkeypatch.setattr(FirmwareReleaseService, "get_latest_tag", classmethod(lambda cls, pt: fake(pt)))
    return _set


@pytest.mark.asyncio
async def test_firmware_status_match_is_latest_true(client, auth_user, clean_db, stub_latest):
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db, product_type="EVSE", firmware="v1.0.0")
    stub_latest("v1.0.0")

    r = await client.get(f"/api/devices/{device_id}/firmware-status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tracked"] is True
    assert body["repo"] == "moon-five-technologies/argo"
    assert body["current"] == "v1.0.0"
    assert body["latest"] == "v1.0.0"
    assert body["is_latest"] is True
    assert body["release_url"].endswith("/releases/tag/v1.0.0")


@pytest.mark.asyncio
async def test_firmware_status_normalizes_leading_v(client, auth_user, clean_db, stub_latest):
    """Device on '1.0.0' vs GitHub 'v1.0.0' → still considered a match."""
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db, product_type="BEMS", firmware="1.0.0")
    stub_latest("v1.0.0")

    body = (await client.get(f"/api/devices/{device_id}/firmware-status")).json()
    assert body["is_latest"] is True
    assert body["repo"] == "moon-five-technologies/OllieDriver"


@pytest.mark.asyncio
async def test_firmware_status_mismatch_returns_deviation_reason(client, auth_user, clean_db, stub_latest):
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(
        clean_db, product_type="EVSE", firmware="v0.4.0",
        deviation="Customer on v0.4.0 until Q3 audit",
    )
    stub_latest("v0.4.2")

    body = (await client.get(f"/api/devices/{device_id}/firmware-status")).json()
    assert body["tracked"] is True
    assert body["current"] == "v0.4.0"
    assert body["latest"] == "v0.4.2"
    assert body["is_latest"] is False
    assert body["deviation_reason"] == "Customer on v0.4.0 until Q3 audit"


@pytest.mark.asyncio
async def test_firmware_status_untracked_product_type(client, auth_user, clean_db, stub_latest):
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db, product_type="AEMS", firmware="v0.1.0")
    # Stub will never be called for untracked products; not setting one would
    # also be fine but we set None to be explicit.
    stub_latest(None)

    body = (await client.get(f"/api/devices/{device_id}/firmware-status")).json()
    assert body["tracked"] is False
    assert body["current"] == "v0.1.0"
    assert "repo" not in body
    assert "latest" not in body


@pytest.mark.asyncio
async def test_firmware_status_github_unreachable(client, auth_user, clean_db, stub_latest):
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db, product_type="EVSE", firmware="v1.0.0")
    stub_latest(None)

    body = (await client.get(f"/api/devices/{device_id}/firmware-status")).json()
    assert body["tracked"] is True
    assert body["latest"] is None
    assert body["is_latest"] is None
    assert body["release_url"] is None
    assert body["current"] == "v1.0.0"


@pytest.mark.asyncio
async def test_firmware_status_no_current_version(client, auth_user, clean_db, stub_latest):
    """Device with firmware_version=NULL — card on the frontend prompts to set one."""
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db, product_type="EVSE", firmware=None)
    stub_latest("v1.0.0")

    body = (await client.get(f"/api/devices/{device_id}/firmware-status")).json()
    assert body["tracked"] is True
    assert body["current"] is None
    assert body["latest"] == "v1.0.0"
    assert body["is_latest"] is None  # is_match returns None when current missing


@pytest.mark.asyncio
async def test_firmware_status_unknown_device_404(client, auth_user, clean_db):
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    r = await client.get(f"/api/devices/{uuid4()}/firmware-status")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_firmware_status_requires_auth(client, clean_db, stub_latest):
    device_id = await _make_device(clean_db, product_type="EVSE", firmware="v1.0.0")
    stub_latest("v1.0.0")
    # No auth cookie set on the client fixture.
    r = await client.get(f"/api/devices/{device_id}/firmware-status")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_firmware_deviation_reason_round_trips_via_patch(client, auth_user, clean_db, stub_latest):
    """Saving a deviation reason via PATCH /api/devices/{id} shows up in firmware-status."""
    _user, token = await auth_user("admin")
    client.cookies.set("auth_token", token)
    device_id = await _make_device(clean_db, product_type="EVSE", firmware="v1.0.0")
    stub_latest("v1.0.1")

    r = await client.patch(
        f"/api/devices/{device_id}",
        json={"firmware_deviation_reason": "Awaiting OTA window"},
    )
    assert r.status_code == 200, r.text
    body = (await client.get(f"/api/devices/{device_id}/firmware-status")).json()
    assert body["deviation_reason"] == "Awaiting OTA window"
