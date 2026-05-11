"""Unit tests for StageService — especially advance_device_stage."""
from uuid import uuid4

from app.features.stages.services import StageService


async def test_advance_returns_none_when_device_has_no_stage(mock_pool):
    """A device with no current_stage_id can't be advanced."""
    mock_pool.fetchrow.return_value = {"id": uuid4(), "current_stage_id": None}
    result = await StageService.advance_device_stage(uuid4())
    assert result is None


async def test_advance_returns_none_when_device_not_found(mock_pool):
    mock_pool.fetchrow.return_value = None
    result = await StageService.advance_device_stage(uuid4())
    assert result is None


async def test_advance_moves_to_next_stage_by_order(mock_pool):
    """Happy path: device → current stage → next stage by `order`."""
    device_id = uuid4()
    current_stage_id = uuid4()
    next_stage_id = uuid4()

    # The service calls fetchrow four times in order:
    #   1. SELECT device
    #   2. SELECT current_stage
    #   3. SELECT next_stage (same product_type, order+1)
    #   4. UPDATE device RETURNING *
    mock_pool.fetchrow.side_effect = [
        {"id": device_id, "current_stage_id": current_stage_id},
        {"id": current_stage_id, "product_type": "AEMS", "order": 1},
        {"id": next_stage_id, "product_type": "AEMS", "order": 2, "name": "Firmware"},
        {"id": device_id, "current_stage_id": next_stage_id},
    ]

    result = await StageService.advance_device_stage(device_id)
    assert result is not None
    assert result["current_stage_id"] == next_stage_id


async def test_advance_returns_none_at_end_of_pipeline(mock_pool):
    """A device at the last stage can't advance further."""
    device_id = uuid4()
    current_stage_id = uuid4()

    mock_pool.fetchrow.side_effect = [
        {"id": device_id, "current_stage_id": current_stage_id},
        {"id": current_stage_id, "product_type": "AEMS", "order": 6},
        None,  # No stage with order=7
    ]

    result = await StageService.advance_device_stage(device_id)
    assert result is None


async def test_delete_stage_blocked_when_devices_present(mock_pool):
    mock_pool.fetchval.return_value = 3  # 3 devices on this stage
    ok, msg = await StageService.delete_stage(uuid4())
    assert ok is False
    assert "3 device" in msg


async def test_delete_stage_happy_path(mock_pool):
    mock_pool.fetchval.return_value = 0
    mock_pool.fetchrow.return_value = {"id": uuid4(), "product_type": "AEMS", "order": 3}
    ok, msg = await StageService.delete_stage(uuid4())
    assert ok is True
