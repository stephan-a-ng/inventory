"""One-time backfill: rewrite legacy v4 device IDs to UUIDv7.

UUIDv7 was added to `DeviceService.create_device` / `CsvService.import_devices`
after the first wave of devices were registered. Those legacy rows still carry
v4 primary keys, which means the live system has two id formats coexisting —
the user wants exactly one (v7) per device.

This module runs at startup (see `app/main.py`). For every device whose `id`
is not v7, we mint a new v7 and UPDATE the row. The audit_log + board_revisions
FKs cascade via `ON UPDATE CASCADE` (added by the schema.sql migration block),
so all references move with the parent row.

Idempotent — only acts on rows where `id.version != 7`.
"""
from __future__ import annotations

from app.shared.db import DatabasePool
from app.shared.uuid7 import uuid7


async def backfill_v4_ids_to_v7() -> int:
    """Replace any non-v7 device id with a fresh v7 id. Returns updated count."""
    rows = await DatabasePool.fetch("SELECT id FROM devices")
    updated = 0
    for r in rows:
        old_id = r["id"]
        if old_id.version == 7:
            continue
        new_id = uuid7()
        # FK rows in audit_log / board_revisions cascade via ON UPDATE CASCADE.
        await DatabasePool.execute(
            "UPDATE devices SET id = $1 WHERE id = $2",
            new_id, old_id,
        )
        updated += 1
    return updated
