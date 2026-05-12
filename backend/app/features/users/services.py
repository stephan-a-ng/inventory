"""User-management business logic — admin-only role administration."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from app.shared.db import DatabasePool


class UserNotFoundError(Exception):
    """Raised when a user ID is unknown."""


class SelfDemotionError(Exception):
    """Raised when an admin tries to change their own role."""


class UserService:
    @staticmethod
    async def list_users() -> list[dict]:
        rows = await DatabasePool.fetch(
            """SELECT id, email, name, picture, role, created_at
               FROM users ORDER BY email ASC"""
        )
        return [dict(r) for r in rows]

    @staticmethod
    async def get_user(user_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            "SELECT id, email, name, picture, role FROM users WHERE id = $1",
            user_id,
        )
        return dict(row) if row else None

    @staticmethod
    async def update_role(user_id: UUID, new_role: str, actor_id: UUID) -> dict:
        """Change a user's role. Returns the updated user dict including the prior role.

        Blocks an admin from changing their own role (forces another admin to
        do it to avoid lockout).
        """
        if user_id == actor_id:
            raise SelfDemotionError("Admins cannot change their own role")

        existing = await UserService.get_user(user_id)
        if not existing:
            raise UserNotFoundError(str(user_id))

        row = await DatabasePool.fetchrow(
            """UPDATE users SET role = $1, updated_at = now()
               WHERE id = $2
               RETURNING id, email, name, picture, role""",
            new_role, user_id,
        )
        result = dict(row)
        result["previous_role"] = existing["role"]
        return result
