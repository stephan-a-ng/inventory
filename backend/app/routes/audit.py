"""Audit trail routes"""
from uuid import UUID
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/{device_id}")
async def get_device_audit(device_id: UUID, user: dict = Depends(get_current_user)):
    entries = await AuditService.get_device_audit(device_id)
    return [
        {
            "id": str(e["id"]),
            "device_id": str(e["device_id"]),
            "user_id": str(e["user_id"]) if e.get("user_id") else None,
            "user_email": e.get("user_email"),
            "user_name": e.get("user_name"),
            "action": e["action"],
            "old_value": e.get("old_value"),
            "new_value": e.get("new_value"),
            "created_at": e["created_at"].isoformat(),
        }
        for e in entries
    ]
