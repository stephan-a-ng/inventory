"""QR code routes"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from app.features.auth import get_current_user

from .services import DeviceService
from .qr_service import generate_qr_png

router = APIRouter(prefix="/api/devices", tags=["qr"])


@router.get("/{device_id}/qr")
async def get_device_qr(device_id: UUID, user: dict = Depends(get_current_user)):
    device = await DeviceService.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    png_bytes = generate_qr_png(device["mac_address"])
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f"inline; filename=qr-{device['mac_address'].replace(':', '')}.png"},
    )
