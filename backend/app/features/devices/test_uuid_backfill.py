"""Coverage for the v4 → v7 device-id backfill."""
from uuid import UUID, uuid4

from app.features.devices.uuid_backfill import backfill_v4_ids_to_v7
from app.shared.uuid7 import uuid7


async def test_skips_when_every_id_is_already_v7(mock_pool):
    mock_pool.fetch.return_value = [{"id": uuid7()}, {"id": uuid7()}]
    n = await backfill_v4_ids_to_v7()
    assert n == 0
    mock_pool.execute.assert_not_called()


async def test_rewrites_a_v4_id_to_a_v7_id(mock_pool):
    legacy_v4 = uuid4()
    assert legacy_v4.version == 4

    mock_pool.fetch.return_value = [{"id": legacy_v4}]
    n = await backfill_v4_ids_to_v7()
    assert n == 1

    # The UPDATE was called once with new_id, legacy_v4 as args.
    assert mock_pool.execute.await_count == 1
    args = mock_pool.execute.await_args.args
    new_id, old_id = args[1], args[2]
    assert isinstance(new_id, UUID)
    assert new_id.version == 7
    assert old_id == legacy_v4


async def test_only_rewrites_non_v7_rows_in_a_mixed_batch(mock_pool):
    v4_a, v4_b = uuid4(), uuid4()
    v7_existing = uuid7()
    mock_pool.fetch.return_value = [
        {"id": v4_a},
        {"id": v7_existing},
        {"id": v4_b},
    ]
    n = await backfill_v4_ids_to_v7()
    assert n == 2
    assert mock_pool.execute.await_count == 2
    # The v7 row should never have been touched.
    touched_ids = {call.args[2] for call in mock_pool.execute.await_args_list}
    assert v7_existing not in touched_ids
    assert touched_ids == {v4_a, v4_b}
