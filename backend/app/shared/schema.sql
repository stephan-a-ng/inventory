-- MoonFive Inventory Manager Database Schema

CREATE SCHEMA IF NOT EXISTS inventory;
SET search_path TO inventory, public;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'technician', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commissioning_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_type TEXT NOT NULL CHECK (product_type IN ('AEMS', 'BEMS', 'EVSE', 'NETWORKING')),
    name TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (product_type, name),
    UNIQUE (product_type, "order")
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mac_address TEXT UNIQUE NOT NULL,
    product_type TEXT NOT NULL CHECK (product_type IN ('AEMS', 'BEMS', 'EVSE', 'NETWORKING')),
    serial_number TEXT,
    firmware_version TEXT,
    hardware_revision TEXT,
    current_stage_id UUID REFERENCES commissioning_stages(id),
    location TEXT,
    site_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_name TEXT UNIQUE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
-- Recorded when a device is intentionally on a firmware build other than the
-- latest GitHub release for its product type. See firmware_release_service.py
-- and the FirmwareVersionCheckCard on DeviceDetail.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_deviation_reason TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_mac_address ON devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_devices_product_type ON devices(product_type);
CREATE INDEX IF NOT EXISTS idx_devices_current_stage_id ON devices(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_device_id ON audit_log(device_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Migration: rename product_type CHARGER → EVSE (idempotent).
-- Runs every startup; only does work when old constraints or data are detected.
-- Drops the CHECK constraints with the old value list, updates rows, then
-- re-creates the constraints with the new value list.
DO $$
BEGIN
  -- Old data: rename CHARGER → EVSE in every table that stores product_type.
  -- We rename rows first so the new CHECK constraint doesn't reject existing data.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'inventory'
      AND t.relname IN ('devices', 'commissioning_stages')
      AND pg_get_constraintdef(c.oid) LIKE '%CHARGER%'
  ) THEN
    ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_product_type_check;
    ALTER TABLE commissioning_stages DROP CONSTRAINT IF EXISTS commissioning_stages_product_type_check;
  END IF;

  UPDATE devices SET product_type = 'EVSE' WHERE product_type = 'CHARGER';
  UPDATE commissioning_stages SET product_type = 'EVSE' WHERE product_type = 'CHARGER';
  -- subsystems is created later in this same script. PL/pgSQL parses the
  -- whole function body up-front, so referencing it directly raises
  -- UndefinedTableError on a fresh DB before the IF guard can fire. Use
  -- EXECUTE so the planner only resolves the table at runtime, inside
  -- the existence check.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'inventory' AND table_name = 'subsystems'
  ) THEN
    EXECUTE 'UPDATE subsystems SET product_type = ''EVSE'' WHERE product_type = ''CHARGER''';
  END IF;

  -- Re-add CHECK constraints with the new value set (skip if already present).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devices_product_type_check'
      AND conrelid = 'inventory.devices'::regclass
  ) THEN
    ALTER TABLE devices ADD CONSTRAINT devices_product_type_check
      CHECK (product_type IN ('AEMS', 'BEMS', 'EVSE', 'NETWORKING'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commissioning_stages_product_type_check'
      AND conrelid = 'inventory.commissioning_stages'::regclass
  ) THEN
    ALTER TABLE commissioning_stages ADD CONSTRAINT commissioning_stages_product_type_check
      CHECK (product_type IN ('AEMS', 'BEMS', 'EVSE', 'NETWORKING'));
  END IF;
END $$;

-- Default commissioning stages
INSERT INTO commissioning_stages (product_type, name, "order", description) VALUES
    ('AEMS', 'Firmware', 1, 'Firmware flashing and configuration'),
    ('AEMS', 'Assembly', 2, 'Hardware assembly and initial inspection'),
    ('AEMS', 'Calibration', 3, 'Sensor calibration and verification'),
    ('AEMS', 'QA', 4, 'Quality assurance testing'),
    ('AEMS', 'Staging', 5, 'Staged and ready for deployment'),
    ('AEMS', 'Deployed', 6, 'Deployed to production site'),
    ('BEMS', 'Firmware', 1, 'Firmware flashing and configuration'),
    ('BEMS', 'Assembly', 2, 'Hardware assembly and initial inspection'),
    ('BEMS', 'Calibration', 3, 'Sensor calibration and verification'),
    ('BEMS', 'QA', 4, 'Quality assurance testing'),
    ('BEMS', 'Staging', 5, 'Staged and ready for deployment'),
    ('BEMS', 'Deployed', 6, 'Deployed to production site'),
    ('EVSE', 'Firmware', 1, 'Firmware flashing and configuration'),
    ('EVSE', 'Assembly', 2, 'Hardware assembly and initial inspection'),
    ('EVSE', 'Calibration', 3, 'Sensor calibration and verification'),
    ('EVSE', 'QA', 4, 'Quality assurance testing'),
    ('EVSE', 'Staging', 5, 'Staged and ready for deployment'),
    ('EVSE', 'Deployed', 6, 'Deployed to production site'),
    ('NETWORKING', 'Firmware', 1, 'Firmware flashing and configuration'),
    ('NETWORKING', 'Assembly', 2, 'Hardware assembly and initial inspection'),
    ('NETWORKING', 'Calibration', 3, 'Sensor calibration and verification'),
    ('NETWORKING', 'QA', 4, 'Quality assurance testing'),
    ('NETWORKING', 'Staging', 5, 'Staged and ready for deployment'),
    ('NETWORKING', 'Deployed', 6, 'Deployed to production site')
ON CONFLICT DO NOTHING;

-- One-shot reorder: existing DBs were seeded with Assembly=1, Firmware=2.
-- New ordering puts Firmware first. Run under a deferred (well, two-step
-- via temporary negative) sequence so the (product_type, "order") UNIQUE
-- constraint is never violated mid-swap.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM commissioning_stages WHERE name = 'Assembly' AND "order" = 1
  ) THEN
    UPDATE commissioning_stages SET "order" = -1 WHERE name = 'Assembly' AND "order" = 1;
    UPDATE commissioning_stages SET "order" = 1  WHERE name = 'Firmware' AND "order" = 2;
    UPDATE commissioning_stages SET "order" = 2  WHERE name = 'Assembly' AND "order" = -1;
  END IF;
