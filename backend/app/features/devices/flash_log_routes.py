"""Routes for capturing + retrieving flash-time serial console logs.

- POST /api/devices/{device_id}/flash-logs  (auth: X-API-Key)
    Host-tool upload. multipart/form-data: file=<log bytes>, mcu_role=mcu1
    Returns the persisted metadata row.

- GET /api/devices/{device_id}/flash-logs   (auth: JWT)
    List captures for a device, newest first.

- GET /api/devices/flash-logs/{log_id}      (auth: JWT)
    Returns a signed GCS URL the browser/curl can follow to download the
    raw log. Five-minute expiry.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.features.auth import get_current_user, require_api_key
from app.shared import photo_storage

from .flash_log_service import (
    FlashLogError,
    MAX_FLASH_LOG_BYTES,
    get_flash_log,
    list_flash_logs,
    record_flash_log,
)
from .services import DeviceService

router = APIRouter(tags=["device-flash-logs"])


def _serialize(row: dict, *, include_download_url: bool = False) -> dict:
    out = {
        "id": str(row["id"]),
        "device_id": str(row["device_id"]),
        "mcu_role": row["mcu_role"],
        "byte_size": row["byte_size"],
        "captured_at": row["captured_at"].isoformat(),
        "uploaded_by_email": row.get("uploaded_by_email"),
    }
    if include_download_url:
        out["download_url"] = photo_storage.signed_url(
            row["gcs_key"], method="GET", expires_minutes=5,
        )
    return out


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
        # service-side guard (size, GCS unavailable). 503 distinguishes the
        # "server can't store this right now" case from 4xx client errors.
        raise HTTPException(status_code=503, detail=str(exc))
    return _serialize(row)


@router.get("/api/devices/{device_id}/flash-logs")
async def list_device_flash_logs(
    device_id: UUID, user: dict = Depends(get_current_user),
):
    if not await DeviceService.get_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    rows = await list_flash_logs(device_id)
    return {"logs": [_serialize(r) for r in rows]}


@router.get("/api/devices/flash-logs/{log_id}")
async def get_flash_log_download(
    log_id: UUID, user: dict = Depends(get_current_user),
):
    row = await get_flash_log(log_id)
    if not row:
        raise HTTPException(status_code=404, detail="Flash log not found")
    return _serialize(row, include_download_url=True)
