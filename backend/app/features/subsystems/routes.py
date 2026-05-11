"""Subsystem configuration routes"""
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.features.auth import get_current_user, require_role

from .models import SubsystemOut, SubsystemCreate, SubsystemUpdate
from .services import SubsystemService

router = APIRouter(prefix="/api/subsystems", tags=["subsystems"])


@router.get("", response_model=list[SubsystemOut])
async def list_subsystems(
    product_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    return await SubsystemService.list_subsystems(product_type)


@router.post("", response_model=SubsystemOut)
async def create_subsystem(
    subsystem: SubsystemCreate,
    user: dict = Depends(require_role("admin")),
):
    return await SubsystemService.create_subsystem(subsystem.model_dump())


@router.patch("/{id}", response_model=SubsystemOut)
async def update_subsystem(
    id: UUID,
    updates: SubsystemUpdate,
    user: dict = Depends(require_role("admin")),
):
    updated = await SubsystemService.update_subsystem(id, updates.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Subsystem not found")
    return updated


@router.delete("/{id}")
async def delete_subsystem(
    id: UUID,
    user: dict = Depends(require_role("admin")),
):
    try:
        await SubsystemService.delete_subsystem(id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "deleted"}
