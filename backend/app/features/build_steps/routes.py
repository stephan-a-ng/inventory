"""HTTP routes for product revisions, firmware versions, build steps,
and the worker walkthrough.

Phase A: admin CRUD + worker check toggle. Photo endpoints (reference upload,
worker capture, signed-URL serving) arrive in Phase B/C — the relevant
columns and tables exist already so those phases are pure additions.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.features.audit import AuditService
from app.features.auth import get_current_user, require_role

from .models import (
    BuildStepCreate,
    BuildStepReorder,
    BuildStepUpdate,
    FirmwareVersionCreate,
    FirmwareVersionUpdate,
    ProductRevisionCreate,
    ProductRevisionUpdate,
    StepStatusToggle,
)
from .services import (
    BuildStepService,
    DeviceProgressService,
    FirmwareVersionService,
    ProductRevisionService,
)

router = APIRouter(tags=["build-steps"])


# ── serializers ──────────────────────────────────────────────────────────────
def _ser_revision(r: dict) -> dict:
    return {
        "id": str(r["id"]),
        "product_type": r["product_type"],
        "label": r["label"],
        "notes": r.get("notes"),
        "is_default": r["is_default"],
        "created_at": r["created_at"].isoformat(),
        "updated_at": r["updated_at"].isoformat(),
    }


def _ser_firmware(f: dict) -> dict:
    return {
        "id": str(f["id"]),
        "product_revision_id": str(f["product_revision_id"]),
        "version": f["version"],
        "notes": f.get("notes"),
        "is_standard": f["is_standard"],
        "released_at": f["released_at"].isoformat() if f.get("released_at") else None,
        "created_at": f["created_at"].isoformat(),
        "updated_at": f["updated_at"].isoformat(),
    }


def _ser_step(s: dict) -> dict:
    return {
        "id": str(s["id"]),
        "product_revision_id": str(s["product_revision_id"]),
        "stage_key": s["stage_key"],
        "sort_order": s["sort_order"],
        "title": s["title"],
        "description": s.get("description"),
        "reference_photo_key": s.get("reference_photo_key"),
        "required_photo_count": s["required_photo_count"],
        "created_at": s["created_at"].isoformat(),
        "updated_at": s["updated_at"].isoformat(),
    }


def _ser_status(s: dict) -> dict:
    return {
        "build_step_id": str(s["build_step_id"]),
        "checked": bool(s["checked"]),
        "checked_at": s["checked_at"].isoformat() if s.get("checked_at") else None,
        "checked_by_user_id": str(s["checked_by_user_id"]) if s.get("checked_by_user_id") else None,
    }


def _ser_photo(p: dict, signed_url: Optional[str] = None) -> dict:
    return {
        "id": str(p["id"]),
        "build_step_id": str(p["build_step_id"]),
        "photo_key": p["photo_key"],
        "url": signed_url,
        "caption": p.get("caption"),
        "taken_by_user_id": str(p["taken_by_user_id"]) if p.get("taken_by_user_id") else None,
        "taken_at": p["taken_at"].isoformat(),
    }


# ── product revisions ────────────────────────────────────────────────────────
@router.get("/api/product-revisions")
async def list_revisions(
    product_type: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    rows = await ProductRevisionService.list_for(product_type)
    return [_ser_revision(r) for r in rows]


@router.post("/api/product-revisions")
async def create_revision(
    body: ProductRevisionCreate,
    user: dict = Depends(require_role("admin")),
):
    try:
        created = await ProductRevisionService.create(
            body.product_type.value, body.label, body.notes, body.is_default,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Revision with this label already exists")
        raise
    return _ser_revision(created)


@router.patch("/api/product-revisions/{revision_id}")
async def update_revision(
    revision_id: UUID,
    body: ProductRevisionUpdate,
    user: dict = Depends(require_role("admin")),
):
    updated = await ProductRevisionService.update(revision_id, body.label, body.notes)
    if not updated:
        raise HTTPException(status_code=404, detail="Revision not found")
    return _ser_revision(updated)


@router.post("/api/product-revisions/{revision_id}/set-default")
async def set_revision_default(
    revision_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    updated = await ProductRevisionService.set_default(revision_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Revision not found")
    return _ser_revision(updated)


@router.delete("/api/product-revisions/{revision_id}")
async def delete_revision(
    revision_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    if not await ProductRevisionService.delete(revision_id):
        raise HTTPException(status_code=404, detail="Revision not found")
    return {"status": "deleted"}


# ── firmware versions ────────────────────────────────────────────────────────
@router.get("/api/product-revisions/{revision_id}/firmware-versions")
async def list_firmware(
    revision_id: UUID,
    user: dict = Depends(get_current_user),
):
    rows = await FirmwareVersionService.list_for(revision_id)
    return [_ser_firmware(f) for f in rows]


@router.post("/api/product-revisions/{revision_id}/firmware-versions")
async def create_firmware(
    revision_id: UUID,
    body: FirmwareVersionCreate,
    user: dict = Depends(require_role("admin")),
):
    if not await ProductRevisionService.get(revision_id):
        raise HTTPException(status_code=404, detail="Revision not found")
    try:
        created = await FirmwareVersionService.create(
            revision_id, body.version, body.notes, body.is_standard, body.released_at,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Firmware version already registered")
        raise
    return _ser_firmware(created)


@router.patch("/api/firmware-versions/{version_id}")
async def update_firmware(
    version_id: UUID,
    body: FirmwareVersionUpdate,
    user: dict = Depends(require_role("admin")),
):
    updated = await FirmwareVersionService.update(version_id, body.version, body.notes, body.released_at)
    if not updated:
        raise HTTPException(status_code=404, detail="Firmware version not found")
    return _ser_firmware(updated)


@router.post("/api/firmware-versions/{version_id}/set-standard")
async def set_firmware_standard(
    version_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    updated = await FirmwareVersionService.set_standard(version_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Firmware version not found")
    return _ser_firmware(updated)


@router.delete("/api/firmware-versions/{version_id}")
async def delete_firmware(
    version_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    if not await FirmwareVersionService.delete(version_id):
        raise HTTPException(status_code=404, detail="Firmware version not found")
    return {"status": "deleted"}


# ── build steps ──────────────────────────────────────────────────────────────
@router.get("/api/build-steps")
async def list_steps(
    product_revision_id: UUID = Query(...),
    stage_key: str = Query(...),
    user: dict = Depends(get_current_user),
):
    if stage_key not in {"Assembly", "Firmware", "Calibration"}:
        raise HTTPException(status_code=400, detail="Invalid stage_key")
    rows = await BuildStepService.list_for(product_revision_id, stage_key)
    return [_ser_step(s) for s in rows]


@router.post("/api/build-steps")
async def create_step(
    body: BuildStepCreate,
    user: dict = Depends(require_role("admin")),
):
    if not await ProductRevisionService.get(body.product_revision_id):
        raise HTTPException(status_code=404, detail="Revision not found")
    created = await BuildStepService.create(
        body.product_revision_id, body.stage_key, body.title, body.description, body.required_photo_count,
    )
    return _ser_step(created)


@router.patch("/api/build-steps/{step_id}")
async def update_step(
    step_id: UUID,
    body: BuildStepUpdate,
    user: dict = Depends(require_role("admin")),
):
    updated = await BuildStepService.update(
        step_id, body.title, body.description, body.required_photo_count, body.sort_order,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Step not found")
    return _ser_step(updated)


@router.post("/api/build-steps/reorder")
async def reorder_steps(
    body: BuildStepReorder,
    user: dict = Depends(require_role("admin")),
):
    count = await BuildStepService.reorder(body.ids)
    return {"reordered": count}


@router.delete("/api/build-steps/{step_id}")
async def delete_step(
    step_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    if not await BuildStepService.delete(step_id):
        raise HTTPException(status_code=404, detail="Step not found")
    return {"status": "deleted"}


# ── worker walkthrough ───────────────────────────────────────────────────────
@router.get("/api/devices/{device_id}/stages/{stage_key}/build-steps")
async def worker_view(
    device_id: UUID,
    stage_key: str,
    user: dict = Depends(get_current_user),
):
    if stage_key not in {"Assembly", "Firmware", "Calibration"}:
        raise HTTPException(status_code=400, detail="Invalid stage_key")
    # Resolve the device + revision once.
    from app.features.devices.services import DeviceService  # local import to avoid cycle on import
    device = await DeviceService.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    revision = await ProductRevisionService.resolve_for_device(
        device["product_type"], device.get("hardware_revision"),
    )
    if not revision:
        # No default revision seeded for this product type yet — return empty.
        return {"device_id": str(device_id), "stage_key": stage_key, "revision": None, "steps": []}

    merged = await DeviceProgressService.get_worker_view(device_id, stage_key, revision["id"])
    return {
        "device_id": str(device_id),
        "stage_key": stage_key,
        "revision": _ser_revision(revision),
        "steps": [
            {
                "step": _ser_step(item["step"]),
                "status": _ser_status(item["status"]),
                "photos": [_ser_photo(p) for p in item["photos"]],
            }
            for item in merged
        ],
    }


@router.post("/api/devices/{device_id}/build-steps/{step_id}/toggle")
async def toggle_step(
    device_id: UUID,
    step_id: UUID,
    body: StepStatusToggle,
    user: dict = Depends(require_role("admin", "technician")),
):
    # Sanity-check both records exist before writing.
    from app.features.devices.services import DeviceService
    if not await DeviceService.get_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    if not await BuildStepService.get(step_id):
        raise HTTPException(status_code=404, detail="Step not found")

    status = await DeviceProgressService.toggle_status(device_id, step_id, user["id"], body.checked)
    await AuditService.log_action(
        device_id=device_id,
        user_id=user["id"],
        action="build_step_toggled",
        new_value={"step_id": str(step_id), "checked": body.checked},
    )
    return _ser_status(status)
