"""Audit trail routes"""
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from app.features.auth import get_current_user

from .services import AuditService

router = APIRouter(prefix="/api/audit", tags=["audit"])


def _serialize(e: dict) -> dict:
    return {
        "id": str(e["id"]),
        "device_id": str(e["device_id"]) if e.get("device_id") else None,
        "user_id": str(e["user_id"]) if e.get("user_id") else None,
        "user_email": e.get("user_email"),
        "user_name": e.get("user_name"),
        "action": e["action"],
        "old_value": e.get("old_value"),
        "new_value": e.get("new_value"),
        "created_at": e["created_at"].isoformat(),
    }


@router.get("")
async def list_recent_audit(
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Recent audit entries across all devices for the dashboard activity feed."""
    entries = await AuditService.list_recent(limit)
    return [
        {
            **_serialize(e),
            "device_mac": e.get("device_mac"),
            "device_name": e.get("device_name"),
            "device_product_type": e.get("device_product_type"),
        }
        for e in entries
    ]


@router.get("/{device_id}")
async def get_device_audit(device_id: UUID, user: dict = Depends(get_current_user)):
    entries = await AuditService.get_device_audit(device_id)
    return [_serialize(e) for e in entries]
