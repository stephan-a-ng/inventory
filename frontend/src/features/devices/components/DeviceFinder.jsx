import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, Plus, ArrowRight, X } from 'lucide-react';

import useDeviceStore from '@/features/devices/stores/deviceStore';
import { PRODUCT_TYPES, PRODUCT_DESC, labelFor } from '@/features/devices/lib/productTypes';

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

// MoonFive's first product line in the picker is the EVSE (CHARGER) since
// charger units are the highest-volume registration on the dashboard.
const PICK_ORDER = ['CHARGER', 'AEMS', 'BEMS', 'NETWORKING'];

export default function DeviceFinder() {
  const navigate = useNavigate();
  const { lookupByMac, registerDevice, fetchStats, fetchRecentAudit } = useDeviceStore();

  const [mode, setMode] = useState('idle'); // idle | manual | found | notfound
  const [mac, setMac] = useState('');
  const [found, setFound] = useState(null);
  const [type, setType] = useState('CHARGER');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setMode('idle');
    setMac('');
    setFound(null);
    setType('CHARGER');
    setError('');
    setBusy(false);
  }

  async function submitManual() {
    const trimmed = mac.trim();
    if (!trimmed) return;
    if (!MAC_RE.test(trimmed)) {
      setError('MAC must look like AA:BB:CC:DD:EE:FF');
      return;
    }
    setError('');
    setBusy(true);
    const result = await lookupByMac(trimmed);
    setBusy(false);
    if (result.device) {
      setFound(result.device);
      setMode('found');
    } else if (result.notFound) {
      setMac(result.mac);
      setMode('notfound');
    } else {
      setError(result.error || 'lookup failed');
    }
  }

  async function doRegister() {
    setBusy(true);
    setError('');
    try {
      const created = await registerDevice({ mac_address: mac, product_type: type });
      // Refresh dashboard data so the new device shows up in the stage counts + feed.
      fetchStats();
      fetchRecentAudit();
      navigate(`/devices/${created.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="action">
      <div className="lbl">Find or register a device</div>
      <h2>Scan or enter a MAC.</h2>
      <p>If it's in inventory, we'll open it. If not, we'll register it as new.</p>

      {mode === 'idle' && (
        <>
          <div className="add-entry">
            <button className="add-scan" onClick={() => navigate('/scanner')}>
              <span className="qr-ico">
                <QrCode size={28} strokeWidth={2} />
              </span>
              Scan
              <span className="scan-sub">QR → MAC</span>
            </button>
            <button className="add-plus" onClick={() => setMode('manual')} title="Enter manually">
              <Plus size={22} strokeWidth={2.4} />
            </button>
          </div>
          <div className="hint">
            Tip · point the camera at the QR on the unit, or press <span className="k">+</span> to type a MAC
          </div>
        </>
      )}

      {mode === 'manual' && (
        <>
          <div className="add-entry">
            <div className="add-manual">
              <span className="lbl">MAC</span>
              <input
                autoFocus
                placeholder="A4:CF:12:8B:3D:E2"
                value={mac}
                onChange={(e) => {
                  setMac(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitManual();
                  if (e.key === 'Escape') reset();
                }}
              />
            </div>
            <button
              className="add-x"
              onClick={() => (mac.trim() ? submitManual() : reset())}
              title={mac.trim() ? 'Continue' : 'Cancel'}
              disabled={busy}
            >
              {mac.trim() ? <ArrowRight size={22} strokeWidth={2.4} /> : <X size={20} strokeWidth={2.4} />}
            </button>
          </div>
          {error && <div className="lookup-error">{error}</div>}
          {!error && (
            <div className="hint">
              Press <span className="k">Enter</span> to look up · <span className="k">Esc</span> to cancel
            </div>
          )}
        </>
      )}

      {mode === 'found' && found && (
        <>
          <div className="step-label">Match found · already in inventory</div>
          <div className="found-card">
            <div>
              <div className="lbl">Device</div>
              <div className="dev-name">{found.device_name || found.serial_number || 'Unnamed device'}</div>
              <div className="dev-mac">{found.mac_address}</div>
              <div className="dev-meta">
                <div>
                  <div className="lbl">Type</div>
                  <div className="v">
                    <span className="pill">{labelFor(found.product_type)}</span>
                  </div>
                </div>
                <div>
                  <div className="lbl">Stage</div>
                  <div className="v">{found.current_stage_name || '—'}</div>
                </div>
                {found.firmware_version && (
                  <div>
                    <div className="lbl">Firmware</div>
                    <div className="v" style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 14 }}>
                      {found.firmware_version}
                    </div>
                  </div>
                )}
                {found.site_name && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div className="lbl">Site</div>
                    <div className="v">{found.site_name}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="badge">● Active</div>
            <div className="open">
              <button
                className="btn-add"
                style={{ height: 48, fontSize: 15, width: 'auto', flex: 1, maxWidth: 320 }}
                onClick={() => navigate(`/devices/${found.id}`)}
              >
                Open device
                <span className="arrow">
                  <ArrowRight size={16} strokeWidth={2.4} />
                </span>
              </button>
              <button className="btn-cancel" onClick={reset} style={{ padding: '0 16px' }}>
                ← New search
              </button>
            </div>
          </div>
        </>
      )}

      {mode === 'notfound' && (
        <>
          <div className="nf-prompt">
            <div>
              <div className="lbl">Not in inventory</div>
              <div className="msg">
                <span className="mac-pill">{mac}</span> isn't registered yet. Add it?
              </div>
            </div>
          </div>
          <div className="step-label">Pick product line to register</div>
          <div className="type-pick">
            {PICK_ORDER.map((pt) => (
              <button
                key={pt}
                className={type === pt ? 'on' : ''}
                onClick={() => setType(pt)}
              >
                <span className="t-name">{labelFor(pt)}</span>
                <span className="t-desc">{PRODUCT_DESC[pt]}</span>
              </button>
            ))}
          </div>
          <button className="btn-add" onClick={doRegister} disabled={busy}>
            {busy ? 'Registering…' : `Register as ${labelFor(type)}`}
            <span className="arrow">
              <ArrowRight size={16} strokeWidth={2.4} />
            </span>
          </button>
          {error && <div className="lookup-error">{error}</div>}
          <button className="btn-cancel" onClick={reset}>← Cancel</button>
        </>
      )}
    </div>
  );
}
