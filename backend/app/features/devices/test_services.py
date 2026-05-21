"""Unit tests for DeviceService with the DB pool mocked at the boundary."""
from uuid import uuid4

import pytest

from app.features.devices.services import DeviceService


async def test_get_device_returns_none_when_not_found(mock_pool):
    mock_pool.fetchrow.return_value = None
    result = await DeviceService.get_device(uuid4())
    assert result is None


async def test_get_device_returns_dict(mock_pool):
    device_id = uuid4()
    mock_pool.fetchrow.return_value = {
        "id": device_id, "mac_address": "AA:BB:CC:DD:EE:01",
        "product_type": "AEMS", "current_stage_name": "Assembly",
    }
    result = await DeviceService.get_device(device_id)
    assert result["mac_address"] == "AA:BB:CC:DD:EE:01"
    assert result["current_stage_name"] == "Assembly"


async def test_update_device_filters_protected_fields(mock_pool):
    """device_name and sequence_number must never be writable via update."""
    device_id = uuid4()
    mock_pool.fetchrow.return_value = {"id": device_id, "mac_address": "AA:BB:CC:DD:EE:01"}

    await DeviceService.update_device(
        device_id,
        {
            "device_name": "EVIL-9999",
            "sequence_number": 9999,
            "notes": "legitimate update",
        },
    )

    # The first fetchrow was the UPDATE; assert the query did NOT include the protected fields.
    call = mock_pool.fetchrow.await_args
    query = call.args[0]
    assert "device_name" not in query
    assert "sequence_number" not in query
    assert "notes" in query


async def test_update_device_returns_current_when_no_writable_fields(mock_pool):
    """If only protected fields are passed, return the current device unchanged."""
    device_id = uuid4()
    # First fetchrow: trying to update — but no writable fields, so service falls through
    # to get_device, which is the second fetchrow.
    expected = {"id": device_id, "mac_address": "AA:BB:CC:DD:EE:01"}
    mock_pool.fetchrow.return_value = expected

    result = await DeviceService.update_device(device_id, {"device_name": "X"})
    # get_device now joins on device_mcus and adds an empty list when no MCUs
    # have been provisioned yet; check the parent device fields match.
    assert result["id"] == expected["id"]
    assert result["mac_address"] == expected["mac_address"]
    assert result.get("mcus") == []


async def test_lookup_by_mac_uppercases_input(mock_pool):
    mock_pool.fetchrow.return_value = None
    await DeviceService.lookup_by_mac("aa:bb:cc:dd:ee:01")

    call = mock_pool.fetchrow.await_args
    # The MAC arg (positional after the query) should be uppercased.
    assert call.args[1] == "AA:BB:CC:DD:EE:01"


async def test_delete_device_returns_true_when_one_row_deleted(mock_pool):
    mock_pool.execute.return_value = "DELETE 1"
    result = await DeviceService.delete_device(uuid4())
    assert result is True


async def test_delete_device_returns_false_when_no_rows_match(mock_pool):
    mock_pool.execute.return_value = "DELETE 0"
    result = await DeviceService.delete_device(uuid4())
    assert result is False
