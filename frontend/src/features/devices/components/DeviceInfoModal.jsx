import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';

import useAuth from '@/features/auth/useAuth';
import FirmwarePopCard from '@/features/devices/components/FirmwarePopCard';

/**
 * Per-MCU identity + boot-diagnostics modal opened by the Info button
 * on DeviceDetail. One tab per MCU; each tab shows MAC, BT MAC, chip
 * info, flash + PSRAM, firmware identity, build provenance, and an
 * "Advanced" disclosure for security posture, heap baselines, reset
 * reason, ELF SHA256.
 *
 * Firmware version comparison: hits GET /api/devices/firmware-latest
 * once per product_type and compares each MCU's app_version against
 * the latest GitHub release. Match → green; mismatch → red.
 */
export default function DeviceInfoModal({ device, onClose }) {
  const { authFetch } = useAuth();
  const mcus = useMemo(() => device?.mcus || [], [device]);
  const [activeRole, setActiveRole] = useState(mcus[0]?.role || null);
  const [latestRelease, setLatestRelease] = useState({
    loading: true, tracked: false, latest: null, release_url: null,
  });

  // Fetch latest release once when the modal mounts. Cached server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!device?.product_type) return;
      try {
        const r = await authFetch(
          `/api/devices/firmware-latest?product_type=${encodeURIComponent(device.product_type)}`
        );
        const data = r.ok ? await r.json() : { tracked: false, latest: null };
        if (!cancelled) setLatestRelease({ loading: false, ...data });
      } catch {
        if (!cancelled) setLatestRelease({ loading: false, tracked: false, latest: null });
      }
    })();
    return () => { cancelled = true; };
  }, [device?.product_type, authFetch]);

  const onKey = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (!device) return null;
  const activeMcu = mcus.find((m) => m.role === activeRole) || mcus[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, width: '100%',
          maxWidth: 720, maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderBottom: '1px solid #ece6d6',
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Device info
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              {device.device_name || device.serial_number || 'Device'}
            </h2>
          </div>
          <button
            type="button" aria-label="Close" onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: 6, borderRadius: 6, color: '#555',
            }}
          >
            <X size={18} />
          </button>
        </header>

        {/* Top-line summary that applies to the whole device. */}
        <section style={{ padding: '14px 20px', borderBottom: '1px solid #f1ecdc' }}>
          <SummaryGrid pairs={[
            ['Serial', device.serial_number],
            ['Device name', device.device_name],
            ['Product type', device.product_type],
            ['Stage', device.current_stage_name],
            ['Primary MAC', device.mac_address],
            ['Created', device.created_at && new Date(device.created_at).toLocaleString()],
          ]} />
        </section>

        {/* WiFi-commissioning PoP for EVSE — moved out of the commissioning
            flow since it's hardware-config metadata, not a stage action. */}
        {device.product_type === 'EVSE' && (
          <section style={{ padding: '14px 20px', borderBottom: '1px solid #f1ecdc' }}>
            <FirmwarePopCard device={device} />
          </section>
        )}

        {mcus.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>
            No MCU diagnostics captured yet. Run <code>flash_provision.py</code>
            against this device to populate per-MCU identity + diagnostics.
          </div>
        ) : (
          <>
            <nav
              role="tablist"
              style={{
                display: 'flex', borderBottom: '1px solid #ece6d6',
                padding: '0 12px', gap: 4,
              }}
            >
              {mcus.map((m) => (
                <TabButton
                  key={m.role}
                  active={m.role === activeRole}
                  onClick={() => setActiveRole(m.role)}
                  label={m.role.toUpperCase()}
                />
              ))}
            </nav>

            {activeMcu && (
              <McuTabContent
                mcu={activeMcu}
                latest={latestRelease}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: '10px 16px', border: 'none', background: 'transparent',
        cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500,
        color: active ? '#222' : '#888',
        borderBottom: active ? '2px solid #fcd01b' : '2px solid transparent',
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );
}

function McuTabContent({ mcu, latest }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div style={{ padding: '16px 20px' }}>
      <FirmwareVersionRow mcu={mcu} latest={latest} />

      <h4 style={sectionLabelStyle}>Identity</h4>
      <SummaryGrid pairs={[
        ['Wi-Fi MAC', mcu.wifi_sta_mac],
        ['BT MAC', mcu.bt_mac],
        ['Chip', mcu.chip_type && `${mcu.chip_type} rev ${mcu.chip_revision ?? '?'}`],
      ]} mono />

      <h4 style={sectionLabelStyle}>Flash + memory</h4>
      <SummaryGrid pairs={[
        ['Flash', formatBytes(mcu.flash_size)],
        ['Mode', mcu.flash_mode && `${mcu.flash_mode.toUpperCase()} @ ${mcu.flash_freq_mhz}MHz`],
        ['Flash chip ID', mcu.flash_chip_id && `0x${mcu.flash_chip_id.toString(16)}`],
        ['PSRAM', mcu.psram_size > 0 ? `${formatBytes(mcu.psram_size)} (${mcu.psram_type})` : '—'],
      ]} />

      <h4 style={sectionLabelStyle}>Firmware build</h4>
      <SummaryGrid pairs={[
        ['Project', mcu.project_name],
        ['App version', mcu.app_version],
        ['IDF version', mcu.idf_version],
        ['Compiled', mcu.compile_date && `${mcu.compile_date} ${mcu.compile_time}`],
        ['Active partition', mcu.active_partition],
      ]} mono />

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        style={{
          marginTop: 14, padding: '6px 0', fontSize: 12, color: '#666',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        {advancedOpen ? '▾' : '▸'} Advanced
      </button>
      {advancedOpen && (
        <div style={{ marginTop: 8 }}>
          <SummaryGrid pairs={[
            ['Secure boot', boolStr(mcu.secure_boot_enabled)],
            ['Flash encryption', boolStr(mcu.flash_encryption_enabled)],
            ['Reset reason', resetReasonStr(mcu.reset_reason)],
            ['Heap free', mcu.initial_heap_free && `${(mcu.initial_heap_free / 1024).toFixed(1)} KB`],
            ['Largest free block', mcu.initial_largest_free_block && `${(mcu.initial_largest_free_block / 1024).toFixed(1)} KB`],
            ['ELF SHA256', mcu.elf_sha256],
            ['Captured', mcu.captured_at && new Date(mcu.captured_at).toLocaleString()],
          ]} mono />
        </div>
      )}
    </div>
  );
}

function FirmwareVersionRow({ mcu, latest }) {
  const current = mcu.app_version;
  const latestTag = latest.latest;
  const tracked = latest.tracked;
  const matches = isVersionMatch(current, latestTag);

  // States: unknown (no data either side), tracked-matches (green),
  // tracked-mismatch (red), untracked (neutral grey).
  let bg, fg, border, label;
  if (latest.loading) {
    bg = '#f5f3eb'; fg = '#888'; border = '#ece6d6';
    label = 'Loading latest release...';
  } else if (!tracked) {
    bg = '#f5f3eb'; fg = '#888'; border = '#ece6d6';
    label = `No tracked release for ${mcu.project_name || 'this product'}`;
  } else if (!current) {
    bg = '#fef3c7'; fg = '#92400e'; border = '#fde68a';
    label = 'No app_version captured';
  } else if (matches === true) {
    bg = '#dcfce7'; fg = '#166534'; border = '#86efac';
    label = 'On latest release';
  } else if (matches === false) {
    bg = '#fee2e2'; fg = '#991b1b'; border = '#fca5a5';
    label = 'Behind latest release';
  } else {
    bg = '#f5f3eb'; fg = '#888'; border = '#ece6d6';
    label = '';
  }

  return (
    <div
      style={{
        background: bg, color: fg, border: `1px solid ${border}`,
        borderRadius: 8, padding: '10px 14px', marginBottom: 16,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--m5-font-mono)' }}>
        <span>
          <span style={{ opacity: 0.7 }}>this device:</span>{' '}
          <strong>{current || '—'}</strong>
        </span>
        <span style={{ opacity: 0.5 }}>vs</span>
        <span>
          <span style={{ opacity: 0.7 }}>latest:</span>{' '}
          <strong>{latestTag || (latest.loading ? '…' : '—')}</strong>
          {latest.release_url && (
            <a
              href={latest.release_url}
              target="_blank" rel="noreferrer"
              style={{ color: 'inherit', marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}
            >
              <ExternalLink size={12} />
            </a>
          )}
        </span>
      </div>
    </div>
  );
}

function SummaryGrid({ pairs, mono = false }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '8px 20px', fontSize: 12.5,
      }}
    >
      {pairs.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 6, minWidth: 0 }}>
          <span style={{ color: '#888', flexShrink: 0 }}>{label}:</span>
          <span
            style={{
              color: '#222',
              fontFamily: mono ? 'var(--m5-font-mono)' : 'inherit',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={String(value ?? '')}
          >
            {value || '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

const sectionLabelStyle = {
  margin: '14px 0 6px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#999',
};

function formatBytes(b) {
  if (!b) return null;
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb} MB` : `${(b / 1024).toFixed(1)} KB`;
}

function boolStr(b) {
  if (b === null || b === undefined) return null;
  return b ? 'enabled' : 'disabled';
}

const RESET_REASONS = {
  0: 'UNKNOWN', 1: 'POWERON', 2: 'EXT', 3: 'SW', 4: 'PANIC',
  5: 'INT_WDT', 6: 'TASK_WDT', 7: 'WDT', 8: 'DEEPSLEEP',
  9: 'BROWNOUT', 10: 'SDIO',
};
function resetReasonStr(r) {
  if (r === null || r === undefined) return null;
  return `${RESET_REASONS[r] || '?'} (${r})`;
}

// Tag comparison that strips a leading 'v'/'V' so 'v1.2.3' matches '1.2.3'.
// Returns true/false/null (null when either side is missing).
function isVersionMatch(current, latest) {
  if (!current || !latest) return null;
  const norm = (s) => (s.startsWith('v') || s.startsWith('V')) ? s.slice(1) : s;
  return norm(current) === norm(latest);
}