END $$;

-- New columns for device naming
CREATE INDEX IF NOT EXISTS idx_devices_device_name ON devices(device_name);

-- Subsystems table
CREATE TABLE IF NOT EXISTS subsystems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_type, name)
);

-- Board revisions table
CREATE TABLE IF NOT EXISTS board_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  subsystem_id UUID NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  revision TEXT,
  component_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, subsystem_id)
);

CREATE INDEX IF NOT EXISTS idx_board_revisions_device_id ON board_revisions(device_id);

-- Default subsystems
INSERT INTO subsystems (product_type, name, sort_order) VALUES
  ('AEMS', 'AEMS Energy Dock', 1),
  ('AEMS', 'AEMS', 2),
  ('BEMS', 'Raspberry Pi', 1),
  ('BEMS', 'BEMS Hat', 2),
  ('BEMS', 'LoRa Hat', 3),
  ('EVSE', 'EVSE', 1),
  ('EVSE', 'LoRa Hat', 2)
ON CONFLICT (product_type, name) DO NOTHING;

-- PoP (installer-app WiFi commissioning) — per-device, encrypted at rest.
-- See docs/claude/SECURITY.md and installer-app/docs/inventory-pop-api.md.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pop TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pop_generated_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pop_consumed_at TIMESTAMPTZ;

DO $$
BEGIN
    -- CHARGER was renamed to EVSE; if the legacy constraint with the old
    -- value already exists, drop it before re-adding under the new name.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pop_only_for_chargers' AND conrelid = 'inventory.devices'::regclass
          AND pg_get_constraintdef(oid) LIKE '%CHARGER%'
    ) THEN
        ALTER TABLE devices DROP CONSTRAINT pop_only_for_chargers;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pop_only_for_chargers' AND conrelid = 'inventory.devices'::regclass
    ) THEN
        ALTER TABLE devices
            ADD CONSTRAINT pop_only_for_chargers
            CHECK (pop IS NULL OR product_type = 'EVSE');
    END IF;
