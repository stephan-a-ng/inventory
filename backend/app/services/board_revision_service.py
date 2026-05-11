"""Board revision business logic"""
from typing import Optional
from uuid import UUID
from app.database import DatabasePool


class BoardRevisionService:
    @staticmethod
    async def get_device_board_revisions(device_id: UUID) -> list[dict]:
        rows = await DatabasePool.fetch(
            """SELECT br.*, s.name as subsystem_name
               FROM board_revisions br
               JOIN subsystems s ON br.subsystem_id = s.id
               WHERE br.device_id = $1
               ORDER BY s.sort_order ASC, s.name ASC""",
            device_id,
        )
        return [dict(r) for r in rows]

    @staticmethod
    async def upsert_board_revision(device_id: UUID, data: dict) -> dict:
        row = await DatabasePool.fetchrow(
            """INSERT INTO board_revisions (device_id, subsystem_id, revision, component_number, notes)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (device_id, subsystem_id) DO UPDATE SET
                   revision = EXCLUDED.revision,
                   component_number = EXCLUDED.component_number,
                   notes = EXCLUDED.notes,
                   updated_at = NOW()
               RETURNING *""",
            device_id,
            data["subsystem_id"],
            data.get("revision"),
            data.get("component_number"),
            data.get("notes"),
        )
        # Fetch with subsystem_name joined
        joined = await DatabasePool.fetchrow(
            """SELECT br.*, s.name as subsystem_name
               FROM board_revisions br
               JOIN subsystems s ON br.subsystem_id = s.id
               WHERE br.id = $1""",
            row["id"],
        )
        return dict(joined)

    @staticmethod
    async def delete_board_revision(revision_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM board_revisions WHERE id = $1", revision_id
        )
        return result == "DELETE 1"
