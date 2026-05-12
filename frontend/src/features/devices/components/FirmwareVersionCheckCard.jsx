import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Pencil, Check, X, HelpCircle } from 'lucide-react';
import useAuth from '@/features/auth/useAuth';

const HELP_TEXT =
  'Compares this device\'s firmware_version against the latest release tag ' +
  'on the product\'s firmware repo (BEMS → moon-five-technologies/OllieDriver, ' +
  'EVSE → moon-five-technologies/argo). Cached for an hour.';

/**
 * Compares this device's firmware_version against the latest GitHub release
 * for its product type (BEMS → OllieDriver, EVSE → argo). Hidden for
 * untracked product types. Lets admin/technician record a reason when the
 * device is intentionally on an older build.
 *
 * Backend: GET /api/devices/{id}/firmware-status. Saving a reason PATCHes
 * /api/devices/{id} with `firmware_deviation_reason`.
 */
export default function FirmwareVersionCheckCard({ deviceId, currentUser }) {
  const { authFetch } = useAuth();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'technician';

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/devices/${deviceId}/firmware-status`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setStatus(data);
      setDraft(data.deviation_reason || '');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [deviceId, authFetch]);

  useEffect(() => { load(); }, [load]);

  async function saveReason() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/devices/${deviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmware_deviation_reason: draft.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `${res.status} ${res.statusText}`);
      }
      setStatus((s) => ({ ...s, deviation_reason: draft.trim() }));
      setEditing(false);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setDraft(status?.deviation_reason || '');
    setEditing(false);
  }

  if (loading) {
    return (
      <div className="sec firmware-check" data-testid="firmware-check-loading">
        <div className="sh"><h3>Firmware version</h3></div>
        <div className="muted">Checking…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sec firmware-check" data-testid="firmware-check-error">
        <div className="sh"><h3>Firmware version</h3></div>
        <div className="pop-error" role="alert">
          {error.message || 'Failed to load firmware status.'}
          <button type="button" className="rev-save" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  // Untracked product type — render nothing. DeviceDetail also gates on
  // product_type, but this is a safe second line of defense if the card is
  // ever mounted for an unmapped product.
  if (!status || status.tracked === false) {
    return null;
  }

  const { current, latest, is_latest: isLatest, repo, release_url: releaseUrl, deviation_reason: reason } = status;

  let badge;
  let badgeTone;
  if (current == null) {
    badge = 'Not recorded';
    badgeTone = 'neutral';
  } else if (latest == null) {
    badge = 'Latest unknown';
    badgeTone = 'neutral';
  } else if (isLatest) {
    badge = `On latest (${latest})`;
    badgeTone = 'good';
  } else {
    badge = 'Out of date';
    badgeTone = 'bad';
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
        <span className={`sub firmware-check-badge firmware-check-badge--${badgeTone}`}>
          {badge}
        </span>
      </div>

      <dl className="firmware-check-grid">
        <div>
          <dt>Device</dt>
          <dd data-testid="firmware-check-current">
            {current || <span className="muted">— not set —</span>}
          </dd>
        </div>
        <div>
          <dt>Latest release</dt>
          <dd data-testid="firmware-check-latest">
            {latest ? (
              <a href={releaseUrl} target="_blank" rel="noreferrer">
                {latest} <ExternalLink size={12} aria-hidden />
              </a>
            ) : (
              <span className="muted">unavailable</span>
            )}
            {repo && (
              <div className="muted firmware-check-repo">
                <a href={`https://github.com/${repo}/releases`} target="_blank" rel="noreferrer">
                  {repo}
                </a>
              </div>
            )}
          </dd>
        </div>
      </dl>

      {/* Deviation-reason block: shown when the device is verifiably not on
          the latest. We don't surface it when latest is unknown — that'd be
          misleading. */}
      {isLatest === false && (
        <div className="firmware-deviation">
          <div className="firmware-deviation-label">
            Reason for being on {current}
            {canEdit && !editing && (
              <button
                type="button"
                className="rev-save firmware-deviation-edit"
                onClick={() => setEditing(true)}
                aria-label={reason ? 'Edit deviation reason' : 'Add deviation reason'}
              >
                <Pencil size={12} aria-hidden /> {reason ? 'Edit' : 'Add'}
              </button>
            )}
          </div>

          {editing ? (
            <div className="firmware-deviation-editor">
              <textarea
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Why is this device on an older build?"
                disabled={saving}
                data-testid="firmware-deviation-textarea"
              />
              <div className="firmware-deviation-actions">
                <button
                  type="button"
                  className="rev-save"
                  onClick={saveReason}
                  disabled={saving}
                >
                  <Check size={12} aria-hidden /> Save
                </button>
                <button
                  type="button"
                  className="rev-save firmware-deviation-cancel"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  <X size={12} aria-hidden /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="firmware-deviation-text" data-testid="firmware-deviation-text">
              {reason || <span className="muted">No reason recorded yet.</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