END $$;

-- Case-insensitive MAC lookups for GET /api/devices/{mac}/pop.
CREATE INDEX IF NOT EXISTS idx_devices_mac_lower ON devices (LOWER(mac_address));

-- Add the new 'installer' role to the existing users.role CHECK.
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'inventory.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%admin%technician%viewer%'
      AND pg_get_constraintdef(oid) NOT LIKE '%installer%'
    LIMIT 1;

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE inventory.users DROP CONSTRAINT %I', cname);
        ALTER TABLE inventory.users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('admin', 'technician', 'installer', 'viewer'));
    END IF;
END $$;

-- Migration: add ON UPDATE CASCADE to FKs that reference devices(id).
-- We migrate legacy v4 device IDs to v7 in app code (see backfill_v4_ids_to_v7).
-- Without ON UPDATE CASCADE, that PK rewrite would fail. Idempotent —
-- only drops + re-adds the constraint when the cascade rule is missing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_log_device_id_fkey'
      AND confupdtype <> 'c'
  ) THEN
    ALTER TABLE audit_log DROP CONSTRAINT audit_log_device_id_fkey;
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_device_id_fkey
      FOREIGN KEY (device_id) REFERENCES devices(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'board_revisions_device_id_fkey'
      AND confupdtype <> 'c'
  ) THEN
    ALTER TABLE board_revisions DROP CONSTRAINT board_revisions_device_id_fkey;
    ALTER TABLE board_revisions ADD CONSTRAINT board_revisions_device_id_fkey
      FOREIGN KEY (device_id) REFERENCES devices(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Build steps & firmware versions ──────────────────────────────────────────
-- Canonical hardware revisions per product type (e.g. EVSE "v2", AEMS "v1.3").
-- Build steps and firmware versions FK to this table so a single relabel
-- propagates everywhere.
CREATE TABLE IF NOT EXISTS product_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL CHECK (product_type IN ('AEMS', 'BEMS', 'EVSE', 'NETWORKING')),
  label TEXT NOT NULL,
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_type, label)
);
-- At most one default revision per product_type.
CREATE UNIQUE INDEX IF NOT EXISTS product_revisions_one_default
  ON product_revisions(product_type) WHERE is_default = TRUE;

-- Seed one default revision per product type so existing devices can be
-- matched without admin intervention. Only inserts when no revision exists
-- for that product_type — avoids the partial unique index (one default per
-- product_type) firing when an admin has already set their own default
-- under a different label.
INSERT INTO product_revisions (product_type, label, is_default)
SELECT pt, 'v1', TRUE
FROM (VALUES ('AEMS'), ('BEMS'), ('EVSE'), ('NETWORKING')) AS seed(pt)
WHERE NOT EXISTS (
  SELECT 1 FROM product_revisions pr WHERE pr.product_type = seed.pt
);

