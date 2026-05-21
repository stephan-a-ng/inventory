import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, HelpCircle } from 'lucide-react';
import useAuth from '@/features/auth/useAuth';

const HELP_TEXT =
  'Compares each MCU\'s app_version against the latest release tag on the ' +
  'product\'s firmware repo (EVSE → moon-five-technologies/argo, BEMS → ' +
  'moon-five-technologies/OllieDriver). Cached for an hour.';

/**
 * Per-MCU firmware comparison. Renders one row per `device.mcus[]` entry —
 * role, this device's app_version, the latest GitHub release for the product
 * type, flashed-at timestamp, status badge (green = on latest, red = behind,
 * amber = no app_version captured, grey = no tracked release).
 *
 * Falls back to a single "no diagnostics captured" hint for devices that
 * have never been provisioned through flash_provision.py.
 */
export default function FirmwareVersionCheckCard({ device }) {
  const { authFetch } = useAuth();

  const [latest, setLatest] = useState({
    loading: true, tracked: false, latest: null, release_url: null, repo: null,
  });

  const load = useCallback(async () => {
    if (!device?.product_type) return;
    try {
      const r = await authFetch(
        `/api/devices/firmware-latest?product_type=${encodeURIComponent(device.product_type)}`,
      );
      const data = r.ok ? await r.json() : { tracked: false, latest: null };
      setLatest({ loading: false, ...data });
    } catch {
      setLatest({ loading: false, tracked: false, latest: null });
    }
  }, [device?.product_type, authFetch]);

  useEffect(() => { load(); }, [load]);

  const mcus = device?.mcus || [];

  if (latest.loading) {
    return (
      <div className="sec firmware-check" data-testid="firmware-check-loading">
        <div className="sh"><h3>Firmware version</h3></div>
        <div className="muted">Checking latest release…</div>
      </div>
    );
  }

  if (mcus.length === 0) {
    return (
      <div className="sec firmware-check" data-testid="firmware-check-empty">
        <div className="sh">
          <h3>
            Firmware version
            <span
              className="firmware-check-help"
              tabIndex={0}
              aria-label={HELP_TEXT}
              title={HELP_TEXT}
            >
              <HelpCircle size={14} aria-hidden />
            </span>
          </h3>
        </div>
        <div className="muted">
          No per-MCU diagnostics captured yet. Run <code>flash_provision.py</code> on
          a connected MCU to populate the firmware version on the device record.
        </div>
      </div>
    );
  }

  return (
    <div className="sec firmware-check" data-testid="firmware-check-card">
      <div className="sh">
        <h3>
          Firmware version
          <span
            className="firmware-check-help"
            tabIndex={0}
            aria-label={HELP_TEXT}
            title={HELP_TEXT}
            data-testid="firmware-check-help"
          >
            <HelpCircle size={14} aria-hidden />
          </span>
        </h3>
        {latest.repo && (
          <a
            href={`https://github.com/${latest.repo}/releases`}
            target="_blank" rel="noreferrer"
            className="sub firmware-check-repo"
            style={{ color: 'inherit' }}
          >
            {latest.repo}
          </a>
        )}
      </div>

      <table className="firmware-mcu-table" style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>MCU</th>
            <th style={thStyle}>This device</th>
            <th style={thStyle}>Latest release</th>
            <th style={thStyle}>Flashed</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {mcus.map((m) => (
            <McuFirmwareRow key={m.role} mcu={m} latest={latest} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function McuFirmwareRow({ mcu, latest }) {
  const current = mcu.app_version;
  const matches = isVersionMatch(current, latest.latest);

  let chipBg, chipFg, chipBorder, chipLabel;
  if (!latest.tracked) {
    chipBg = '#f1ecdc'; chipFg = '#666'; chipBorder = '#dfd6bf'; chipLabel = 'untracked';
  } else if (!current) {
    chipBg = '#fef3c7'; chipFg = '#92400e'; chipBorder = '#fde68a'; chipLabel = 'no version';
  } else if (matches === true) {
    chipBg = '#dcfce7'; chipFg = '#166534'; chipBorder = '#86efac'; chipLabel = 'on latest';
  } else if (matches === false) {
    chipBg = '#fee2e2'; chipFg = '#991b1b'; chipBorder = '#fca5a5'; chipLabel = 'behind';
  } else {
    chipBg = '#f1ecdc'; chipFg = '#666'; chipBorder = '#dfd6bf'; chipLabel = 'unknown';
  }

  // Row tint matches the chip so the at-a-glance scan is obvious.
  const rowBg = matches === true ? 'rgba(220,252,231,0.45)'
    : matches === false ? 'rgba(254,226,226,0.45)'
    : 'transparent';

  return (
    <tr style={{ background: rowBg }}>
      <td style={{ ...tdStyle, fontWeight: 600 }}>
        <span style={roleBadgeStyle}>{mcu.role.toUpperCase()}</span>
      </td>
      <td style={{ ...tdStyle, fontFamily: 'var(--m5-font-mono)' }}>
        {current || <span className="muted">—</span>}
      </td>
      <td style={{ ...tdStyle, fontFamily: 'var(--m5-font-mono)' }}>
        {latest.latest ? (
          <a href={latest.release_url} target="_blank" rel="noreferrer"
             style={{ color: 'inherit', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {latest.latest} <ExternalLink size={11} aria-hidden />
          </a>
        ) : (
          <span className="muted">unavailable</span>
        )}
      </td>
      <td style={{ ...tdStyle, fontFamily: 'var(--m5-font-mono)', fontSize: '12px' }}>
        {mcu.captured_at ? new Date(mcu.captured_at).toLocaleString() : '—'}
      </td>
      <td style={tdStyle}>
        <span style={{
          display: 'inline-block',
          background: chipBg,
          color: chipFg,
          border: `1px solid ${chipBorder}`,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {chipLabel}
        </span>
      </td>
    </tr>
  );
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 8,
};

const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#888',
  borderBottom: '1px solid #ece6d6',
};

const tdStyle = {
  padding: '10px 10px',
  borderBottom: '1px solid #f4f0e2',
  fontSize: 13,
  verticalAlign: 'middle',
};

const roleBadgeStyle = {
  background: '#222',
  color: 'white',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  padding: '3px 8px',
  borderRadius: 4,
  textTransform: 'uppercase',
};

function isVersionMatch(current, latest) {
  if (!current || !latest) return null;
  const norm = (s) => (s.startsWith('v') || s.startsWith('V')) ? s.slice(1) : s;
  return norm(current) === norm(latest);
}
