"""Integration tests for POST /api/devices/provision.

Mirrors the pattern in test_pop_routes_integration.py — real Postgres via
the `client` + `clean_db` fixtures, exercises the full request → DB →
response path.
"""
from __future__ import annotations

import os

import pytest


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


API_KEY = "test-inventory-api-key-do-not-use-in-prod"


def _set_api_key(monkeypatch) -> None:
    monkeypatch.setenv("INVENTORY_API_KEY", API_KEY)


def _full_mcu(role: str, mac: str, *, app_version: str = "v0.0.1") -> dict:
    """Build a provision-request MCU entry populated like the firmware would."""
    return {
        "role": role,
        "wifi_sta_mac": mac,
        "bt_mac": mac.replace(":18", ":1a"),
        "chip_type": "ESP32-S3",
        "chip_revision": 2,
        "flash_chip_id": 0xC84016,
        "flash_size": 16 * 1024 * 1024,
        "flash_mode": "dio",
        "flash_freq_mhz": 80,
        "psram_size": 0,
        "psram_type": "NONE",
        "secure_boot_enabled": False,
        "flash_encryption_enabled": False,
        "active_partition": "factory",
        "project_name": "evse_" + role,
        "app_version": app_version,
        "elf_sha256": "0" * 64,
        "idf_version": "v6.0.1",
        "compile_date": "Jan 15 2026",
        "compile_time": "12:34:56",
        "reset_reason": 1,
        "initial_heap_free": 200000,
        "initial_largest_free_block": 100000,
    }


async def _provision(client, payload: dict, *, key: str = API_KEY):
    return await client.post(
        "/api/devices/provision",
        json=payload,
        headers={"X-API-Key": key},
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


async def test_provision_requires_api_key(client, clean_db, monkeypatch):
    _set_api_key(monkeypatch)
    r = await client.post(
        "/api/devices/provision",
        json={"product_type": "EVSE", "mcus": [_full_mcu("mcu1", "AA:BB:CC:00:00:01")]},
    )
    assert r.status_code == 401


async def test_provision_rejects_wrong_api_key(client, clean_db, monkeypatch):
    _set_api_key(monkeypatch)
    r = await client.post(
        "/api/devices/provision",
        json={"product_type": "EVSE", "mcus": [_full_mcu("mcu1", "AA:BB:CC:00:00:01")]},
        headers={"X-API-Key": "wrong"},
    )
    assert r.status_code == 401


async def test_provision_401_when_env_var_unset_and_key_unknown(client, clean_db, monkeypatch):
    """With no INVENTORY_API_KEY env var and a key that doesn't match any
    DB row, the request is unauthenticated (401), not "server misconfigured"
    (503). DB-backed keys remain the canonical path."""
    monkeypatch.delenv("INVENTORY_API_KEY", raising=False)
    r = await client.post(
        "/api/devices/provision",
        json={"product_type": "EVSE", "mcus": [_full_mcu("mcu1", "AA:BB:CC:00:00:01")]},
        headers={"X-API-Key": "mfk_definitely-not-in-the-db"},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Create path
# ---------------------------------------------------------------------------


async def test_provision_creates_device_and_returns_pop_on_first_call(
    client, clean_db, monkeypatch
):
    _set_api_key(monkeypatch)
    payload = {
        "product_type": "EVSE",
        "mcus": [
            _full_mcu("mcu1", "AA:BB:CC:00:00:01"),
            _full_mcu("mcu2", "AA:BB:CC:00:00:02"),
        ],
    }
    r = await _provision(client, payload)
    assert r.status_code == 201, r.text
    body = r.json()

    assert body["created"] is True
    assert body["serial_number"].startswith("M5-EVS-")
    assert body["pop"] is not None
    assert body["pop"].startswith("mfp_")
    assert len(body["pop"]) == 30
    assert body["device_id"]
    assert len(body["mcus"]) == 2
    roles = sorted(m["role"] for m in body["mcus"])
    assert roles == ["mcu1", "mcu2"]


async def test_provision_picks_mcu2_mac_as_canonical_for_evse(
    client, clean_db, pg_pool, monkeypatch
):
    """Two-MCU EVSE: devices.mac_address should be MCU2's MAC (gateway is canonical)."""
    _set_api_key(monkeypatch)
    payload = {
        "product_type": "EVSE",
        "mcus": [
            _full_mcu("mcu1", "AA:BB:CC:00:01:01"),
            _full_mcu("mcu2", "AA:BB:CC:00:01:02"),
        ],
    }
    r = await _provision(client, payload)
    assert r.status_code == 201, r.text
    device_id = r.json()["device_id"]
    async with pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT mac_address FROM inventory.devices WHERE id = $1", device_id
        )
    assert row["mac_address"] == "AA:BB:CC:00:01:02"


async def test_provision_single_mcu_device_uses_only_mac(
    client, clean_db, pg_pool, monkeypatch
):
    """Single-MCU product (e.g., simpler AEMS): the only MCU's MAC is canonical."""
    _set_api_key(monkeypatch)
    payload = {
        "product_type": "AEMS",
        "mcus": [_full_mcu("main", "AA:BB:CC:00:02:01")],
    }
    r = await _provision(client, payload)
    assert r.status_code == 201, r.text
    device_id = r.json()["device_id"]
    async with pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT mac_address FROM inventory.devices WHERE id = $1", device_id
        )
    assert row["mac_address"] == "AA:BB:CC:00:02:01"
    # AEMS auto-POP behaviour mirrors the existing create_device — only EVSE gets one.
    assert r.json()["pop"] is None