-- Firmware versions registered against a hardware revision.
-- At most one row per revision can have is_standard = TRUE.
CREATE TABLE IF NOT EXISTS firmware_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_revision_id UUID NOT NULL REFERENCES product_revisions(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  notes TEXT,
  is_standard BOOLEAN NOT NULL DEFAULT FALSE,
  released_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_revision_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS firmware_versions_one_standard
  ON firmware_versions(product_revision_id) WHERE is_standard = TRUE;

-- Authored build steps, ordered, per (revision, stage_key).
-- stage_key is one of the three stages that have walkthrough authoring.
-- sort_order is a hint; ties broken by created_at. No UNIQUE on it so we can
-- reorder without juggling negative offsets.
-- reference_photo_key holds a GCS object key when set (no-op in Phase A).
CREATE TABLE IF NOT EXISTS build_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_revision_id UUID REFERENCES product_revisions(id) ON DELETE CASCADE,
  stage_key TEXT CHECK (stage_key IN ('Assembly', 'Firmware', 'Calibration', 'QA', 'Staging')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  reference_photo_key TEXT,
  required_photo_count INTEGER NOT NULL DEFAULT 0 CHECK (required_photo_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- (The old (product_revision_id, stage_key) index was replaced by
-- idx_build_steps_set_order below, after instruction_set_id lands.)

-- Per-device per-step state. Lazily created on first interaction.
CREATE TABLE IF NOT EXISTS device_build_step_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE ON UPDATE CASCADE,
  build_step_id UUID NOT NULL REFERENCES build_steps(id) ON DELETE CASCADE,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ,
  checked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, build_step_id)
);
CREATE INDEX IF NOT EXISTS idx_dbss_device ON device_build_step_status(device_id);

-- Worker-captured proof photos. photo_key references a GCS object (Phase B).
CREATE TABLE IF NOT EXISTS build_step_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE ON UPDATE CASCADE,
  build_step_id UUID NOT NULL REFERENCES build_steps(id) ON DELETE CASCADE,
  photo_key TEXT NOT NULL,
  caption TEXT,
  taken_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bsp_device_step
  ON build_step_photos(device_id, build_step_id);

-- ── Per-device user-attributed notes ─────────────────────────────────────────
-- Replaces the legacy single `devices.notes` text column for the tech-notes
-- UI on the device details page. Each row is authored by a user; other techs
-- viewing the device see the full feed.
CREATE TABLE IF NOT EXISTS device_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(body) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_notes_device_created
  ON device_notes(device_id, created_at DESC);

-- ── Instruction sets + sub-steps ─────────────────────────────────────────────
-- An instruction_set groups the build_steps authored for a particular
-- (product_revision, stage_key). Admins iterate by creating a new set
-- (typically "v2") and activating it; in-flight devices keep using the
-- set they first interacted with (implicitly pinned through their
-- existing device_build_step_status rows, which FK to build_step_id).
CREATE TABLE IF NOT EXISTS instruction_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_revision_id UUID NOT NULL REFERENCES product_revisions(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL CHECK (stage_key IN ('Assembly', 'Firmware', 'Calibration', 'QA', 'Staging')),
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_revision_id, stage_key, label)
);
-- At most one active instruction set per (revision, stage).
CREATE UNIQUE INDEX IF NOT EXISTS idx_instruction_sets_one_active
  ON instruction_sets(product_revision_id, stage_key) WHERE is_active = TRUE;

-- Widen the stage_key CHECK constraint when an older one (Assembly/Firmware/
-- Calibration only) is still in place.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instruction_sets_stage_key_check'
      AND conrelid = 'inventory.instruction_sets'::regclass
      AND pg_get_constraintdef(oid) LIKE '%Calibration%'
      AND pg_get_constraintdef(oid) NOT LIKE '%QA%'
  ) THEN
    ALTER TABLE instruction_sets DROP CONSTRAINT instruction_sets_stage_key_check;
    ALTER TABLE instruction_sets ADD CONSTRAINT instruction_sets_stage_key_check
      CHECK (stage_key IN ('Assembly', 'Firmware', 'Calibration', 'QA', 'Staging'));
  END IF;
END $$;

-- Wire build_steps to an instruction_set. Existing rows keyed by
-- (product_revision_id, stage_key) get a default "v1" set created for them
-- and their FK back-filled.
ALTER TABLE build_steps ADD COLUMN IF NOT EXISTS instruction_set_id UUID
  REFERENCES instruction_sets(id) ON DELETE CASCADE;

DO $$
DECLARE
    r RECORD;
    new_set_id UUID;
BEGIN
    -- Only run when product_revision_id is still a column on build_steps
    -- (i.e. pre-migration state).
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory'
          AND table_name = 'build_steps'
          AND column_name = 'product_revision_id'
    ) THEN
        FOR r IN
            EXECUTE 'SELECT DISTINCT product_revision_id, stage_key
                     FROM build_steps
                     WHERE product_revision_id IS NOT NULL AND instruction_set_id IS NULL'
        LOOP
            INSERT INTO instruction_sets (product_revision_id, stage_key, label, is_active)
            VALUES (r.product_revision_id, r.stage_key, 'v1', TRUE)
            ON CONFLICT (product_revision_id, stage_key, label) DO NOTHING;

            SELECT id INTO new_set_id FROM instruction_sets
            WHERE product_revision_id = r.product_revision_id
              AND stage_key = r.stage_key
              AND label = 'v1';

            EXECUTE 'UPDATE build_steps
                     SET instruction_set_id = $1
                     WHERE product_revision_id = $2
                       AND stage_key = $3
                       AND instruction_set_id IS NULL'
              USING new_set_id, r.product_revision_id, r.stage_key;
        END LOOP;
    END IF;
