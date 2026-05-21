"""Persistence layer for `device_flash_logs` rows + GCS log bodies.

Pairs with `flash_log_routes.py`. Kept thin so the route handlers can stay
declarative; all GCS interaction lives in `app.shared.photo_storage`
(badly named — it handles any blob).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from app.shared import photo_storage
from app.shared.db import DatabasePool


# 5 MB cap. A verbose ESP-IDF boot + 60s of operational logs is typically
# under 500 KB; the cap is intentionally generous to cover a stack-trace
# storm or a noisy first boot without truncating something we'd want for
# diagnosis. Anything bigger is almost certainly a runaway log loop and
# the upload should be rejected rather than persisted.
MAX_FLASH_LOG_BYTES = 5 * 1024 * 1024


class FlashLogError(Exception):
    """Service-layer error raised for storage / size violations. Mapped to
    HTTP status codes at the route layer."""


def gcs_key_for(device_id: UUID, mcu_role: str, captured_at: datetime) -> str:
    # Stable URL-safe timestamp + a short random suffix so two near-simultaneous
    # uploads from the same operator don't collide on key.
    ts = captured_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%S")
    suffix = uuid4().hex[:6]
    return f"flash-logs/{device_id}/{mcu_role}-{ts}-{suffix}.log"


async def record_flash_log(
    *,
    device_id: UUID,
    mcu_role: str,
    payload: bytes,
    uploaded_by_user_id: Optional[UUID],
) -> dict:
    """Upload `payload` to GCS and insert a metadata row. Returns the row
    as a dict suitable for the route layer to serialize."""
    if len(payload) == 0:
        raise FlashLogError("flash log payload is empty")
    if len(payload) > MAX_FLASH_LOG_BYTES:
        raise FlashLogError(
            f"flash log payload exceeds {MAX_FLASH_LOG_BYTES} bytes"
        )
    if not photo_storage.is_enabled():
        raise FlashLogError("GCS_BUCKET is not configured; log uploads disabled")

    captured_at = datetime.now(timezone.utc)
    key = gcs_key_for(device_id, mcu_role, captured_at)
    # text/plain so a casual download from the GCS console renders inline.
    photo_storage.put_object(key, payload, content_type="text/plain; charset=utf-8")

    row = await DatabasePool.fetchrow(
        """WITH inserted AS (
             INSERT INTO device_flash_logs
               (device_id, mcu_role, gcs_key, byte_size, captured_at, uploaded_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *
           )
           SELECT i.*, u.email AS uploaded_by_email
           FROM inserted i
           LEFT JOIN users u ON u.id = i.uploaded_by_user_id""",
        device_id, mcu_role, key, len(payload), captured_at, uploaded_by_user_id,
    )
    return dict(row)


async def list_flash_logs(device_id: UUID) -> list[dict]:
    """All captures for a device, newest first. Joins the uploader's email
    so the UI can attribute each entry without a second round-trip."""
    rows = await DatabasePool.fetch(
        """SELECT l.id, l.device_id, l.mcu_role, l.gcs_key, l.byte_size,
                  l.captured_at, l.uploaded_by_user_id, u.email AS uploaded_by_email
           FROM device_flash_logs l
           LEFT JOIN users u ON u.id = l.uploaded_by_user_id
           WHERE l.device_id = $1
           ORDER BY l.captured_at DESC""",
        device_id,
    )
    return [dict(r) for r in rows]


async def get_flash_log(log_id: UUID) -> Optional[dict]:
    row = await DatabasePool.fetchrow(
        """SELECT l.id, l.device_id, l.mcu_role, l.gcs_key, l.byte_size,
                  l.captured_at, l.uploaded_by_user_id, u.email AS uploaded_by_email
           FROM device_flash_logs l
           LEFT JOIN users u ON u.id = l.uploaded_by_user_id
           WHERE l.id = $1""",
        log_id,
    )
    return dict(row) if row else None
