"""Subsystem business logic"""
from typing import Optional
from uuid import UUID
from app.shared.db import DatabasePool


class SubsystemService:
    @staticmethod
    async def list_subsystems(product_type: Optional[str] = None) -> list[dict]:
        if product_type:
            rows = await DatabasePool.fetch(
                "SELECT * FROM subsystems WHERE product_type = $1 ORDER BY sort_order ASC, name ASC",
                product_type,
            )
        else:
            rows = await DatabasePool.fetch(
                "SELECT * FROM subsystems ORDER BY product_type ASC, sort_order ASC, name ASC"
            )
        return [dict(r) for r in rows]

    @staticmethod
    async def create_subsystem(data: dict) -> dict:
        # Determine sort_order: if not provided, use max+1 for this product_type
        sort_order = data.get("sort_order")
        if sort_order is None:
            sort_order = await DatabasePool.fetchval(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM subsystems WHERE product_type = $1",
                str(data["product_type"]),
            )
        row = await DatabasePool.fetchrow(
            """INSERT INTO subsystems (product_type, name, sort_order)
               VALUES ($1, $2, $3)
               RETURNING *""",
            str(data["product_type"]), data["name"], sort_order,
        )
        return dict(row)

    @staticmethod
    async def update_subsystem(subsystem_id: UUID, data: dict) -> Optional[dict]:
        updates = []
        params = []
        param_idx = 1
        for key in ("name", "sort_order"):
            value = data.get(key)
            if value is not None:
                updates.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not updates:
            row = await DatabasePool.fetchrow("SELECT * FROM subsystems WHERE id = $1", subsystem_id)
            return dict(row) if row else None

        params.append(subsystem_id)
        query = f"UPDATE subsystems SET {', '.join(updates)} WHERE id = ${param_idx} RETURNING *"
        row = await DatabasePool.fetchrow(query, *params)
        return dict(row) if row else None

    @staticmethod
    async def delete_subsystem(subsystem_id: UUID) -> bool:
        # Check no board revisions reference this subsystem
        count = await DatabasePool.fetchval(
            "SELECT COUNT(*) FROM board_revisions WHERE subsystem_id = $1", subsystem_id
        )
        if count > 0:
            raise ValueError(f"Cannot delete subsystem: {count} board revision(s) reference it")
        result = await DatabasePool.execute(
            "DELETE FROM subsystems WHERE id = $1", subsystem_id
        )
        return result == "DELETE 1"
