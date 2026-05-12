import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, ExternalLink, RotateCw } from 'lucide-react';
import useAuth from '@/features/auth/useAuth';

const MASKED = 'mfp_••••••••••••••••••••••••••';

const INSTALLER_APP_URL =
  import.meta.env.VITE_INSTALLER_APP_URL || 'moonfive-installer://device';

function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older browsers.
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/**
 * Renders the WiFi-commissioning PoP card on the Firmware stage of a CHARGER
 * device. The value is never auto-fetched — the user must click Reveal, which
 * adds an audit-log row.
 *
 * Role gating: visible to admin/technician/installer; admin gets a Rotate button.
 */
export default function FirmwarePopCard({ device }) {
  const { user, authFetch } = useAuth();
  const role = user?.role;

  const [pop, setPop] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  // Should never render this card for a non-CHARGER device or a viewer.
  if (!device || device.product_type !== 'CHARGER') return null;
  if (!role || role === 'viewer') return null;

  const isAdmin = role === 'admin';

  async function reveal() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/devices/${device.mac_address}/pop`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || `Failed to fetch PoP (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      setPop(data.pop);
      setGeneratedAt(data.pop_generated_at);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function rotate() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/devices/${device.mac_address}/pop`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || `Failed to rotate PoP (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      setPop(data.pop);
      setGeneratedAt(data.pop_generated_at);
      setConfirmingRotate(false);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  function openInInstallerApp() {
    window.location.href = `${INSTALLER_APP_URL}/${device.mac_address}`;
  }

  async function handleCopy() {
    if (!pop) return;
    try {
      await copyText(pop);
      setCopied(true);
    } catch {
      /* clipboard errors are non-fatal */
    }
  }

  return (
    <div className="sec firmware-pop" data-testid="firmware-pop-card">
      <div className="sh">
        <h3>
          <span className="yb" />
          WiFi commissioning PoP
        </h3>
        <span className="sub">Pulled by the installer app over BLE</span>
      </div>

      {error && (
        <div className="pop-error" role="alert">
          {error}
          <button type="button" className="rev-save" onClick={reveal}>
            Retry
          </button>
        </div>
      )}

      {!error && (
        <div className="pop-revealed">
          <div className="pop-value-row">
            <code
              className="pop-value"
              data-testid="firmware-pop-value"
              aria-label={pop ? 'PoP value' : 'PoP value (hidden)'}
            >
              {pop || MASKED}
            </code>
            <button
              type="button"
              className="pop-icon-btn"
              onClick={pop ? () => setPop(null) : reveal}
              disabled={loading}
              aria-label={pop ? 'Hide PoP' : 'Reveal PoP'}
              title={pop ? 'Hide PoP' : 'Reveal PoP'}
            >
              {pop ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {pop && (
              <button
                type="button"
                className="pop-icon-btn"
                onClick={handleCopy}
                aria-label={copied ? 'PoP copied to clipboard' : 'Copy PoP to clipboard'}
                title={copied ? 'Copied' : 'Copy'}
              >
                <Copy size={14} />
              </button>
            )}
            <button
              type="button"
              className="pop-icon-btn"
              onClick={openInInstallerApp}
              aria-label="Open in Installer App"
              title="Open in Installer App"
            >
              <ExternalLink size={14} />
            </button>
            {isAdmin && !confirmingRotate && (
              <button
                type="button"
                className="pop-icon-btn"
                onClick={() => setConfirmingRotate(true)}
                aria-label="Rotate PoP"
                title="Rotate PoP"
              >
                <RotateCw size={14} />
              </button>
            )}
          </div>
          {pop && !confirmingRotate && (
            <div className="pop-meta">Generated {formatTimestamp(generatedAt)}</div>
          )}
          {isAdmin && confirmingRotate && (
            <div className="pop-confirm">
              Rotating invalidates the previous PoP. The device must be
              re-flashed or re-fetched.
              <button
                type="button"
                className="rev-save"
                onClick={rotate}
                disabled={loading}
              >
                Confirm rotate
              </button>
              <button
                type="button"
                className="rev-save"
                onClick={() => setConfirmingRotate(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
