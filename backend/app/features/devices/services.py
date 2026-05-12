"""Device business logic"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.shared.db import DatabasePool
from app.shared.encryption import decrypt_pop, encrypt_pop
from app.shared.uuid7 import uuid7

from .pop_service import generate_pop


class DeviceNotFoundError(Exception):
    """Raised when a MAC lookup finds no device."""


class DevicePopMissingError(Exception):
    """Raised when a device exists but has no PoP (legacy or non-EVSE row)."""


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

        # Auto-assign a Moon Five serial when one isn't supplied.
        # See docs/claude/SERIAL-NUMBERS.md for the format.
        if not data.get("serial_number"):
            from .serial_service import next_serial, PRODUCT_FAMILY  # local import to avoid cycle on import
            if product_type in PRODUCT_FAMILY:
                data["serial_number"] = await next_serial(product_type)

        # PoP generated only for EVSE chargers; included in the create
        # response so the factory tool can flash it. Plaintext returned
        # alongside the row but never persisted in plaintext form.
        pop_plaintext: str | None = None
        pop_ciphertext: str | None = None
        pop_generated_at: datetime | None = None
        if product_type == "EVSE":
            pop_plaintext = generate_pop()
            pop_ciphertext = encrypt_pop(pop_plaintext)
            pop_generated_at = datetime.now(timezone.utc)

        # Primary key is a UUIDv7 minted in app code (time-ordered; see
        # docs/claude/SERIAL-NUMBERS.md for the separation between this
        # opaque UUID and the human-readable serial). device_name is auto-
        # generated atomically from product_type + the next sequence number.
        row = await DatabasePool.fetchrow(
            """WITH next_seq AS (
                   SELECT COALESCE(MAX(sequence_number), 0) + 1 AS seq
                   FROM devices WHERE product_type = $2
               )
               INSERT INTO devices (id, mac_address, product_type, serial_number, firmware_version,
                   hardware_revision, current_stage_id, location, site_name, notes,
                   device_name, sequence_number, pop, pop_generated_at)
               SELECT $12, $1, $2, $3, $4, $5, $6, $7, $8, $9,
                   $2 || '-' || LPAD(next_seq.seq::text, 4, '0'), next_seq.seq, $10, $11
               FROM next_seq
               RETURNING *""",
            data["mac_address"], product_type, data.get("serial_number"),
            data.get("firmware_version"), data.get("hardware_revision"),
            data.get("current_stage_id"), data.get("location"),
            data.get("site_name"), data.get("notes"),
            pop_ciphertext,        # $10
            pop_generated_at,      # $11
            uuid7(),               # $12 (id)
        )
        result = dict(row)
        if pop_plaintext is not None:
            # Plaintext only; the route layer decides whether to include it.
            result["pop"] = pop_plaintext
        return result

    @staticmethod
    async def get_pop(mac_address: str) -> dict:
        """Return plaintext PoP + metadata. Raises DeviceNotFoundError / DevicePopMissingError."""
        row = await DatabasePool.fetchrow(
            """SELECT id, mac_address, device_name, pop, pop_generated_at
               FROM devices WHERE LOWER(mac_address) = LOWER($1)""",
            mac_address,
        )
        if not row:
            raise DeviceNotFoundError(mac_address)
        if not row["pop"]:
            raise DevicePopMissingError(mac_address)
        return {
            "id": row["id"],
            "mac_address": row["mac_address"],
            "device_name": row["device_name"],
            "pop": decrypt_pop(row["pop"]),
            "pop_generated_at": row["pop_generated_at"],
        }

    @staticmethod
    async def rotate_pop(mac_address: str) -> dict:
        """Generate a new PoP for the device, save encrypted. Raises DeviceNotFoundError.

        Returns the plaintext PoP + metadata + rotated_from_existing flag.
        Allowed only for EVSE devices (enforced by the pop_only_for_chargers CHECK).
        """
        existing = await DatabasePool.fetchrow(
            """SELECT id, mac_address, device_name, product_type, pop
               FROM devices WHERE LOWER(mac_address) = LOWER($1)""",
            mac_address,
        )
        if not existing:
            raise DeviceNotFoundError(mac_address)
        if existing["product_type"] != "EVSE":
            raise DevicePopMissingError(
                f"PoP is only supported for EVSE devices, not {existing['product_type']}"
            )

        rotated_from_existing = existing["pop"] is not None
        plaintext = generate_pop()
        ciphertext = encrypt_pop(plaintext)
        now = datetime.now(timezone.utc)

        await DatabasePool.execute(
            """UPDATE devices
               SET pop = $1, pop_generated_at = $2, updated_at = now()
               WHERE id = $3""",
            ciphertext, now, existing["id"],
        )
        return {
            "id": existing["id"],
            "mac_address": existing["mac_address"],
            "device_name": existing["device_name"],
            "pop": plaintext,
            "pop_generated_at": now,
            "rotated_from_existing": rotated_from_existing,
        }

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
