import React from 'react';

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatUser(email) {
  if (!email) return 'SYSTEM';
  const local = email.split('@')[0];
  return local
    .split('.')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ')
    .toUpperCase();
}

function formatAction(entry) {
  const { action, details } = entry;
  if (action === 'stage_changed') {
    return `Stage: ${details?.from_stage || '—'} → ${details?.to_stage || '—'}`;
  }
  if (action === 'device_created') return 'Device added to inventory';
  if (action === 'device_updated') return `Updated: ${Object.keys(details || {}).join(', ')}`;
  if (action === 'bulk_import') return `Bulk import: ${details?.count || ''} devices`;
  return action.replace(/_/g, ' ');
}

export default function ActivityFeed({
  entries = [],
  title = 'Recent activity',
  maxItems = 7,
  onViewAll,
}) {
  const visible = entries.slice(0, maxItems);

  return (
    <div
      style={{
        borderLeft: '1px solid var(--m5-rule)',
        background: 'var(--m5-cream-deep)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--m5-rule)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--m5-font-mono)',
            fontSize: '11px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--m5-muted)',
            fontWeight: 500,
            margin: 0,
          }}
        >
          {title}
        </p>
        {onViewAll && (
          <button
            onClick={onViewAll}
            style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: '10.5px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-ink)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            View audit log →
          </button>
        )}
      </div>

      {/* Feed */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {visible.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px 20px',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: '11px',
              letterSpacing: '0.08em',
              color: 'var(--m5-muted)',
            }}
          >
            No recent activity
          </div>
        ) : (
          visible.map((entry, idx) => (
            <div
              key={entry.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '56px 1fr',
                borderBottom: idx < visible.length - 1 ? '1px solid var(--m5-rule)' : 'none',
              }}
            >
              {/* Timestamp column */}
              <div
                style={{
                  fontFamily: 'var(--m5-font-mono)',
                  fontSize: '10.5px',
                  letterSpacing: '0.08em',
                  color: 'var(--m5-muted)',
                  textAlign: 'center',
                  padding: '14px 0',
                  borderRight: '1px solid var(--m5-rule)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                }}
              >
                {formatRelativeTime(entry.created_at)}
              </div>

              {/* Content column */}
              <div style={{ padding: '14px 20px 14px 12px' }}>
                <div
                  style={{
                    fontFamily: 'var(--m5-font-mono)',
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    color: 'var(--m5-muted)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  {formatUser(entry.user_email)}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    lineHeight: 1.4,
                    letterSpacing: '-0.005em',
                    color: 'var(--m5-ink)',
                  }}
                >
                  {formatAction(entry)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
