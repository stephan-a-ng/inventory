"""Unit tests for AuditService."""
import json
from uuid import uuid4

from app.features.audit.services import AuditService


async def test_log_action_serializes_jsonb_columns(mock_pool):
    """old_value and new_value must reach asyncpg as JSON strings."""
    device_id = uuid4()
    user_id = uuid4()

    await AuditService.log_action(
        device_id=device_id,
        user_id=user_id,
        action="updated",
        old_value={"stage": "Assembly"},
        new_value={"stage": "Firmware"},
    )

    call = mock_pool.execute.await_args
    # Positional args: query, device_id, user_id, action, old_value_json, new_value_json
    assert call.args[1] == device_id
    assert call.args[2] == user_id
    assert call.args[3] == "updated"
    assert json.loads(call.args[4]) == {"stage": "Assembly"}
    assert json.loads(call.args[5]) == {"stage": "Firmware"}


async def test_log_action_handles_missing_old_value(mock_pool):
    """A create action has new_value but no old_value."""
    await AuditService.log_action(
        device_id=uuid4(), user_id=uuid4(), action="created",
        new_value={"mac": "AA:BB:CC:DD:EE:01"},
    )
    call = mock_pool.execute.await_args
    assert call.args[4] is None  # old_value
    assert json.loads(call.args[5]) == {"mac": "AA:BB:CC:DD:EE:01"}


async def test_log_action_handles_missing_new_value(mock_pool):
    """A delete action has old_value but no new_value."""
    await AuditService.log_action(
        device_id=uuid4(), user_id=uuid4(), action="deleted",
        old_value={"mac": "AA:BB:CC:DD:EE:01"},
    )
    call = mock_pool.execute.await_args
    assert json.loads(call.args[4]) == {"mac": "AA:BB:CC:DD:EE:01"}
    assert call.args[5] is None