# ---------------------------------------------------------------------------
# Idempotent re-provision (update path)
# ---------------------------------------------------------------------------


async def test_provision_second_call_updates_in_place_no_pop(
    client, clean_db, monkeypatch
):
    _set_api_key(monkeypatch)
    macs = ("AA:BB:CC:00:03:01", "AA:BB:CC:00:03:02")
    r1 = await _provision(client, {
        "product_type": "EVSE",
        "mcus": [_full_mcu("mcu1", macs[0]), _full_mcu("mcu2", macs[1])],
    })
    assert r1.status_code == 201
    first = r1.json()

    r2 = await _provision(client, {
        "product_type": "EVSE",
        "mcus": [
            _full_mcu("mcu1", macs[0], app_version="v0.0.2"),
            _full_mcu("mcu2", macs[1], app_version="v0.0.2"),
        ],
    })
    assert r2.status_code == 201, r2.text
    second = r2.json()

    assert second["created"] is False
    assert second["pop"] is None
    assert second["device_id"] == first["device_id"]
    assert second["serial_number"] == first["serial_number"]
    versions = {m["role"]: m["app_version"] for m in second["mcus"]}
    assert versions == {"mcu1": "v0.0.2", "mcu2": "v0.0.2"}


async def test_provision_matches_existing_device_by_any_mcu_mac(
    client, clean_db, monkeypatch
):
    """If only one MCU is being re-flashed but the device already has both
    MCUs registered, posting just that one MAC should match the existing
    record — no orphan device created.
    """
    _set_api_key(monkeypatch)
    r1 = await _provision(client, {
        "product_type": "EVSE",
        "mcus": [
            _full_mcu("mcu1", "AA:BB:CC:00:04:01"),
            _full_mcu("mcu2", "AA:BB:CC:00:04:02"),
        ],
    })
    assert r1.status_code == 201
    device_id_1 = r1.json()["device_id"]

    r2 = await _provision(client, {
        "product_type": "EVSE",
        "mcus": [_full_mcu("mcu1", "AA:BB:CC:00:04:01", app_version="v0.0.5")],
    })
    assert r2.status_code == 201
    assert r2.json()["created"] is False
    assert r2.json()["device_id"] == device_id_1


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


async def test_provision_rejects_empty_mcu_list(client, clean_db, monkeypatch):
    _set_api_key(monkeypatch)
    r = await _provision(client, {"product_type": "EVSE", "mcus": []})
    assert r.status_code == 422


async def test_provision_rejects_invalid_mac_format(client, clean_db, monkeypatch):
    _set_api_key(monkeypatch)
    r = await _provision(client, {
        "product_type": "EVSE",
        "mcus": [{"role": "mcu1", "wifi_sta_mac": "not-a-mac"}],
    })
    assert r.status_code == 422


async def test_provision_persists_all_diagnostic_fields(
    client, clean_db, pg_pool, monkeypatch
):
    """Spot-check a handful of diagnostic columns to confirm the upsert
    actually writes them through (not silently dropped)."""
    _set_api_key(monkeypatch)
    mcu = _full_mcu("mcu1", "AA:BB:CC:00:05:01")
    mcu["chip_revision"] = 7
    mcu["flash_size"] = 8 * 1024 * 1024
    mcu["secure_boot_enabled"] = True
    r = await _provision(client, {"product_type": "EVSE", "mcus": [mcu]})
    assert r.status_code == 201
    async with pg_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT chip_revision, flash_size, secure_boot_enabled "
            "FROM inventory.device_mcus WHERE LOWER(wifi_sta_mac) = LOWER($1)",
            mcu["wifi_sta_mac"],
        )
    assert row["chip_revision"] == 7
    assert row["flash_size"] == 8 * 1024 * 1024
    assert row["secure_boot_enabled"] is True
