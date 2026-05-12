import { formatSavedAt } from '../lib/useAutoSave';

/**
 * Small mono-styled status chip rendered next to autosaving rows.
 * States: idle (hidden), saving (pulse), saved (timestamp), error.
 */
export default function SaveIndicator({ state, savedAt, error }) {
  if (state === 'idle') return null;

  const base = {
    fontFamily: 'var(--m5-font-mono)',
    fontSize: 10.5,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '2px 8px',
    border: '1px solid var(--m5-rule)',
    background: 'var(--m5-cream-deep)',
    color: 'var(--m5-muted)',
    whiteSpace: 'nowrap',
  };

  if (state === 'saving') {
    return <span style={{ ...base }}>Saving…</span>;
  }
  if (state === 'saved') {
    return (
      <span style={{ ...base, color: 'var(--m5-ink)' }}>
        Saved · {formatSavedAt(savedAt)}
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span
        style={{ ...base, borderColor: '#c83a3a', color: '#c83a3a' }}
        title={error?.message || 'Save failed'}
      >
        Save failed
      </span>
    );
  }
  return null;
}
