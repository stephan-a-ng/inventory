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
    product_type TEXT NOT NULL CHECK (product_type IN ('AEMS', 'BEMS', 'CHARGER', 'NETWORKING')),
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
    product_type TEXT NOT NULL CHECK (product_type IN ('AEMS', 'BEMS', 'CHARGER', 'NETWORKING')),
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
    ('CHARGER', 'Assembly', 1, 'Hardware assembly and initial inspection'),
    ('CHARGER', 'Firmware', 2, 'Firmware flashing and configuration'),
    ('CHARGER', 'Calibration', 3, 'Sensor calibration and verification'),
    ('CHARGER', 'QA', 4, 'Quality assurance testing'),
    ('CHARGER', 'Staging', 5, 'Staged and ready for deployment'),
    ('CHARGER', 'Deployed', 6, 'Deployed to production site'),
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
  ('CHARGER', 'EVSE', 1),
  ('CHARGER', 'LoRa Hat', 2)
ON CONFLICT (product_type, name) DO NOTHING;
