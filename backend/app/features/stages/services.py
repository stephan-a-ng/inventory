"""Stage management service"""
from typing import Optional
from uuid import UUID
from app.shared.db import DatabasePool


class StageService:
    @staticmethod
    async def list_stages(product_type: Optional[str] = None) -> list[dict]:
        if product_type:
            rows = await DatabasePool.fetch(
                'SELECT * FROM commissioning_stages WHERE product_type = $1 ORDER BY "order" ASC',
                product_type,
            )
        else:
            rows = await DatabasePool.fetch(
                'SELECT * FROM commissioning_stages ORDER BY product_type, "order" ASC'
            )
        return [dict(r) for r in rows]

    @staticmethod
    async def create_stage(product_type: str, name: str, description: Optional[str] = None) -> dict:
        # Get next order number
        max_order = await DatabasePool.fetchval(
            'SELECT COALESCE(MAX("order"), 0) FROM commissioning_stages WHERE product_type = $1',
            product_type,
        )
        row = await DatabasePool.fetchrow(
            """INSERT INTO commissioning_stages (product_type, name, "order", description)
               VALUES ($1, $2, $3, $4) RETURNING *""",
            product_type, name, max_order + 1, description,
        )
        return dict(row)

    @staticmethod
    async def update_stage(stage_id: UUID, name: Optional[str] = None, description: Optional[str] = None, order: Optional[int] = None) -> Optional[dict]:
        stage = await DatabasePool.fetchrow(
            "SELECT * FROM commissioning_stages WHERE id = $1", stage_id
        )
        if not stage:
            return None

        if order is not None and order != stage["order"]:
            # Reorder: shift other stages
            if order > stage["order"]:
                await DatabasePool.execute(
                    """UPDATE commissioning_stages SET "order" = "order" - 1
                       WHERE product_type = $1 AND "order" > $2 AND "order" <= $3""",
                    stage["product_type"], stage["order"], order,
                )
            else:
                await DatabasePool.execute(
                    """UPDATE commissioning_stages SET "order" = "order" + 1
                       WHERE product_type = $1 AND "order" >= $2 AND "order" < $3""",
                    stage["product_type"], order, stage["order"],
                )

        updates = []
        params = []
        idx = 1
        if name is not None:
            updates.append(f'name = ${idx}')
            params.append(name)
            idx += 1
        if description is not None:
            updates.append(f'description = ${idx}')
            params.append(description)
            idx += 1
        if order is not None:
            updates.append(f'"order" = ${idx}')
            params.append(order)
            idx += 1

        if not updates:
            return dict(stage)

        params.append(stage_id)
        row = await DatabasePool.fetchrow(
            f"UPDATE commissioning_stages SET {', '.join(updates)} WHERE id = ${idx} RETURNING *",
            *params,
        )
        return dict(row) if row else None

    @staticmethod
    async def delete_stage(stage_id: UUID) -> tuple[bool, str]:
        # Check if any devices use this stage
        count = await DatabasePool.fetchval(
            "SELECT COUNT(*) FROM devices WHERE current_stage_id = $1", stage_id
        )
        if count > 0:
            return False, f"Cannot delete: {count} device(s) assigned to this stage"

        stage = await DatabasePool.fetchrow(
            "SELECT * FROM commissioning_stages WHERE id = $1", stage_id
        )
        if not stage:
            return False, "Stage not found"

        await DatabasePool.execute("DELETE FROM commissioning_stages WHERE id = $1", stage_id)
        # Reorder remaining stages
        await DatabasePool.execute(
            """UPDATE commissioning_stages SET "order" = "order" - 1
               WHERE product_type = $1 AND "order" > $2""",
            stage["product_type"], stage["order"],
        )
        return True, "Deleted"

    @staticmethod
    async def advance_device_stage(device_id: UUID) -> Optional[dict]:
        """Advance a device to the next stage. Returns the updated device or None."""
        device = await DatabasePool.fetchrow(
            "SELECT * FROM devices WHERE id = $1", device_id
        )
        if not device or not device["current_stage_id"]:
            return None

        current_stage = await DatabasePool.fetchrow(
            "SELECT * FROM commissioning_stages WHERE id = $1", device["current_stage_id"]
        )
        if not current_stage:
            return None

        next_stage = await DatabasePool.fetchrow(
            """SELECT * FROM commissioning_stages
               WHERE product_type = $1 AND "order" = $2""",
            current_stage["product_type"], current_stage["order"] + 1,
        )
        if not next_stage:
            return None

        row = await DatabasePool.fetchrow(
            "UPDATE devices SET current_stage_id = $1, updated_at = now() WHERE id = $2 RETURNING *",
            next_stage["id"], device_id,
        )
        return dict(row) if row else None
