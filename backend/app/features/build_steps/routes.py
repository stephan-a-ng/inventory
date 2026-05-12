"""HTTP routes for product revisions, firmware versions, build steps,
and the worker walkthrough.

Phase A: admin CRUD + worker check toggle. Photo endpoints (reference upload,
worker capture, signed-URL serving) arrive in Phase B/C — the relevant
columns and tables exist already so those phases are pure additions.
"""
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.features.audit import AuditService
from app.features.auth import get_current_user, require_role
from app.shared import photo_storage

from .models import (
    BuildStepCreate,
    BuildStepReorder,
    BuildStepUpdate,
    BuildSubStepCreate,
    BuildSubStepReorder,
    BuildSubStepUpdate,
    FirmwareVersionCreate,
    FirmwareVersionUpdate,
    InstructionSetClone,
    InstructionSetCreate,
    InstructionSetUpdate,
    ProductRevisionCreate,
    ProductRevisionUpdate,
    StepStatusToggle,
)
from .services import (
    BuildStepService,
    BuildSubStepService,
    DeviceProgressService,
    FirmwareVersionService,
    InstructionSetService,
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


def _ser_step(s: dict, *, with_signed_reference: bool = False) -> dict:
    return {
        "id": str(s["id"]),
        "instruction_set_id": str(s["instruction_set_id"]),
        "sort_order": s["sort_order"],
        "title": s["title"],
        "description": s.get("description"),
        "reference_photo_key": s.get("reference_photo_key"),
        "reference_photo_url": _maybe_sign(s.get("reference_photo_key")) if with_signed_reference else None,
        "required_photo_count": s["required_photo_count"],
        "created_at": s["created_at"].isoformat(),
        "updated_at": s["updated_at"].isoformat(),
    }


def _ser_set(r: dict) -> dict:
    return {
        "id": str(r["id"]),
        "product_revision_id": str(r["product_revision_id"]),
        "stage_key": r["stage_key"],
        "label": r["label"],
        "is_active": r["is_active"],
        "created_at": r["created_at"].isoformat(),
        "updated_at": r["updated_at"].isoformat(),
    }


def _ser_sub_step(s: dict) -> dict:
    return {
        "id": str(s["id"]),
        "build_step_id": str(s["build_step_id"]),
        "sort_order": s["sort_order"],
        "title": s["title"],
        "description": s.get("description"),
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


async def _read_image_upload(file: UploadFile) -> tuple[bytes, str, str]:
    """Read a multipart file, enforce size + image magic. Returns (bytes, mime, ext)."""
    data = await file.read()
    if len(data) > photo_storage.MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Photo exceeds 4 MiB limit")
    sniffed = photo_storage.sniff_image(data)
    if not sniffed:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, or WebP images are accepted")
    return data, sniffed[0], sniffed[1]


def _maybe_sign(key: Optional[str]) -> Optional[str]:
    """Sign a key into a 5-min GET URL when GCS is enabled, else None."""
    if not key or not photo_storage.is_enabled():
        return None
    try:
        return photo_storage.signed_url(key, method="GET", expires_minutes=5)
    except Exception:
        return None


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


# ── instruction sets ─────────────────────────────────────────────────────────
@router.get("/api/instruction-sets")
async def list_instruction_sets(
    product_revision_id: UUID = Query(...),
    stage_key: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    if stage_key and stage_key not in {"Assembly", "Firmware", "Calibration"}:
        raise HTTPException(status_code=400, detail="Invalid stage_key")
    rows = await InstructionSetService.list_for(product_revision_id, stage_key)
    return [_ser_set(r) for r in rows]


@router.post("/api/instruction-sets")
async def create_instruction_set(
    body: InstructionSetCreate,
    user: dict = Depends(require_role("admin")),
):
    if not await ProductRevisionService.get(body.product_revision_id):
        raise HTTPException(status_code=404, detail="Revision not found")
    try:
        created = await InstructionSetService.create(
            body.product_revision_id, body.stage_key, body.label, body.is_active,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Instruction set label already exists for this stage")
        raise
    return _ser_set(created)


@router.post("/api/instruction-sets/{set_id}/clone")
async def clone_instruction_set(
    set_id: UUID,
    body: InstructionSetClone,
    user: dict = Depends(require_role("admin")),
):
    try:
        created = await InstructionSetService.clone(set_id, body.label, activate=body.activate)
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Instruction set label already exists for this stage")
        raise
    if not created:
        raise HTTPException(status_code=404, detail="Source set not found")
    return _ser_set(created)


@router.post("/api/instruction-sets/{set_id}/activate")
async def activate_instruction_set(
    set_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    updated = await InstructionSetService.activate(set_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Set not found")
    return _ser_set(updated)


@router.patch("/api/instruction-sets/{set_id}")
async def update_instruction_set(
    set_id: UUID,
    body: InstructionSetUpdate,
    user: dict = Depends(require_role("admin")),
):
    if body.label is None:
        existing = await InstructionSetService.get(set_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Set not found")
        return _ser_set(existing)
    try:
        updated = await InstructionSetService.update_label(set_id, body.label)
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Instruction set label already exists for this stage")
        raise
    if not updated:
        raise HTTPException(status_code=404, detail="Set not found")
    return _ser_set(updated)


@router.delete("/api/instruction-sets/{set_id}")
async def delete_instruction_set(
    set_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    if not await InstructionSetService.delete(set_id):
        raise HTTPException(status_code=404, detail="Set not found")
    return {"status": "deleted"}


# ── build steps ──────────────────────────────────────────────────────────────
@router.get("/api/build-steps")
async def list_steps(
    instruction_set_id: UUID = Query(...),
    user: dict = Depends(get_current_user),
):
    rows = await BuildStepService.list_for_set(instruction_set_id)
    return [_ser_step(s) for s in rows]


@router.post("/api/build-steps")
async def create_step(
    body: BuildStepCreate,
    user: dict = Depends(require_role("admin")),
):
    if not await InstructionSetService.get(body.instruction_set_id):
        raise HTTPException(status_code=404, detail="Instruction set not found")
    created = await BuildStepService.create(
        body.instruction_set_id, body.title, body.description, body.required_photo_count,
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


# ── sub-steps ────────────────────────────────────────────────────────────────
@router.get("/api/build-steps/{step_id}/sub-steps")
async def list_sub_steps(step_id: UUID, user: dict = Depends(get_current_user)):
    rows = await BuildSubStepService.list_for(step_id)
    return [_ser_sub_step(s) for s in rows]


@router.post("/api/build-steps/{step_id}/sub-steps")
async def create_sub_step(
    step_id: UUID,
    body: BuildSubStepCreate,
    user: dict = Depends(require_role("admin")),
):
    if not await BuildStepService.get(step_id):
        raise HTTPException(status_code=404, detail="Step not found")
    created = await BuildSubStepService.create(step_id, body.title, body.description)
    return _ser_sub_step(created)


@router.patch("/api/build-sub-steps/{sub_id}")
async def update_sub_step(
    sub_id: UUID,
    body: BuildSubStepUpdate,
    user: dict = Depends(require_role("admin")),
):
    updated = await BuildSubStepService.update(sub_id, body.title, body.description, body.sort_order)
    if not updated:
        raise HTTPException(status_code=404, detail="Sub-step not found")
    return _ser_sub_step(updated)


@router.post("/api/build-sub-steps/reorder")
async def reorder_sub_steps(
    body: BuildSubStepReorder,
    user: dict = Depends(require_role("admin")),
):
    count = await BuildSubStepService.reorder(body.ids)
    return {"reordered": count}


@router.delete("/api/build-sub-steps/{sub_id}")
async def delete_sub_step(
    sub_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    if not await BuildSubStepService.delete(sub_id):
        raise HTTPException(status_code=404, detail="Sub-step not found")
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
        return {
            "device_id": str(device_id), "stage_key": stage_key,
            "revision": None, "instruction_set": None, "steps": [],
        }

    pinned_set = await DeviceProgressService.resolve_pinned_set(
        device_id, revision["id"], stage_key,
    )
    if not pinned_set:
        return {
            "device_id": str(device_id), "stage_key": stage_key,
            "revision": _ser_revision(revision),
            "instruction_set": None, "steps": [],
        }

    merged = await DeviceProgressService.get_worker_view(device_id, pinned_set["id"])
    return {
        "device_id": str(device_id),
        "stage_key": stage_key,
        "revision": _ser_revision(revision),
        "instruction_set": _ser_set(pinned_set),
        "steps": [
            {
                "step": _ser_step(item["step"], with_signed_reference=True),
                "sub_steps": [_ser_sub_step(s) for s in item.get("sub_steps", [])],
                "status": _ser_status(item["status"]),
                "photos": [_ser_photo(p, signed_url=_maybe_sign(p["photo_key"])) for p in item["photos"]],
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


# ── photo endpoints ──────────────────────────────────────────────────────────
@router.post("/api/build-steps/{step_id}/reference-photo")
async def upload_reference_photo(
    step_id: UUID,
    file: UploadFile = File(...),
    user: dict = Depends(require_role("admin")),
):
    if not photo_storage.is_enabled():
        raise HTTPException(status_code=503, detail="Photo storage is not configured")
    step = await BuildStepService.get(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    data, mime, ext = await _read_image_upload(file)
    key = f"build-steps/{step_id}/reference.{ext}"
    photo_storage.put_object(key, data, content_type=mime)
    # Clean up any prior reference photo so we don't leak storage.
    prior = step.get("reference_photo_key")
    if prior and prior != key:
        photo_storage.delete_objects([prior])
    updated = await BuildStepService.set_reference_photo_key(step_id, key)
    return _ser_step(updated, with_signed_reference=True)


@router.delete("/api/build-steps/{step_id}/reference-photo")
async def delete_reference_photo(
    step_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    step = await BuildStepService.get(step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    prior = step.get("reference_photo_key")
    if prior and photo_storage.is_enabled():
        photo_storage.delete_objects([prior])
    updated = await BuildStepService.set_reference_photo_key(step_id, None)
    return _ser_step(updated)


@router.post("/api/devices/{device_id}/build-steps/{step_id}/photos")
async def upload_device_photo(
    device_id: UUID,
    step_id: UUID,
    file: UploadFile = File(...),
    user: dict = Depends(require_role("admin", "technician")),
):
    if not photo_storage.is_enabled():
        raise HTTPException(status_code=503, detail="Photo storage is not configured")
    from app.features.devices.services import DeviceService
    if not await DeviceService.get_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    if not await BuildStepService.get(step_id):
        raise HTTPException(status_code=404, detail="Step not found")

    data, mime, ext = await _read_image_upload(file)
    photo_id = uuid4()
    key = f"device-photos/{device_id}/{step_id}/{photo_id}.{ext}"
    photo_storage.put_object(key, data, content_type=mime)
    record = await DeviceProgressService.add_photo(
        device_id=device_id, build_step_id=step_id,
        photo_key=key, taken_by_user_id=user["id"],
    )
    await AuditService.log_action(
        device_id=device_id, user_id=user["id"],
        action="build_step_photo_added",
        new_value={"step_id": str(step_id), "photo_id": str(record["id"])},
    )
    return _ser_photo(record, signed_url=_maybe_sign(key))


@router.delete("/api/devices/{device_id}/build-step-photos/{photo_id}")
async def delete_device_photo(
    device_id: UUID,
    photo_id: UUID,
    user: dict = Depends(require_role("admin", "technician")),
):
    deleted = await DeviceProgressService.delete_photo(photo_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Photo not found")
    if str(deleted["device_id"]) != str(device_id):
        # Belongs to a different device — re-insert to avoid silent data loss.
        await DeviceProgressService.add_photo(
            device_id=deleted["device_id"],
            build_step_id=deleted["build_step_id"],
            photo_key=deleted["photo_key"],
            taken_by_user_id=deleted.get("taken_by_user_id"),
            caption=deleted.get("caption"),
        )
        raise HTTPException(status_code=404, detail="Photo not found")
    if photo_storage.is_enabled() and deleted.get("photo_key"):
        photo_storage.delete_objects([deleted["photo_key"]])
    await AuditService.log_action(
        device_id=device_id, user_id=user["id"],
        action="build_step_photo_deleted",
        new_value={"photo_id": str(photo_id)},
    )
    return {"status": "deleted"}
