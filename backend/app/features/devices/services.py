"""Device business logic"""
from typing import Optional
from uuid import UUID
from app.shared.db import DatabasePool


class DeviceService:
    @staticmethod
    async def list_devices(
        product_type: Optional[str] = None,
        stage_id: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict], int]:
        conditions = []
        params = []
        param_idx = 1

        if product_type:
            conditions.append(f"d.product_type = ${param_idx}")
            params.append(product_type)
            param_idx += 1

        if stage_id:
            conditions.append(f"d.current_stage_id = ${param_idx}")
            params.append(stage_id)
            param_idx += 1

        if search:
            conditions.append(
                f"(d.device_name ILIKE ${param_idx} OR d.mac_address ILIKE ${param_idx} OR d.serial_number ILIKE ${param_idx} OR d.site_name ILIKE ${param_idx} OR d.location ILIKE ${param_idx})"
            )
            params.append(f"%{search}%")
            param_idx += 1

        where = " AND ".join(conditions) if conditions else "TRUE"

        count_query = f"SELECT COUNT(*) FROM devices d WHERE {where}"
        total = await DatabasePool.fetchval(count_query, *params)

        offset = (page - 1) * page_size
        query = f"""
            SELECT d.*, cs.name as current_stage_name
            FROM devices d
            LEFT JOIN commissioning_stages cs ON d.current_stage_id = cs.id
            WHERE {where}
            ORDER BY d.updated_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        params.extend([page_size, offset])

        rows = await DatabasePool.fetch(query, *params)
        return [dict(r) for r in rows], total

    @staticmethod
    async def get_device(device_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            """SELECT d.*, cs.name as current_stage_name
               FROM devices d
               LEFT JOIN commissioning_stages cs ON d.current_stage_id = cs.id
               WHERE d.id = $1""",
            device_id,
        )
        return dict(row) if row else None

    @staticmethod
    async def create_device(data: dict) -> dict:
        # ProductType is a (str, Enum); .value yields the canonical "AEMS" etc.
        # Plain str() returns "ProductType.AEMS" on Python 3.11+ (str-Enum __str__ change),
        # which violates the devices_product_type_check constraint.
        pt = data["product_type"]
        product_type = pt.value if hasattr(pt, "value") else str(pt)

        # If no stage specified, assign the first stage for this product type
        if not data.get("current_stage_id"):
            first_stage = await DatabasePool.fetchrow(
                'SELECT id FROM commissioning_stages WHERE product_type = $1 ORDER BY "order" ASC LIMIT 1',
                product_type,
            )
            if first_stage:
                data["current_stage_id"] = first_stage["id"]

        # Auto-generate device name atomically to avoid race conditions
        row = await DatabasePool.fetchrow(
            """WITH next_seq AS (
                   SELECT COALESCE(MAX(sequence_number), 0) + 1 AS seq
                   FROM devices WHERE product_type = $2
               )
               INSERT INTO devices (mac_address, product_type, serial_number, firmware_version,
                   hardware_revision, current_stage_id, location, site_name, notes,
                   device_name, sequence_number)
               SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9,
                   $2 || '-' || LPAD(next_seq.seq::text, 4, '0'), next_seq.seq
               FROM next_seq
               RETURNING *""",
            data["mac_address"], product_type, data.get("serial_number"),
            data.get("firmware_version"), data.get("hardware_revision"),
            data.get("current_stage_id"), data.get("location"),
            data.get("site_name"), data.get("notes"),
        )
        return dict(row)

    @staticmethod
    async def update_device(device_id: UUID, data: dict) -> Optional[dict]:
        # Build dynamic update
        PROTECTED_FIELDS = {'device_name', 'sequence_number'}
        updates = []
        params = []
        param_idx = 1
        for key, value in data.items():
            if key in PROTECTED_FIELDS:
                continue
            if value is not None:
                updates.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not updates:
            return await DeviceService.get_device(device_id)

        updates.append("updated_at = now()")
        params.append(device_id)

        query = f"""
            UPDATE devices SET {', '.join(updates)}
            WHERE id = ${param_idx}
            RETURNING *
        """
        row = await DatabasePool.fetchrow(query, *params)
        return dict(row) if row else None

    @staticmethod
    async def delete_device(device_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM devices WHERE id = $1", device_id
        )
        return result == "DELETE 1"

    @staticmethod
    async def stats() -> dict:
        """Total devices + count grouped by canonical stage name.

        Stage names (Assembly, Firmware, …, Deployed) are shared across product
        types but each product type has its own stage row. Group by name so the
        dashboard shows one column per name, ordered by the stage's order.
        """
        total = await DatabasePool.fetchval("SELECT COUNT(*) FROM devices")
        rows = await DatabasePool.fetch(
            """SELECT cs.name AS name,
                      MIN(cs."order") AS "order",
                      COUNT(d.id) AS count
               FROM commissioning_stages cs
               LEFT JOIN devices d ON d.current_stage_id = cs.id
               GROUP BY cs.name
               ORDER BY MIN(cs."order"), cs.name"""
        )
        unstaged = await DatabasePool.fetchval(
            "SELECT COUNT(*) FROM devices WHERE current_stage_id IS NULL"
        )
        return {
            "total": total or 0,
            "unstaged": unstaged or 0,
            "by_stage_name": [
                {"name": r["name"], "order": r["order"], "count": r["count"]}
                for r in rows
            ],
        }

    @staticmethod
    async def lookup_by_mac(mac_address: str) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            """SELECT d.*, cs.name as current_stage_name
               FROM devices d
               LEFT JOIN commissioning_stages cs ON d.current_stage_id = cs.id
               WHERE d.mac_address = $1""",
            mac_address.upper(),
        )
        return dict(row) if row else None
