"""Routes for the parsed-line flash-log subsystem.

- POST /api/devices/{device_id}/flash-logs      (X-API-Key)
    Host-tool upload. multipart/form-data: file + mcu_role=<role>.
    Server parses on receive; rows land in device_flash_log_lines.

- GET  /api/devices/{device_id}/flash-logs      (JWT)
    Capture metadata for the device, newest first. Sized so the
    DeviceInfoModal "Flash history" section can show counts.

- GET  /api/devices/flash-logs/{log_id}/lines   (JWT)
    Cursor-paginated read of one capture's lines. `after=<line_no>`
    is the previous page's last line; `limit` caps the response (≤ 1000).

- GET  /api/flash-log-lines                      (JWT)
    Cross-cutting search across captures. Filter by device_id /
    mcu_role / tag / level / since, plus an ILIKE-backed `q=` substring
    on `message` that uses the pg_trgm GIN index. Lives at the top-
    level `/api` prefix so it doesn't collide with the 3-segment
    `/api/devices/{device_id}` route.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.features.auth import get_current_user, require_api_key

from .flash_log_service import (
    FlashLogError,
    MAX_FLASH_LOG_BYTES,
    get_flash_log,
    list_flash_logs,
    list_lines_for_capture,
    record_flash_log,
    search_lines,
)
from .services import DeviceService

router = APIRouter(tags=["device-flash-logs"])


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize_capture(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "device_id": str(row["device_id"]),
        "mcu_role": row["mcu_role"],
        "byte_size": row["byte_size"],
        "line_count": row["line_count"],
        "captured_at": row["captured_at"].isoformat(),
        "uploaded_by_email": row.get("uploaded_by_email"),
    }


def _serialize_line(row: dict) -> dict:
    """One parsed line. `raw` is always present; the structured fields
    are NULL on lines that didn't match the ESP-IDF shape (panic
    backtraces, bootloader output, our own framing markers)."""
    out = {
        "line_no": row["line_no"],
        "boot_ms": row["boot_ms"],
        "level": row["level"],
        "tag": row["tag"],
        "message": row["message"],
        "raw": row["raw"],
    }
    # captured_at is present on cross-cutting search results but not on
    # per-capture line listings (where the caller already knows it).
    if "captured_at" in row and row["captured_at"] is not None:
        out["captured_at"] = row["captured_at"].isoformat()
    if "id" in row:
        out["id"] = row["id"]
    if "flash_log_id" in row:
        out["flash_log_id"] = str(row["flash_log_id"])
    if "device_id" in row:
        out["device_id"] = str(row["device_id"])
    if "mcu_role" in row:
        out["mcu_role"] = row["mcu_role"]
    return out


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


@router.post("/api/devices/{device_id}/flash-logs", status_code=201)
async def upload_flash_log(
    device_id: UUID,
    mcu_role: str = Form(..., min_length=1, max_length=32),
    file: UploadFile = File(...),
    user: dict = Depends(require_api_key),
):
    if not await DeviceService.get_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    payload = await file.read()
    if len(payload) == 0:
        raise HTTPException(status_code=400, detail="empty payload")
    if len(payload) > MAX_FLASH_LOG_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"payload exceeds {MAX_FLASH_LOG_BYTES} bytes",
        )
    try:
        row = await record_flash_log(
            device_id=device_id,
            mcu_role=mcu_role,
            payload=payload,
            uploaded_by_user_id=user.get("id"),
        )
    except FlashLogError as exc:
        # service-side parse/size violation that bypassed the early
        # checks above (shouldn't happen, but defense in depth).
        raise HTTPException(status_code=400, detail=str(exc))
    return _serialize_capture(row)


# ---------------------------------------------------------------------------
# Read paths
# ---------------------------------------------------------------------------


@router.get("/api/devices/{device_id}/flash-logs")
async def list_device_flash_logs(
    device_id: UUID, _user: dict = Depends(get_current_user),
):
    if not await DeviceService.get_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    rows = await list_flash_logs(device_id)
    return {"logs": [_serialize_capture(r) for r in rows]}


@router.get("/api/devices/flash-logs/{log_id}/lines")
async def get_lines_for_capture(
    log_id: UUID,
    after: int = Query(0, ge=0, description="last line_no from prior page"),
    limit: int = Query(200, ge=1, le=1000),
    _user: dict = Depends(get_current_user),
):
    """Render-time read for the per-capture viewer. Stable order by
    line_no so the frontend can stitch infinite-scroll cleanly."""
    capture = await get_flash_log(log_id)
    if not capture:
        raise HTTPException(status_code=404, detail="Flash log not found")
    rows = await list_lines_for_capture(log_id, after=after, limit=limit)
    return {
        "capture": _serialize_capture(capture),
        "lines": [_serialize_line(r) for r in rows],
        "next_after": rows[-1]["line_no"] if rows else None,
    }


@router.get("/api/flash-log-lines")
async def search_flash_log_lines(
    device_id: Optional[UUID] = Query(None),
    mcu_role: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    level: Optional[str] = Query(None, pattern="^[IWED]$"),
    q: Optional[str] = Query(None, min_length=1, max_length=200),
    since: Optional[datetime] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    _user: dict = Depends(get_current_user),
):
    """Cross-cutting search — "every gfi_monitor line in the last 24h",
    "any line containing 'BROWNOUT' on mcu1 across the fleet", etc."""
    rows = await search_lines(
        device_id=device_id, mcu_role=mcu_role, tag=tag,
        level=level, q=q, since=since, limit=limit,
    )
    return {"lines": [_serialize_line(r) for r in rows]}
