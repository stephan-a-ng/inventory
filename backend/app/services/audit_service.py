"""Audit trail service"""
import json
from typing import Optional
from uuid import UUID
from app.database import DatabasePool


class AuditService:
    @staticmethod
    async def log_action(
        device_id: UUID,
        user_id: Optional[UUID],
        action: str,
        old_value: Optional[dict] = None,
        new_value: Optional[dict] = None,
    ):
        await DatabasePool.execute(
            """INSERT INTO audit_log (device_id, user_id, action, old_value, new_value)
               VALUES ($1, $2, $3, $4, $5)""",
            device_id, user_id, action,
            json.dumps(old_value) if old_value else None,
            json.dumps(new_value) if new_value else None,
        )

    @staticmethod
    async def get_device_audit(device_id: UUID) -> list[dict]:
        rows = await DatabasePool.fetch(
            """SELECT al.*, u.email as user_email, u.name as user_name
               FROM audit_log al
               LEFT JOIN users u ON al.user_id = u.id
               WHERE al.device_id = $1
               ORDER BY al.created_at DESC""",
            device_id,
        )
        return [dict(r) for r in rows]
