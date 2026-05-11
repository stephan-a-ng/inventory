"""Board revision routes"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.features.auth import get_current_user, require_role

from .models import BoardRevisionOut, BoardRevisionUpsert
from .board_revision_service import BoardRevisionService

router = APIRouter(tags=["board_revisions"])


@router.get("/api/devices/{device_id}/board-revisions", response_model=list[BoardRevisionOut])
async def list_board_revisions(
    device_id: UUID,
    user: dict = Depends(get_current_user),
):
    return await BoardRevisionService.get_device_board_revisions(device_id)


@router.post("/api/devices/{device_id}/board-revisions", response_model=BoardRevisionOut)
async def upsert_board_revision(
    device_id: UUID,
    data: BoardRevisionUpsert,
    user: dict = Depends(require_role("technician", "admin")),
):
    return await BoardRevisionService.upsert_board_revision(device_id, data.model_dump())


@router.delete("/api/board-revisions/{id}")
async def delete_board_revision(
    id: UUID,
    user: dict = Depends(require_role("technician", "admin")),
):
    deleted = await BoardRevisionService.delete_board_revision(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Board revision not found")
    return {"status": "deleted"}
