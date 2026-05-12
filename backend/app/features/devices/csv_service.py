"""CSV import/export service"""
import csv
import io
import re
from typing import Optional
from uuid import UUID
from app.shared.db import DatabasePool
from app.shared.uuid7 import uuid7

MAC_PATTERN = re.compile(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
VALID_PRODUCT_TYPES = {"AEMS", "BEMS", "EVSE", "NETWORKING"}

EXPORT_COLUMNS = [
    "mac_address", "product_type", "serial_number", "firmware_version",
    "hardware_revision", "current_stage_name", "location", "site_name", "notes",
]

IMPORT_COLUMNS = [
    "mac_address", "product_type", "serial_number", "firmware_version",
    "hardware_revision", "location", "site_name", "notes",
]


class CsvService:
    @staticmethod
    def parse_csv(file_content: bytes) -> tuple[list[dict], list[str]]:
        """Parse CSV file and validate rows. Returns (rows, errors)."""
        errors = []
        rows = []

        text = file_content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))

        if not reader.fieldnames:
            return [], ["CSV file is empty or has no headers"]

        # Check required columns
        required = {"mac_address", "product_type"}
        missing = required - set(reader.fieldnames)
        if missing:
            return [], [f"Missing required columns: {', '.join(missing)}"]

        for i, row in enumerate(reader, start=2):
            row_errors = []
            mac = row.get("mac_address", "").strip().upper()
            product_type = row.get("product_type", "").strip().upper()

            if not mac:
                row_errors.append("MAC address is required")
            elif not MAC_PATTERN.match(mac):
                row_errors.append(f"Invalid MAC format: {mac}")

            if not product_type:
                row_errors.append("Product type is required")
            elif product_type not in VALID_PRODUCT_TYPES:
                row_errors.append(f"Invalid product type: {product_type}")

            if row_errors:
                errors.append(f"Row {i}: {'; '.join(row_errors)}")
            else:
                rows.append({
                    "mac_address": mac,
                    "product_type": product_type,
                    "serial_number": row.get("serial_number", "").strip() or None,
                    "firmware_version": row.get("firmware_version", "").strip() or None,
                    "hardware_revision": row.get("hardware_revision", "").strip() or None,
                    "location": row.get("location", "").strip() or None,
                    "site_name": row.get("site_name", "").strip() or None,
                    "notes": row.get("notes", "").strip() or None,
                })

        return rows, errors

    @staticmethod
    async def import_devices(rows: list[dict], user_id: Optional[UUID] = None) -> tuple[int, list[str]]:
        """Import validated device rows. Returns (imported_count, errors)."""
        imported = 0
        errors = []

        for row in rows:
            try:
                # Get first stage for product type
                first_stage = await DatabasePool.fetchrow(
                    'SELECT id FROM commissioning_stages WHERE product_type = $1 ORDER BY "order" ASC LIMIT 1',
                    row["product_type"],
                )
                stage_id = first_stage["id"] if first_stage else None

                # Mint a UUIDv7 in app code so imported rows share the same
                # primary-key generation strategy as interactive creates.
                await DatabasePool.execute(
                    """INSERT INTO devices (id, mac_address, product_type, serial_number, firmware_version,
                           hardware_revision, current_stage_id, location, site_name, notes)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
                    uuid7(),
                    row["mac_address"], row["product_type"], row.get("serial_number"),
                    row.get("firmware_version"), row.get("hardware_revision"),
                    stage_id, row.get("location"), row.get("site_name"), row.get("notes"),
                )
                imported += 1
            except Exception as e:
                if "unique" in str(e).lower():
                    errors.append(f"{row['mac_address']}: already exists")
                else:
                    errors.append(f"{row['mac_address']}: {str(e)}")

        return imported, errors

    @staticmethod
    async def export_csv(
        product_type: Optional[str] = None,
        stage_id: Optional[str] = None,
    ) -> str:
        """Export devices to CSV string."""
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

        where = " AND ".join(conditions) if conditions else "TRUE"

        rows = await DatabasePool.fetch(
            f"""SELECT d.*, cs.name as current_stage_name
                FROM devices d
                LEFT JOIN commissioning_stages cs ON d.current_stage_id = cs.id
                WHERE {where}
                ORDER BY d.created_at DESC""",
            *params,
        )

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=EXPORT_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, "") or "" for col in EXPORT_COLUMNS})

        return output.getvalue()
