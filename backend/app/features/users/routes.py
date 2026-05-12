"""User-management routes — admin-only."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.features.audit import AuditService
from app.features.auth import require_role
from app.features.auth.models import UserRole

from .services import SelfDemotionError, UserNotFoundError, UserService

router = APIRouter(prefix="/api/users", tags=["users"])


_VALID_ROLES = {r.value for r in UserRole}


def _serialize(user: dict) -> dict:
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user.get("name"),
        "picture": user.get("picture"),
        "role": user["role"],
        "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
    }


class RoleUpdate(BaseModel):
    role: str


@router.get("")
async def list_users(actor: dict = Depends(require_role("admin"))):
    users = await UserService.list_users()
    return [_serialize(u) for u in users]


@router.patch("/{user_id}/role")
async def update_user_role(
    user_id: UUID,
    body: RoleUpdate,
    actor: dict = Depends(require_role("admin")),
):
    if body.role not in _VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {sorted(_VALID_ROLES)}",
        )

    try:
        updated = await UserService.update_role(user_id, body.role, actor["id"])
    except SelfDemotionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except UserNotFoundError:
        raise HTTPException(status_code=404, detail="User not found")

    await AuditService.log_action(
        device_id=None,
        user_id=actor["id"],
        action="user_role_changed",
        old_value={"target_user_id": str(user_id), "role": updated["previous_role"]},
        new_value={"target_user_id": str(user_id), "role": updated["role"]},
    )

    out = _serialize(updated)
    out["created_at"] = None  # update_role doesn't fetch created_at; keep out compact
    return out
