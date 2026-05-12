"""Audit trail service"""
import json
from typing import Optional
from uuid import UUID
from app.shared.db import DatabasePool


class AuditService:
    @staticmethod
    async def log_action(
        device_id: Optional[UUID],
        user_id: Optional[UUID],
        action: str,
        old_value: Optional[dict] = None,
        new_value: Optional[dict] = None,
    ):
        """Append an audit row. device_id may be None for user-scoped events
        (e.g., user_role_changed)."""
        await DatabasePool.execute(
            """INSERT INTO audit_log (device_id, user_id, action, old_value, new_value)
               VALUES ($1, $2, $3, $4, $5)""",
            device_id, user_id, action,
            json.dumps(old_value) if old_value else None,
            json.dumps(new_value) if new_value else None,
        )

    @staticmethod
    async def list_recent(limit: int = 20) -> list[dict]:
        """Most recent audit entries across all devices, joined with device + user."""
        rows = await DatabasePool.fetch(
            """SELECT al.*,
                      u.email AS user_email,
                      u.name AS user_name,
                      d.mac_address AS device_mac,
                      d.device_name AS device_name,
                      d.product_type AS device_product_type
               FROM audit_log al
               LEFT JOIN users u ON al.user_id = u.id
               LEFT JOIN devices d ON al.device_id = d.id
               ORDER BY al.created_at DESC
               LIMIT $1""",
            limit,
        )
        return [dict(r) for r in rows]

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
