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
  UPDATE subsystems SET product_type = 'EVSE' WHERE product_type = 'CHARGER';

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
    ('AEMS', 'Assembly', 1, 'Hardware assembly and initial inspection'),
    ('AEMS', 'Firmware', 2, 'Firmware flashing and configuration'),
    ('AEMS', 'Calibration', 3, 'Sensor calibration and verification'),
    ('AEMS', 'QA', 4, 'Quality assurance testing'),
    ('AEMS', 'Staging', 5, 'Staged and ready for deployment'),
    ('AEMS', 'Deployed', 6, 'Deployed to production site'),
    ('BEMS', 'Assembly', 1, 'Hardware assembly and initial inspection'),
    ('BEMS', 'Firmware', 2, 'Firmware flashing and configuration'),
    ('BEMS', 'Calibration', 3, 'Sensor calibration and verification'),
    ('BEMS', 'QA', 4, 'Quality assurance testing'),
    ('BEMS', 'Staging', 5, 'Staged and ready for deployment'),
    ('BEMS', 'Deployed', 6, 'Deployed to production site'),
    ('EVSE', 'Assembly', 1, 'Hardware assembly and initial inspection'),
    ('EVSE', 'Firmware', 2, 'Firmware flashing and configuration'),
    ('EVSE', 'Calibration', 3, 'Sensor calibration and verification'),
    ('EVSE', 'QA', 4, 'Quality assurance testing'),
    ('EVSE', 'Staging', 5, 'Staged and ready for deployment'),
    ('EVSE', 'Deployed', 6, 'Deployed to production site'),
    ('NETWORKING', 'Assembly', 1, 'Hardware assembly and initial inspection'),
    ('NETWORKING', 'Firmware', 2, 'Firmware flashing and configuration'),
    ('NETWORKING', 'Calibration', 3, 'Sensor calibration and verification'),
    ('NETWORKING', 'QA', 4, 'Quality assurance testing'),
    ('NETWORKING', 'Staging', 5, 'Staged and ready for deployment'),
    ('NETWORKING', 'Deployed', 6, 'Deployed to production site')
ON CONFLICT DO NOTHING;

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
