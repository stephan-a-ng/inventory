"""Per-device user-attributed notes.

Each row is authored by a user; other techs viewing the device see the
full feed. Authors may edit/delete their own notes; admins may delete
any note.
"""
from typing import Optional
from uuid import UUID

from app.shared.db import DatabasePool


class DeviceNoteService:
    @staticmethod
    async def list_for_device(device_id: UUID) -> list[dict]:
        rows = await DatabasePool.fetch(
            """SELECT n.id, n.device_id, n.user_id, n.body, n.created_at, n.updated_at,
                      u.email AS user_email, u.name AS user_name, u.picture AS user_picture
               FROM device_notes n
               LEFT JOIN users u ON u.id = n.user_id
               WHERE n.device_id = $1
               ORDER BY n.created_at DESC""",
            device_id,
        )
        return [dict(r) for r in rows]

    @staticmethod
    async def get(note_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            """SELECT n.*, u.email AS user_email, u.name AS user_name, u.picture AS user_picture
               FROM device_notes n
               LEFT JOIN users u ON u.id = n.user_id
               WHERE n.id = $1""",
            note_id,
        )
        return dict(row) if row else None

    @staticmethod
    async def create(device_id: UUID, user_id: UUID, body: str) -> dict:
        row = await DatabasePool.fetchrow(
            """INSERT INTO device_notes (device_id, user_id, body)
               VALUES ($1, $2, $3)
               RETURNING id""",
            device_id, user_id, body,
        )
        return await DeviceNoteService.get(row["id"])

    @staticmethod
    async def update(note_id: UUID, body: str) -> Optional[dict]:
        await DatabasePool.execute(
            """UPDATE device_notes SET body = $1, updated_at = now() WHERE id = $2""",
            body, note_id,
        )
        return await DeviceNoteService.get(note_id)

    @staticmethod
    async def delete(note_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM device_notes WHERE id = $1", note_id
        )
        return result == "DELETE 1"
