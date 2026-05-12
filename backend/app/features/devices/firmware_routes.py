"""Firmware-version-check route — compares a device's recorded
firmware_version against the latest GitHub release for its product type.

Used by the Firmware-stage card on DeviceDetail (frontend
FirmwareVersionCheckCard.jsx).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.features.auth import get_current_user

from .firmware_release_service import FirmwareReleaseService
from .services import DeviceService

router = APIRouter(tags=["device-firmware"])


@router.get("/api/devices/{device_id}/firmware-status")
async def firmware_status(device_id: UUID, user: dict = Depends(get_current_user)):
    device = await DeviceService.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    product_type = device.get("product_type")
    repo = FirmwareReleaseService.repo_for(product_type)
    current = device.get("firmware_version")
    deviation_reason = device.get("firmware_deviation_reason")

    if not repo:
        # AEMS / NETWORKING: no GitHub repo wired up yet — frontend hides
        # the card. Still surface current + reason so PATCH-driven edits
        # round-trip if the column ends up populated by other means.
        return {
            "tracked": False,
            "current": current,
            "deviation_reason": deviation_reason,
        }

    latest = await FirmwareReleaseService.get_latest_tag(product_type)
    is_latest = FirmwareReleaseService.is_match(current, latest)

    return {
        "tracked": True,
        "repo": repo,
        "release_url": (
            FirmwareReleaseService.release_url(repo, latest) if latest else None
        ),
        "current": current,
        "latest": latest,
        "is_latest": is_latest,
        "deviation_reason": deviation_reason,
    }
