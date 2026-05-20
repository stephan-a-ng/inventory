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


# ============================================================================
# Provisioning (host flash-tool ↔ POST /api/devices/provision)
# ============================================================================


def _pick_canonical_mac(mcus: list[dict]) -> str:
    """Pick the MAC that becomes devices.mac_address. For two-MCU EVSEs the
    convention is to use MCU2's (the gateway) MAC since that's the unit
    customers will see in BLE provisioning. For single-MCU devices, the
    only available MAC wins.
    """
    for m in mcus:
        if m.get("role") == "mcu2":
            return m["wifi_sta_mac"].upper()
    return mcus[0]["wifi_sta_mac"].upper()


def _mcu_columns():
    return [
        "role", "wifi_sta_mac", "bt_mac",
        "chip_type", "chip_revision",
        "flash_chip_id", "flash_size", "flash_mode", "flash_freq_mhz",
        "psram_size", "psram_type",
        "secure_boot_enabled", "flash_encryption_enabled",
        "active_partition", "project_name", "app_version", "elf_sha256",
        "idf_version", "compile_date", "compile_time",
        "reset_reason", "initial_heap_free", "initial_largest_free_block",
    ]


async def _insert_device_mcu(device_id: UUID, mcu: dict) -> dict:
    """Insert one device_mcus row from a request-payload dict. Returns the
    inserted row as a dict (matches DeviceMcuOut shape)."""
    cols = _mcu_columns()
    placeholders = ", ".join(f"${i + 2}" for i in range(len(cols)))
    values = [
        mcu.get("role"),
        (mcu.get("wifi_sta_mac") or "").upper(),
        (mcu.get("bt_mac") or "").upper() or None,
        mcu.get("chip_type"),
        mcu.get("chip_revision"),
        mcu.get("flash_chip_id"),
        mcu.get("flash_size"),
        mcu.get("flash_mode"),
        mcu.get("flash_freq_mhz"),
        mcu.get("psram_size"),
        mcu.get("psram_type"),
        mcu.get("secure_boot_enabled"),
        mcu.get("flash_encryption_enabled"),
        mcu.get("active_partition"),
        mcu.get("project_name"),
        mcu.get("app_version"),
        mcu.get("elf_sha256"),
        mcu.get("idf_version"),
        mcu.get("compile_date"),
        mcu.get("compile_time"),
        mcu.get("reset_reason"),
        mcu.get("initial_heap_free"),
        mcu.get("initial_largest_free_block"),
    ]
    row = await DatabasePool.fetchrow(
        f"""INSERT INTO device_mcus (device_id, {", ".join(cols)})
            VALUES ($1, {placeholders})
            RETURNING *""",
        device_id, *values,
    )
    return dict(row)


async def _upsert_device_mcu(device_id: UUID, mcu: dict) -> dict:
    """Update an existing (device_id, role) row in place, or insert if new."""
    cols = _mcu_columns()
    placeholders = ", ".join(f"${i + 2}" for i in range(len(cols)))
    set_clause = ", ".join(
        f"{c} = EXCLUDED.{c}" for c in cols if c not in ("role",)
    )
    values = [
        mcu.get("role"),
        (mcu.get("wifi_sta_mac") or "").upper(),
        (mcu.get("bt_mac") or "").upper() or None,
        mcu.get("chip_type"),
        mcu.get("chip_revision"),
        mcu.get("flash_chip_id"),
        mcu.get("flash_size"),
        mcu.get("flash_mode"),
        mcu.get("flash_freq_mhz"),
        mcu.get("psram_size"),
        mcu.get("psram_type"),
        mcu.get("secure_boot_enabled"),
        mcu.get("flash_encryption_enabled"),
        mcu.get("active_partition"),
        mcu.get("project_name"),
        mcu.get("app_version"),
        mcu.get("elf_sha256"),
        mcu.get("idf_version"),
        mcu.get("compile_date"),
        mcu.get("compile_time"),
        mcu.get("reset_reason"),
        mcu.get("initial_heap_free"),
        mcu.get("initial_largest_free_block"),
    ]
    row = await DatabasePool.fetchrow(
        f"""INSERT INTO device_mcus (device_id, {", ".join(cols)})
            VALUES ($1, {placeholders})
            ON CONFLICT (device_id, role)
            DO UPDATE SET {set_clause}, updated_at = now()
            RETURNING *""",
        device_id, *values,
    )
    return dict(row)


async def _list_device_mcus(device_id: UUID) -> list[dict]:
    rows = await DatabasePool.fetch(
        "SELECT * FROM device_mcus WHERE device_id = $1 ORDER BY role",
        device_id,
    )
    return [dict(r) for r in rows]


async def _find_device_by_any_mcu_mac(macs: list[str]) -> Optional[dict]:
    """Lookup a device by any of the provided wifi_sta_mac values. Returns
    the device row (with current_stage_name joined) or None.
    """
    if not macs:
        return None
    normalized = [m.upper() for m in macs]
    row = await DatabasePool.fetchrow(
        """SELECT d.*, cs.name AS current_stage_name
           FROM devices d
           JOIN device_mcus m ON m.device_id = d.id
           LEFT JOIN commissioning_stages cs ON cs.id = d.current_stage_id
           WHERE UPPER(m.wifi_sta_mac) = ANY($1::text[])
           LIMIT 1""",
        normalized,
    )
    return dict(row) if row else None


async def provision_with_mcus(*, product_type: str, mcus: list[dict]) -> dict:
    """Idempotent upsert for the host-flash-tool provision endpoint.

    Lookup keyed on any MCU's wifi_sta_mac. If no existing device matches,
    insert a new Device (auto-serial, auto-POP, first stage) and a
    device_mcus row per payload entry — returns plaintext POP.

    If a device matches: leave the parent Device row alone (don't churn
    serial/stage/POP) and upsert each device_mcus row by (device_id, role).
    Does NOT return POP — callers wanting it must use the audit-logged
    GET /api/devices/{mac}/pop endpoint.
    """
    if not mcus:
        raise ValueError("provision payload must include at least one MCU")

    pt = product_type.value if hasattr(product_type, "value") else str(product_type)

    macs = [m["wifi_sta_mac"] for m in mcus]
    existing = await _find_device_by_any_mcu_mac(macs)

    if existing is not None:
        device_id = existing["id"]
        for mcu in mcus:
            await _upsert_device_mcu(device_id, mcu)
        return {
            "device_id": device_id,
            "serial_number": existing.get("serial_number"),
            "device_name": existing.get("device_name"),
            "pop": None,
            "pop_generated_at": existing.get("pop_generated_at"),
            "created": False,
            "mcus": await _list_device_mcus(device_id),
        }

    # Create path — use existing create_device for serial + POP + stage logic.
    canonical_mac = _pick_canonical_mac(mcus)
    device = await DeviceService.create_device({
        "mac_address": canonical_mac,
        "product_type": pt,
    })

    # Persist per-MCU rows.
    for mcu in mcus:
        await _insert_device_mcu(device["id"], mcu)

    return {
        "device_id": device["id"],
        "serial_number": device.get("serial_number"),
        "device_name": device.get("device_name"),
        "pop": device.get("pop"),  # plaintext only on create
        "pop_generated_at": device.get("pop_generated_at"),
        "created": True,
        "mcus": await _list_device_mcus(device["id"]),
    }