END $$;

-- Lock the FK in now that everything's backfilled.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'inventory'
          AND table_name = 'build_steps'
          AND column_name = 'instruction_set_id'
          AND is_nullable = 'YES'
    ) AND NOT EXISTS (
        SELECT 1 FROM build_steps WHERE instruction_set_id IS NULL
    ) THEN
        ALTER TABLE build_steps ALTER COLUMN instruction_set_id SET NOT NULL;
    END IF;
END $$;

-- Drop the legacy denormalized columns once the FK is the source of truth.
ALTER TABLE build_steps DROP COLUMN IF EXISTS product_revision_id;
ALTER TABLE build_steps DROP COLUMN IF EXISTS stage_key;

CREATE INDEX IF NOT EXISTS idx_build_steps_set_order
  ON build_steps(instruction_set_id, sort_order, created_at);

-- Sub-steps: ordered children under each build_step. No own photo fields
-- (sub-step photos still attach to the parent build_step's quota).
CREATE TABLE IF NOT EXISTS build_sub_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_step_id UUID NOT NULL REFERENCES build_steps(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_build_sub_steps_parent
  ON build_sub_steps(build_step_id, sort_order, created_at);

-- ============================================================================
-- device_mcus: per-MCU identity + boot diagnostics
-- ============================================================================
--
-- A device can have N MCUs (1 for simple AEMS/BEMS, 2 for current EVSE pairs,
-- more for future products). Storing per-MCU data as a child table keeps the
-- `devices` row narrow and scales without schema migrations when a product
-- adds another microcontroller.
--
-- `role` is a free-form short string (e.g., "mcu1", "mcu2", "main") chosen by
-- the firmware. It identifies the MCU's position in the device, not its model
-- — that's `chip_type`. Unique per (device_id, role) so the same role can't
-- be reported twice for one device.
--
-- All diagnostic columns are nullable: not every MCU reports every field, and
-- early-product or partial-flash scenarios may carry only a subset.

CREATE TABLE IF NOT EXISTS device_mcus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    role TEXT NOT NULL,

    -- identity (canonical lookup keys)
    wifi_sta_mac TEXT NOT NULL,
    bt_mac TEXT,

    -- silicon
    chip_type TEXT,
    chip_revision INTEGER,

    -- flash
    flash_chip_id BIGINT,
    flash_size BIGINT,
    flash_mode TEXT,
    flash_freq_mhz INTEGER,

    -- psram
    psram_size BIGINT,
    psram_type TEXT,

    -- security posture at flash time
    secure_boot_enabled BOOLEAN,
    flash_encryption_enabled BOOLEAN,

    -- partition / firmware identity
    active_partition TEXT,
    project_name TEXT,
    app_version TEXT,
    elf_sha256 TEXT,
    idf_version TEXT,
    compile_date TEXT,
    compile_time TEXT,

    -- boot
    reset_reason INTEGER,
    initial_heap_free BIGINT,
    initial_largest_free_block BIGINT,

    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (device_id, role)
);

-- One MCU's MAC must be unique across the whole fleet. We lookup an incoming
-- provisioning POST by any MCU's MAC, so a global unique constraint keeps
-- accidental duplication impossible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_mcus_mac
    ON device_mcus (LOWER(wifi_sta_mac));

-- Cross-cutting queries — "show me every mcu1 on firmware X."
CREATE INDEX IF NOT EXISTS idx_device_mcus_role_fw
    ON device_mcus (role, app_version);

CREATE INDEX IF NOT EXISTS idx_device_mcus_device
    ON device_mcus (device_id);

-- ============================================================================
-- api_keys: per-user API keys for headless CLIs (flash tools, CI scripts)
-- ============================================================================
--
-- Replaces the single-shared-secret INVENTORY_API_KEY env var. Each operator
-- runs `flash_provision.py` once, completes Google OAuth in the browser, and
-- the server mints a long-lived key bound to their user record. Revocable
-- per-row without redeploying.
--
-- The plaintext key is shown to the caller exactly once at mint time; only a
-- SHA-256 hash is stored. `key_prefix` (first 8 chars) is kept un-hashed so
-- we can index the lookup and so admins can identify a key in audit logs
-- ("mfk_a3b4… last used 2 days ago") without exposing the secret.

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,             -- "flash-tool on stephan-mbp"
    key_prefix TEXT NOT NULL,       -- first 8 chars, displayed; uniqueness for index
    key_hash TEXT NOT NULL,         -- SHA-256 of the full plaintext key
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    UNIQUE (key_prefix)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- device_flash_logs + device_flash_log_lines
-- ============================================================================
--
-- Serial-console captures from flash_provision.py, parsed into one row per
-- ESP-IDF log line so the data is SQL-queryable ("every ERROR any MCU
-- emitted in the last 24h", "tag=gfi_monitor across the fleet", "any line
-- containing 'BROWNOUT'"). Each capture is also kept verbatim in
-- raw_bytes so the parser can be re-run later if the line grammar evolves.
--
-- We never drop log bytes on a parse failure — any line that doesn't match
-- the standard `[IWE] (boot_ms) tag: message` shape still becomes a row,
-- just with NULL parsed columns and the original text in `raw`.

CREATE TABLE IF NOT EXISTS device_flash_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    mcu_role TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Migrate the existing table shape: drop gcs_key (we no longer use object
-- storage for log bodies) and add line_count + raw_bytes. Each ALTER is
-- guarded by an existence check so re-running schema.sql on a fresh DB is
-- a no-op.
ALTER TABLE device_flash_logs DROP COLUMN IF EXISTS gcs_key;
ALTER TABLE device_flash_logs ADD COLUMN IF NOT EXISTS line_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE device_flash_logs ADD COLUMN IF NOT EXISTS raw_bytes BYTEA;

-- Newest-first for the device-detail UI's "Flash history" list.
CREATE INDEX IF NOT EXISTS idx_device_flash_logs_device_time
    ON device_flash_logs (device_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS device_flash_log_lines (
    id BIGSERIAL PRIMARY KEY,
    flash_log_id UUID NOT NULL REFERENCES device_flash_logs(id) ON DELETE CASCADE,
    -- device_id + mcu_role + captured_at are denormalized from the parent
    -- so cross-fleet queries don't pay a JOIN.
    device_id UUID NOT NULL,
    mcu_role TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    boot_ms BIGINT,             -- "(12345)" — ms since chip reset; NULL when unparsed
    level CHAR(1),              -- I/W/E/D; NULL when unparsed
    tag TEXT,                   -- "main_mcu1", "gfi_monitor", ...; NULL when unparsed
    message TEXT,               -- rest of the line after "tag: "; NULL when unparsed
    raw TEXT NOT NULL,          -- the verbatim line, never NULL
    captured_at TIMESTAMPTZ NOT NULL
);

-- Per-capture page-through ("show me lines 1..200 of this capture").
CREATE INDEX IF NOT EXISTS idx_flash_log_lines_capture
    ON device_flash_log_lines (flash_log_id, line_no);

-- Cross-cutting "tag=X / level=E in the last 24h" queries.
CREATE INDEX IF NOT EXISTS idx_flash_log_lines_tag_level
    ON device_flash_log_lines (tag, level, captured_at DESC);

-- Per-device history scans (the cross-cutting endpoint also accepts
-- device_id as a filter; this index makes that path fast on its own).
CREATE INDEX IF NOT EXISTS idx_flash_log_lines_device_time
    ON device_flash_log_lines (device_id, captured_at DESC);

-- Trigram GIN for cheap substring search on message. pg_trgm ships with
-- core Postgres + every managed offering we'd realistically deploy to,
-- but CREATE EXTENSION is guarded so DBs without it don't blow up on
-- startup; the index just won't be built and `q=` queries fall back to
-- a sequential LIKE scan.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS idx_flash_log_lines_message_trgm
      ON device_flash_log_lines USING GIN (message gin_trgm_ops);
  END IF;
END $$;
