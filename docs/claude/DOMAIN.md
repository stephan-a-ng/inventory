# DOMAIN.md

Entity glossary and business rules for MoonFive Inventory Manager.

## The big picture

MoonFive ships hardware: AEMS, BEMS, Charger, and Networking devices. Each physical device travels through a multi-stage commissioning pipeline from raw assembly to "deployed in the field." Inventory Manager tracks every device's identity, position in the pipeline, board-level revisions, and an audit trail of every change.

## Entities

### Device

A single physical unit of hardware. Identified primarily by **MAC address** (which is also etched on the device's QR-code label).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Internal primary key |
| `mac_address` | TEXT, UNIQUE | Lowercase or uppercase hex, colon-separated (`AA:BB:CC:DD:EE:FF`). Regex enforced both in Pydantic and on the QR scanner output. |
| `product_type` | enum | `AEMS`, `BEMS`, `CHARGER`, `NETWORKING` |
| `device_name` | TEXT, UNIQUE | Auto-generated on create: `{PRODUCT_TYPE}-{4-digit-sequence}`, e.g. `AEMS-0042`. Protected — never editable via PATCH. |
| `sequence_number` | INTEGER | Per-product-type counter, used to generate `device_name`. Protected. |
| `serial_number` | TEXT | Vendor serial number, optional |
| `firmware_version` | TEXT | Currently flashed firmware version |
| `hardware_revision` | TEXT | Board hardware revision (e.g. `v1.3`) |
| `current_stage_id` | FK → `commissioning_stages` | Where this device sits in its product's pipeline |
| `location` | TEXT | Free-form physical location |
| `site_name` | TEXT | Deployment site (set when device reaches `Deployed`) |
| `notes` | TEXT | Free-form |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Rules:**

- `device_name` and `sequence_number` are assigned by the backend at create-time. **Never accept them from the client.** The PATCH endpoint explicitly strips them.
- On create, if `current_stage_id` is omitted, the backend assigns the first stage (`order = 1`) for the product type.
- Delete cascades to `audit_log` and `board_revisions`.

### CommissioningStage

A node in the pipeline for one product type. Each product type has its own ordered list of stages.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `product_type` | enum | Same four values as Device |
| `name` | TEXT | `Assembly`, `Firmware`, `Calibration`, `QA`, `Staging`, `Deployed` (defaults seeded) |
| `order` | INTEGER | 1-based. `UNIQUE (product_type, order)` |
| `description` | TEXT | What happens at this stage |

**Rules:**

- Default stages are seeded per product type (Assembly → Firmware → Calibration → QA → Staging → Deployed). Admins can create/rename/reorder via the Settings page.
- A stage cannot be deleted if any device's `current_stage_id` points to it. Stage IDs further down the pipeline get their `order` decremented when a predecessor is deleted.
- The `advance_device_stage(device_id)` service moves a device to the next stage by `order` within its product type. At the end of the pipeline it returns `None`.

### Subsystem

A sub-component that belongs to a product type. A device may have a board revision for each of its product's subsystems.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `product_type` | TEXT | One of the four product types |
| `name` | TEXT | E.g. `Raspberry Pi`, `BEMS Hat`, `EVSE`, `LoRa Hat` |
| `sort_order` | INTEGER | Display ordering on the device detail page |

Defaults seeded:

- AEMS: `AEMS Energy Dock`, `AEMS`
- BEMS: `Raspberry Pi`, `BEMS Hat`, `LoRa Hat`
- CHARGER: `EVSE`, `LoRa Hat`
- NETWORKING: *(none seeded)*

**Rules:**

- Cannot delete a subsystem that has board revisions pointing at it (returns 409 from the API).
- `UNIQUE (product_type, name)`.

### BoardRevision

One row per (device, subsystem). The current revision of a specific subsystem on a specific device.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `device_id` | FK → devices, ON DELETE CASCADE | |
| `subsystem_id` | FK → subsystems, ON DELETE CASCADE | |
| `revision` | TEXT | E.g. `v2.1` |
| `component_number` | TEXT | Vendor part number |
| `notes` | TEXT | |
| `updated_at` | TIMESTAMPTZ | |

**Rules:**

- `UNIQUE (device_id, subsystem_id)` — exactly one revision row per device-subsystem combination. The API uses `INSERT … ON CONFLICT (device_id, subsystem_id) DO UPDATE` (upsert).

### AuditLog

Every mutation to a device (`create`, `update`, `delete`, `stage_changed`) writes a row. Read-only after creation.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `device_id` | FK → devices, ON DELETE CASCADE | |
| `user_id` | FK → users (nullable for system-initiated rows) | |
| `action` | TEXT | `created`, `updated`, `deleted`, `stage_changed` |
| `old_value` | JSONB | Pre-change state. Null on create. |
| `new_value` | JSONB | Post-change state. Null on delete. |
| `created_at` | TIMESTAMPTZ | |

**Rules:**

- The `audit_service.log_action()` call is awaited in the same handler as the mutation, but a failure should log + continue (don't roll back the mutation because audit failed).
- The ActivityFeed on the Dashboard surfaces the 50 most recent rows across all devices, joined with user email/name.

### User

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `email` | TEXT, UNIQUE | Used as the OAuth subject identifier |
| `name`, `picture` | TEXT | From the Google profile |
| `role` | TEXT, CHECK | `admin`, `technician`, `viewer` |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Role assignment on first sign-in:**

- Email ends with `@moonfive.tech` → `admin`
- Otherwise → `viewer`

To promote a user to `technician`, run SQL manually:

```sql
UPDATE inventory.users SET role = 'technician' WHERE email = 'someone@example.com';
```

**Role capabilities:**

| Action | viewer | technician | admin |
|---|---|---|---|
| List devices, view detail | ✓ | ✓ | ✓ |
| Create / update / delete device | | ✓ | ✓ |
| Bulk import / bulk stage change | | ✓ | ✓ |
| Edit board revisions | | ✓ | ✓ |
| CRUD on stages, subsystems | | | ✓ |
| Delete a device | | | ✓ |

## Identifiers

- **MAC address** is the canonical physical identity. The QR label on each device encodes the MAC.
- **`device_name`** (`AEMS-0042`) is the canonical human identity used in conversation, on labels, in spreadsheets.
- **`id` (UUID)** is internal — never displayed in the UI.

## The commissioning pipeline

```
Assembly → Firmware → Calibration → QA → Staging → Deployed
```

Stages are per product type, so AEMS-Assembly and BEMS-Assembly are different rows in `commissioning_stages`. The Settings page lets an admin add a product-specific stage (e.g. an extra `Burn-in` step before `QA` on Charger).

Movement through the pipeline:

- **One device, one stage:** advance via `POST` (or the UI's "Advance" button) → writes to `devices.current_stage_id` and `audit_log`.
- **Many devices, one target stage:** `POST /api/devices/bulk-stage` with `{device_ids, stage_id}` → writes the same value to every device + an audit row per device.

## CSV import format

`POST /api/devices/bulk-import` accepts a CSV with these columns (header row required):

```csv
mac_address,product_type,serial_number,firmware_version,hardware_revision,location,site_name,notes
AA:BB:CC:DD:EE:FF,AEMS,SN-001,1.0.0,v1.3,Bench-3,,Initial import
```

- `mac_address` and `product_type` are required.
- Existing devices (by MAC) are skipped, not overwritten. The response includes `imported_count` + a list of per-row errors.
- New devices get auto-assigned to the first stage of their product type.

CSV export (`GET /api/devices/export`) returns the same columns plus `device_name`, `current_stage_name`, `created_at`, `updated_at`.
