"""Device routes"""
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from app.features.auth import get_current_user, require_role
from app.features.audit import AuditService

from .models import DeviceCreate, DeviceUpdate, BulkStageRequest
from .services import (
    DeviceNotFoundError,
    DevicePopMissingError,
    DeviceService,
)
from .csv_service import CsvService

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _serialize_device(d: dict, *, include_pop: bool = False) -> dict:
    """Convert asyncpg Record fields to serializable types.

    `include_pop` is opt-in and only used on the create response for CHARGER
    devices. Listing, GET-by-id, and CSV export never include the PoP.
    """
    out = {
        "id": str(d["id"]),
        "mac_address": d["mac_address"],
        "device_name": d.get("device_name"),
        "product_type": d["product_type"],
        "serial_number": d.get("serial_number"),
        "firmware_version": d.get("firmware_version"),
        "hardware_revision": d.get("hardware_revision"),
        "current_stage_id": str(d["current_stage_id"]) if d.get("current_stage_id") else None,
        "current_stage_name": d.get("current_stage_name"),
        "location": d.get("location"),
        "site_name": d.get("site_name"),
        "notes": d.get("notes"),
        "created_at": d["created_at"].isoformat(),
        "updated_at": d["updated_at"].isoformat(),
    }
    if include_pop and d.get("pop"):
        out["pop"] = d["pop"]
        if d.get("pop_generated_at"):
            out["pop_generated_at"] = d["pop_generated_at"].isoformat()
    return out


@router.get("")
async def list_devices(
    product_type: Optional[str] = Query(None),
    stage_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    devices, total = await DeviceService.list_devices(
        product_type=product_type,
        stage_id=stage_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    return {
        "devices": [_serialize_device(d) for d in devices],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("")
async def create_device(
    device: DeviceCreate,
    response: Response,
    user: dict = Depends(require_role("admin", "technician")),
):
    try:
        created = await DeviceService.create_device(device.model_dump())
        await AuditService.log_action(
            device_id=created["id"],
            user_id=user["id"],
            action="created",
            new_value={"mac_address": created["mac_address"], "product_type": created["product_type"]},
        )
        # Auto-PoP audit + no-cache response for CHARGER devices.
        if created.get("pop"):
            await AuditService.log_action(
                device_id=created["id"],
                user_id=user["id"],
                action="pop_generated",
                new_value={
                    "pop_generated_at": created["pop_generated_at"].isoformat()
                    if created.get("pop_generated_at") else None
                },
            )
            response.headers["Cache-Control"] = "no-store"
        return _serialize_device(created, include_pop=True)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Device with this MAC address already exists")
        raise


@router.get("/stats")
async def device_stats(user: dict = Depends(get_current_user)):
    return await DeviceService.stats()


@router.get("/lookup/{mac_address}")
async def lookup_by_mac(mac_address: str, user: dict = Depends(get_current_user)):
    device = await DeviceService.lookup_by_mac(mac_address)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return _serialize_device(device)


@router.get("/export")
async def export_devices(
    product_type: Optional[str] = Query(None),
    stage_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    csv_content = await CsvService.export_csv(product_type=product_type, stage_id=stage_id)
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=devices-export.csv"},
    )


@router.get("/{mac_address}/pop")
async def get_device_pop(
    mac_address: str,
    response: Response,
    user: dict = Depends(require_role("admin", "technician", "installer")),
):
    """Retrieve the per-device PoP. Used by the installer app's commissioning flow.

    The act of fetching is audit-logged; the value is never logged anywhere.
    """
    response.headers["Cache-Control"] = "no-store"
    try:
        result = await DeviceService.get_pop(mac_address)
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")
    except DevicePopMissingError:
        raise HTTPException(
            status_code=409,
            detail=(
                "Device has no PoP. Use POST /api/devices/{mac}/pop to generate one."
            ),
        )

    await AuditService.log_action(
        device_id=result["id"],
        user_id=user["id"],
        action="pop_fetched",
        new_value={},
    )
    return {
        "mac_address": result["mac_address"],
        "device_name": result["device_name"],
        "pop": result["pop"],
        "pop_generated_at": result["pop_generated_at"].isoformat()
        if result["pop_generated_at"] else None,
    }


@router.post("/{mac_address}/pop", status_code=201)
async def rotate_device_pop(
    mac_address: str,
    response: Response,
    user: dict = Depends(require_role("admin")),
):
    """Generate (or rotate) the PoP for a CHARGER device.

    Used by the factory tool on first flash, or by an admin to invalidate
    a compromised key. Audit-logged as pop_generated (first time) or
    pop_rotated (subsequent rotations).
    """
    response.headers["Cache-Control"] = "no-store"
    try:
        result = await DeviceService.rotate_pop(mac_address)
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")
    except DevicePopMissingError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    await AuditService.log_action(
        device_id=result["id"],
        user_id=user["id"],
        action="pop_rotated" if result["rotated_from_existing"] else "pop_generated",
        new_value={"pop_generated_at": result["pop_generated_at"].isoformat()},
    )
    return {
        "mac_address": result["mac_address"],
        "device_name": result["device_name"],
        "pop": result["pop"],
        "pop_generated_at": result["pop_generated_at"].isoformat(),
        "rotated_from_existing": result["rotated_from_existing"],
    }


@router.get("/{device_id}")
async def get_device(device_id: UUID, user: dict = Depends(get_current_user)):
    device = await DeviceService.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return _serialize_device(device)


@router.patch("/{device_id}")
async def update_device(
    device_id: UUID,
    updates: DeviceUpdate,
    user: dict = Depends(require_role("admin", "technician")),
):
    old_device = await DeviceService.get_device(device_id)
    if not old_device:
        raise HTTPException(status_code=404, detail="Device not found")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        return _serialize_device(old_device)

    updated = await DeviceService.update_device(device_id, update_data)
    await AuditService.log_action(
        device_id=device_id,
        user_id=user["id"],
        action="updated",
        old_value={k: str(old_device.get(k)) for k in update_data},
        new_value={k: str(v) for k, v in update_data.items()},
    )
    return _serialize_device(updated)


@router.delete("/{device_id}")
async def delete_device(
    device_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    device = await DeviceService.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    await AuditService.log_action(
        device_id=device_id,
        user_id=user["id"],
        action="deleted",
        old_value={"mac_address": device["mac_address"]},
    )
    await DeviceService.delete_device(device_id)
    return {"status": "deleted"}


@router.post("/bulk-stage")
async def bulk_stage_change(
    request: BulkStageRequest,
    user: dict = Depends(require_role("admin", "technician")),
):
    updated = 0
    for device_id in request.device_ids:
        old_device = await DeviceService.get_device(device_id)
        if old_device:
            await DeviceService.update_device(device_id, {"current_stage_id": request.stage_id})
            await AuditService.log_action(
                device_id=device_id,
                user_id=user["id"],
                action="stage_changed",
                old_value={"stage_id": str(old_device.get("current_stage_id")), "stage_name": old_device.get("current_stage_name")},
                new_value={"stage_id": str(request.stage_id)},
            )
            updated += 1
    return {"updated": updated}


@router.post("/bulk-import")
async def bulk_import(
    file: UploadFile = File(...),
    user: dict = Depends(require_role("admin", "technician")),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    rows, parse_errors = CsvService.parse_csv(content)

    if parse_errors and not rows:
        return {"imported": 0, "errors": parse_errors}

    imported, import_errors = await CsvService.import_devices(rows, user["id"])
    return {
        "imported": imported,
        "errors": parse_errors + import_errors,
        "total_rows": len(rows) + len(parse_errors),
    }
