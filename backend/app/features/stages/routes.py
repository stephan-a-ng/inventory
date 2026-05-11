"""Stage configuration routes"""
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.features.auth import get_current_user, require_role

from .models import StageCreate, StageUpdate
from .services import StageService

router = APIRouter(prefix="/api/stages", tags=["stages"])


def _serialize_stage(s: dict) -> dict:
    return {
        "id": str(s["id"]),
        "product_type": s["product_type"],
        "name": s["name"],
        "order": s["order"],
        "description": s.get("description"),
    }


@router.get("")
async def list_stages(
    product_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    stages = await StageService.list_stages(product_type)
    return [_serialize_stage(s) for s in stages]


@router.post("")
async def create_stage(
    stage: StageCreate,
    user: dict = Depends(require_role("admin")),
):
    created = await StageService.create_stage(stage.product_type, stage.name, stage.description)
    return _serialize_stage(created)


@router.patch("/{stage_id}")
async def update_stage(
    stage_id: UUID,
    updates: StageUpdate,
    user: dict = Depends(require_role("admin")),
):
    updated = await StageService.update_stage(
        stage_id,
        name=updates.name,
        description=updates.description,
        order=updates.order,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Stage not found")
    return _serialize_stage(updated)


@router.delete("/{stage_id}")
async def delete_stage(
    stage_id: UUID,
    user: dict = Depends(require_role("admin")),
):
    success, message = await StageService.delete_stage(stage_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"status": "deleted"}
