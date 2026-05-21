"""Persistence for `device_flash_logs` + `device_flash_log_lines`.

Each upload to /api/devices/{id}/flash-logs lands as:
  - one row in device_flash_logs  (capture metadata + raw bytes)
  - N rows in device_flash_log_lines  (one per parsed log line)

Lines are parsed server-side (`flash_log_parser.parse_log_bytes`) and
bulk-inserted via asyncpg's `copy_records_to_table` — for ~80 lines per
60s capture this is roughly two orders of magnitude faster than N
single-row INSERTs.

Hard cap on payload size is intentionally generous (5 MB) — a verbose
boot + 60s of runtime is normally well under 500 KB; the cap exists
to defend against runaway log loops, not to enforce a budget.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.shared.db import DatabasePool

from .flash_log_parser import parse_log_bytes, to_db_tuples


# 5 MB. Verbose ESP-IDF boot + 60s tail is typically <500 KB; cap is here
# as a runaway-loop guard, not a real budget.
MAX_FLASH_LOG_BYTES = 5 * 1024 * 1024


class FlashLogError(Exception):
    """Service-layer error raised for size / shape violations. The route
    layer maps these to HTTP status codes."""


# Column order MUST match the device_flash_log_lines schema (sans the
# BIGSERIAL id). Kept in one place so `parse + insert` stays in sync.
_LINE_COLUMNS = (
    "flash_log_id", "device_id", "mcu_role", "line_no",
    "boot_ms", "level", "tag", "message", "raw", "captured_at",
)


async def record_flash_log(
    *,
    device_id: UUID,
    mcu_role: str,
    payload: bytes,
    uploaded_by_user_id: Optional[UUID],
) -> dict:
    """Parse the payload, insert the parent capture row + every line.

    Returns the parent row as a dict (joined with the uploader's email
    so the route layer can serialize it directly). All-or-nothing: the
    parent INSERT and the bulk COPY happen on the same connection
    inside an implicit transaction, so a parse-then-store failure
    leaves no orphan rows.
    """
    if len(payload) == 0:
        raise FlashLogError("flash log payload is empty")
    if len(payload) > MAX_FLASH_LOG_BYTES:
        raise FlashLogError(
            f"flash log payload exceeds {MAX_FLASH_LOG_BYTES} bytes"
        )

    parsed = parse_log_bytes(payload)
    captured_at = datetime.now(timezone.utc)

    # Need a single connection so the COPY sees the just-inserted parent
    # row (we don't have a separate UoW abstraction in this slice).
    async with DatabasePool._pool.acquire() as conn:
        async with conn.transaction():
            parent = await conn.fetchrow(
                """INSERT INTO device_flash_logs
                     (device_id, mcu_role, byte_size, line_count, raw_bytes,
                      captured_at, uploaded_by_user_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)
                   RETURNING id, device_id, mcu_role, byte_size, line_count,
                             captured_at, uploaded_by_user_id""",
                device_id, mcu_role, len(payload), len(parsed), payload,
                captured_at, uploaded_by_user_id,
            )
            if parsed:
                await conn.copy_records_to_table(
                    "device_flash_log_lines",
                    records=to_db_tuples(
                        parsed,
                        flash_log_id=parent["id"],
                        device_id=device_id,
                        mcu_role=mcu_role,
                        captured_at=captured_at,
                    ),
                    columns=_LINE_COLUMNS,
                )
            # Join uploader email for the response in a single round-trip.
            row = await conn.fetchrow(
                """SELECT l.id, l.device_id, l.mcu_role, l.byte_size,
                          l.line_count, l.captured_at, l.uploaded_by_user_id,
                          u.email AS uploaded_by_email
                   FROM device_flash_logs l
                   LEFT JOIN users u ON u.id = l.uploaded_by_user_id
                   WHERE l.id = $1""",
                parent["id"],
            )
    return dict(row)


async def list_flash_logs(device_id: UUID) -> list[dict]:
    """Captures for a device, newest first. Joined with users so the UI
    can attribute each row without a follow-up call."""
    rows = await DatabasePool.fetch(
        """SELECT l.id, l.device_id, l.mcu_role, l.byte_size, l.line_count,
                  l.captured_at, l.uploaded_by_user_id,
                  u.email AS uploaded_by_email
           FROM device_flash_logs l
           LEFT JOIN users u ON u.id = l.uploaded_by_user_id
           WHERE l.device_id = $1
           ORDER BY l.captured_at DESC""",
        device_id,
    )
    return [dict(r) for r in rows]


async def list_lines_for_capture(
    flash_log_id: UUID, *, after: int = 0, limit: int = 200,
) -> list[dict]:
    """Cursor-paginated read of one capture's lines.

    `after` is the previous page's last line_no; `limit` is a hard cap.
    Returned shape matches device_flash_log_lines minus the BIGSERIAL id
    (we expose `line_no` which is more useful for callers)."""
    rows = await DatabasePool.fetch(
        """SELECT line_no, boot_ms, level, tag, message, raw, captured_at
           FROM device_flash_log_lines
           WHERE flash_log_id = $1 AND line_no > $2
           ORDER BY line_no
           LIMIT $3""",
        flash_log_id, after, max(1, min(limit, 1000)),
    )
    return [dict(r) for r in rows]


async def search_lines(
    *,
    device_id: Optional[UUID] = None,
    mcu_role: Optional[str] = None,
    tag: Optional[str] = None,
    level: Optional[str] = None,
    q: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = 200,
) -> list[dict]:
    """Cross-cutting query against device_flash_log_lines.

    All filters are AND-combined. `q` is a substring search on `message`
    backed by the GIN trigram index. Newest captures first; within a
    capture, lines come back in capture order (line_no ASC) so a multi-
    capture result groups naturally."""
    conditions: list[str] = []
    params: list = []
    idx = 1

    if device_id is not None:
        conditions.append(f"device_id = ${idx}")
        params.append(device_id)
        idx += 1
    if mcu_role is not None:
        conditions.append(f"mcu_role = ${idx}")
        params.append(mcu_role)
        idx += 1
    if tag is not None:
        conditions.append(f"tag = ${idx}")
        params.append(tag)
        idx += 1
    if level is not None:
        conditions.append(f"level = ${idx}")
        params.append(level)
        idx += 1
    if since is not None:
        conditions.append(f"captured_at >= ${idx}")
        params.append(since)
        idx += 1
    if q:
        # Trigram-friendly substring match. ILIKE keeps the query
        # readable; with the GIN index on `message gin_trgm_ops`, the
        # planner uses an index scan when q is >= 3 chars.
        conditions.append(f"message ILIKE ${idx}")
        params.append(f"%{q}%")
        idx += 1

    where = " AND ".join(conditions) if conditions else "TRUE"
    params.append(max(1, min(limit, 1000)))
    query = f"""
        SELECT id, flash_log_id, device_id, mcu_role, line_no,
               boot_ms, level, tag, message, raw, captured_at
        FROM device_flash_log_lines
        WHERE {where}
        ORDER BY captured_at DESC, line_no
        LIMIT ${idx}
    """
    rows = await DatabasePool.fetch(query, *params)
    return [dict(r) for r in rows]


async def get_flash_log(log_id: UUID) -> Optional[dict]:
    row = await DatabasePool.fetchrow(
        """SELECT l.id, l.device_id, l.mcu_role, l.byte_size, l.line_count,
                  l.captured_at, l.uploaded_by_user_id,
                  u.email AS uploaded_by_email
           FROM device_flash_logs l
           LEFT JOIN users u ON u.id = l.uploaded_by_user_id
           WHERE l.id = $1""",
        log_id,
    )
    return dict(row) if row else None
