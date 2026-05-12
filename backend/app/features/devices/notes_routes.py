"""Device notes routes.

RBAC:
- list: any authenticated user
- create / update / delete: admin + technician
- update/delete on a note authored by someone else: admin only
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.features.audit import AuditService
from app.features.auth import get_current_user, require_role

from .notes_service import DeviceNoteService
from .services import DeviceService

router = APIRouter(tags=["device-notes"])


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class NoteUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


def _serialize(n: dict) -> dict:
    return {
        "id": str(n["id"]),
        "device_id": str(n["device_id"]),
        "body": n["body"],
        "author": (
            {
                "id": str(n["user_id"]) if n.get("user_id") else None,
                "name": n.get("user_name"),
                "email": n.get("user_email"),
                "picture": n.get("user_picture"),
            }
            if n.get("user_id")
            else None
        ),
        "created_at": n["created_at"].isoformat(),
        "updated_at": n["updated_at"].isoformat(),
    }


@router.get("/api/devices/{device_id}/notes")
async def list_notes(device_id: UUID, user: dict = Depends(get_current_user)):
    if not await DeviceService.get_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    rows = await DeviceNoteService.list_for_device(device_id)
    return [_serialize(n) for n in rows]


@router.post("/api/devices/{device_id}/notes")
async def create_note(
    device_id: UUID,
    body: NoteCreate,
    user: dict = Depends(require_role("admin", "technician")),
):
    if not await DeviceService.get_device(device_id):
        raise HTTPException(status_code=404, detail="Device not found")
    created = await DeviceNoteService.create(device_id, user["id"], body.body.strip())
    await AuditService.log_action(
        device_id=device_id,
        user_id=user["id"],
        action="note_added",
        new_value={"note_id": created["id"] if isinstance(created["id"], str) else str(created["id"])},
    )
    return _serialize(created)


@router.patch("/api/device-notes/{note_id}")
async def update_note(
    note_id: UUID,
    body: NoteUpdate,
    user: dict = Depends(require_role("admin", "technician")),
):
    note = await DeviceNoteService.get(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    # Authors edit their own; admins edit any.
    if note.get("user_id") != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own notes")
    updated = await DeviceNoteService.update(note_id, body.body.strip())
    return _serialize(updated)


@router.delete("/api/device-notes/{note_id}")
async def delete_note(
    note_id: UUID,
    user: dict = Depends(require_role("admin", "technician")),
):
    note = await DeviceNoteService.get(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.get("user_id") != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own notes")
    await DeviceNoteService.delete(note_id)
    await AuditService.log_action(
        device_id=note["device_id"],
        user_id=user["id"],
        action="note_deleted",
        new_value={"note_id": str(note_id)},
    )
    return {"status": "deleted"}
