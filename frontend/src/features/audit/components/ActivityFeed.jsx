/**
 * Dashboard activity feed — cross-device recent audit rows.
 *
 * Expects entries shaped by `GET /api/audit`:
 *   { id, action, created_at, user_email, user_name,
 *     device_mac, device_name, device_product_type,
 *     old_value, new_value }
 *
 * Renders the design's 4-column row: time · who · what · tag.
 * Visual styles live in features/devices/pages/Dashboard.css under `.dashboard-v2`.
 */
import { ExternalLink } from 'lucide-react';

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatWho(entry) {
  if (entry.user_name) {
    const parts = entry.user_name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}.`.toUpperCase();
    return entry.user_name.toUpperCase();
  }
  if (entry.user_email) return entry.user_email.split('@')[0].toUpperCase();
  return 'SYSTEM';
}

function actionTag(action) {
  switch (action) {
    case 'stage_changed': return 'STAGE';
    case 'created': return 'CREATED';
    case 'updated': return 'UPDATE';
    case 'deleted': return 'DELETE';
    case 'bulk_import': return 'IMPORT';
    case 'bulk_stage_change': return 'BULK';
    default: return action.replace(/_/g, ' ').toUpperCase();
  }
}

function deviceRef(entry) {
  // Prefer a human-readable device name, fall back to MAC chip.
  if (entry.device_name) return <span className="to">{entry.device_name}</span>;
  if (entry.device_mac) return <span className="mac">{entry.device_mac}</span>;
  return <span className="mac">device {entry.device_id?.slice(0, 8) || '?'}</span>;
}

function describe(entry) {
  const { action, old_value, new_value } = entry;
  const dev = deviceRef(entry);

  if (action === 'stage_changed') {
    const from = old_value?.stage_name;
    const to = new_value?.stage_name || new_value?.stage_id;
    return (
      <>
        Moved {dev}{' '}
        {from && (
          <>
            <span className="from">{from}</span>
            <span className="arrow-glyph">→</span>
          </>
        )}
        {to && <span className="to">{to}</span>}
      </>
    );
  }

  if (action === 'created') {
    return (
      <>
        Registered {dev} as <span className="to">{new_value?.product_type || 'device'}</span>
      </>
    );
  }

  if (action === 'updated') {
    const fields = Object.keys(new_value || {}).join(', ');
    return (
      <>
        Updated {dev}
        {fields && <> · <span className="from">{fields}</span></>}
      </>
    );
  }

  if (action === 'deleted') {
    return <span className="flag">Deleted {dev}</span>;
  }

  return (
    <>
      {action.replace(/_/g, ' ')} {dev}
    </>
  );
}

export default function ActivityFeed({ entries = [], onViewAll }) {
  return (
    <section>
      <div className="activity-head">
        <h3>
          <span className="yb" />
          Recent activity
        </h3>
        {onViewAll && (
          <button className="view" onClick={onViewAll}>
            Full audit log <ExternalLink size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="feed">
        {entries.length === 0 ? (
          <div className="feed-empty">No recent activity yet</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="feed-item">
              <div className="feed-time">{relativeTime(entry.created_at)}</div>
              <div className="feed-who">{formatWho(entry)}</div>
              <div className="feed-what">{describe(entry)}</div>
              <div className="feed-tag">{actionTag(entry.action)}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
