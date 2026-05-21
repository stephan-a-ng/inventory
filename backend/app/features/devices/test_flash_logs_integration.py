"""Integration tests for flash-log upload + retrieval.

The GCS layer is monkey-patched here — we don't need a real bucket to
exercise the route logic; we just need is_enabled() to return True and
put_object()/signed_url() to be cheap no-ops.
"""
from __future__ import annotations

import io
import pytest

from app.features.auth.api_key_service import mint_api_key
from app.shared import photo_storage


pytestmark = pytest.mark.asyncio


@pytest.fixture
def gcs_stub(monkeypatch):
    """Stand in for photo_storage so tests don't touch a real bucket."""
    uploaded = {}

    def fake_is_enabled():
        return True

    def fake_put(key, data, content_type):
        uploaded[key] = (bytes(data), content_type)

    def fake_signed_url(key, **kwargs):
        return f"https://gcs.stub/{key}"

    monkeypatch.setattr(photo_storage, "is_enabled", fake_is_enabled)
    monkeypatch.setattr(photo_storage, "put_object", fake_put)
    monkeypatch.setattr(photo_storage, "signed_url", fake_signed_url)
    return uploaded


async def _make_device(client, auth_user) -> tuple[str, str, str]:
    """Helper: create a device + return (device_id, plaintext_api_key, jwt)."""
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


# ---------------------------------------------------------------------------
# Upload (API key auth)
# ---------------------------------------------------------------------------


async def test_upload_persists_metadata_and_calls_gcs(client, clean_db, auth_user, gcs_stub):
    device_id, api_key, _ = await _make_device(client, auth_user)

    payload = b"I (1234) boot: ESP-IDF v6.0.1-1\nI (2345) main: hello world\n"
    r = await client.post(
        f"/api/devices/{device_id}/flash-logs",
        headers={"X-API-Key": api_key},
        files={"file": ("mcu1.log", io.BytesIO(payload), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["device_id"] == device_id
    assert body["mcu_role"] == "mcu1"
    assert body["byte_size"] == len(payload)
    assert body["uploaded_by_email"]  # the OAuth user behind the key

    # Exactly one upload went to GCS and the bytes match what we sent.
    assert len(gcs_stub) == 1
    key, (stored, ctype) = next(iter(gcs_stub.items()))
    assert key.startswith(f"flash-logs/{device_id}/mcu1-")
    assert key.endswith(".log")
    assert stored == payload
    assert ctype.startswith("text/plain")


async def test_upload_rejects_unauthenticated(client, clean_db, auth_user, gcs_stub):
    device_id, _, _ = await _make_device(client, auth_user)
    r = await client.post(
        f"/api/devices/{device_id}/flash-logs",
        files={"file": ("x.log", io.BytesIO(b"hi"), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 401


async def test_upload_rejects_empty_payload(client, clean_db, auth_user, gcs_stub):
    device_id, api_key, _ = await _make_device(client, auth_user)
    r = await client.post(
        f"/api/devices/{device_id}/flash-logs",
        headers={"X-API-Key": api_key},
        files={"file": ("x.log", io.BytesIO(b""), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 400


async def test_upload_rejects_oversize_payload(client, clean_db, auth_user, gcs_stub):
    device_id, api_key, _ = await _make_device(client, auth_user)
    too_big = b"x" * (5 * 1024 * 1024 + 1)
    r = await client.post(
        f"/api/devices/{device_id}/flash-logs",
        headers={"X-API-Key": api_key},
        files={"file": ("x.log", io.BytesIO(too_big), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 413


async def test_upload_503_when_gcs_disabled(client, clean_db, auth_user, monkeypatch):
    device_id, api_key, _ = await _make_device(client, auth_user)
    monkeypatch.setattr(photo_storage, "is_enabled", lambda: False)
    r = await client.post(
        f"/api/devices/{device_id}/flash-logs",
        headers={"X-API-Key": api_key},
        files={"file": ("x.log", io.BytesIO(b"hello"), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 503
    assert "GCS_BUCKET" in r.json()["detail"]


async def test_upload_404_when_device_missing(client, clean_db, auth_user, gcs_stub):
    user, _ = await auth_user("admin")
    plaintext, _ = await mint_api_key(user_id=user["id"], name="t")
    r = await client.post(
        "/api/devices/00000000-0000-0000-0000-000000000000/flash-logs",
        headers={"X-API-Key": plaintext},
        files={"file": ("x.log", io.BytesIO(b"hi"), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# List + download (JWT auth)
# ---------------------------------------------------------------------------


async def test_list_returns_uploads_newest_first(client, clean_db, auth_user, gcs_stub):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    for role, body in [
        ("mcu1", b"first capture"),
        ("mcu2", b"second capture"),
        ("mcu1", b"reflash of mcu1"),
    ]:
        r = await client.post(
            f"/api/devices/{device_id}/flash-logs",
            headers={"X-API-Key": api_key},
            files={"file": (f"{role}.log", io.BytesIO(body), "text/plain")},
            data={"mcu_role": role},
        )
        assert r.status_code == 201, r.text

    client.cookies.set("auth_token", jwt)
    r = await client.get(f"/api/devices/{device_id}/flash-logs")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["logs"]) == 3
    # Newest-first ordering: the latest mcu1 reflash should come back first.
    assert body["logs"][0]["mcu_role"] == "mcu1"
    assert body["logs"][0]["byte_size"] == len(b"reflash of mcu1")


async def test_list_requires_auth(client, clean_db, auth_user, gcs_stub):
    device_id, _, _ = await _make_device(client, auth_user)
    client.cookies.clear()
    r = await client.get(f"/api/devices/{device_id}/flash-logs")
    assert r.status_code == 401


async def test_get_returns_signed_download_url(client, clean_db, auth_user, gcs_stub):
    device_id, api_key, jwt = await _make_device(client, auth_user)
    upload = await client.post(
        f"/api/devices/{device_id}/flash-logs",
        headers={"X-API-Key": api_key},
        files={"file": ("mcu1.log", io.BytesIO(b"boot log here"), "text/plain")},
        data={"mcu_role": "mcu1"},
    )
    log_id = upload.json()["id"]

    client.cookies.set("auth_token", jwt)
    r = await client.get(f"/api/devices/flash-logs/{log_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == log_id
    assert body["download_url"].startswith("https://gcs.stub/")
    assert f"flash-logs/{device_id}/mcu1-" in body["download_url"]
