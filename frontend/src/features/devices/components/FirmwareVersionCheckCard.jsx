import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, ExternalLink, HelpCircle } from 'lucide-react';
import useAuth from '@/features/auth/useAuth';
import FlashLogViewer from '@/features/devices/components/FlashLogViewer';

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
export default function FirmwareVersionCheckCard({ device, audit }) {
  const { authFetch } = useAuth();

  const [latest, setLatest] = useState({
    loading: true, tracked: false, latest: null, release_url: null, repo: null,
  });
  // Per-MCU flash captures, used both for the inline expandable history
  // under each row and for the "View" button that opens FlashLogViewer.
  const [flashLogs, setFlashLogs] = useState({ loading: true, logs: [] });
  // captureId currently rendered in the per-capture log viewer modal.
  const [viewingCaptureId, setViewingCaptureId] = useState(null);

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

  const loadFlashLogs = useCallback(async () => {
    if (!device?.id) return;
    try {
      const r = await authFetch(`/api/devices/${device.id}/flash-logs`);
      const data = r.ok ? await r.json() : { logs: [] };
      setFlashLogs({ loading: false, logs: data.logs || [] });
    } catch {
      setFlashLogs({ loading: false, logs: [] });
    }
  }, [device?.id, authFetch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFlashLogs(); }, [loadFlashLogs]);

  const mcus = device?.mcus || [];
  // Group captures by role so each expandable row only sees its own.
  const logsByRole = useMemo(() => {
    const out = {};
    for (const l of flashLogs.logs) {
      (out[l.mcu_role] = out[l.mcu_role] || []).push(l);
    }
    return out;
  }, [flashLogs.logs]);

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

      <FlashedByLine audit={audit} />

      {/* Always-visible per-MCU flash history. Each capture row is itself
          clickable to drill into the parsed-line viewer; no expand step. */}
      <h4 style={historyHeading}>Flash history</h4>
      <FlashHistorySection
        mcus={mcus}
        logsByRole={logsByRole}
        loading={flashLogs.loading}
        onView={(captureId) => setViewingCaptureId(captureId)}
      />

      {viewingCaptureId && (
        <FlashLogViewer
          captureId={viewingCaptureId}
          deviceId={device.id}
          onClose={() => setViewingCaptureId(null)}
        />
      )}
    </div>
  );
}

const historyHeading = {
  margin: '20px 0 6px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#999',
};

function FlashHistorySection({ mcus, logsByRole, loading, onView }) {
  if (loading) {
    return <div style={{ fontSize: 12.5, color: '#888' }}>Loading captures…</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
      {mcus.map((m) => {
        const captures = logsByRole[m.role] || [];
        return (
          <div key={m.role}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, color: '#666', marginBottom: 4,
            }}>
              <span style={roleBadgeStyle}>{m.role.toUpperCase()}</span>
              {captures.length === 0 && (
                <span style={{ color: '#888', fontStyle: 'italic' }}>
                  no captures yet — run flash_provision.py {m.role} to record one
                </span>
              )}
            </div>
            {captures.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {captures.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onView(l.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '8px 10px', background: '#fafaf6',
                      border: '1px solid #ece6d6', borderRadius: 6, fontSize: 12.5,
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--m5-font-mono)' }}>
                        {new Date(l.captured_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {l.line_count != null ? `${l.line_count} lines` : null}
                        {l.byte_size != null && (
                          <> · {formatBytes(l.byte_size) || `${l.byte_size} B`}</>
                        )}
                        {l.uploaded_by_email && (
                          <> · uploaded by <strong>{l.uploaded_by_email}</strong></>
                        )}
                      </div>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12, color: '#555',
                    }}>
                      <Eye size={12} /> view log
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pulls the most recent provision/reflash entry out of the audit log and
 * renders an "Owner" line — replaces the per-stage Owner cell on the
 * Firmware stage, since both MCU flashes are realistically done by the
 * same person and the audit log knows who.
 */
function FlashedByLine({ audit }) {
  const entry = (audit || [])
    .filter((e) => e.action === 'provisioned_from_flash_tool' || e.action === 'reflashed')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (!entry) return null;
  const who = entry.user_name || entry.user_email || (
    entry.new_value?.via === 'api_key_env'
      ? 'service:flash-tool (env-var key)'
      : '—'
  );
  return (
    <div
      style={{
        marginTop: 12,
        padding: '8px 0 0',
        borderTop: '1px solid #f4f0e2',
        fontSize: 12.5,
        color: '#555',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
      }}
    >
      <span style={{ color: '#888' }}>Last flashed by</span>
      <strong style={{ color: '#222' }}>{who}</strong>
      <span style={{ color: '#888' }}>on</span>
      <span style={{ fontFamily: 'var(--m5-font-mono)' }}>
        {new Date(entry.created_at).toLocaleString()}
      </span>
      {entry.action === 'reflashed' && (
        <span style={{
          marginLeft: 6,
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          background: '#fef3c7',
          color: '#92400e',
          padding: '2px 6px',
          borderRadius: 4,
        }}>
          reflash
        </span>
      )}
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

function formatBytes(b) {
  if (b == null) return null;
  const kb = b / 1024;
  if (kb < 1) return `${b} B`;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
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
