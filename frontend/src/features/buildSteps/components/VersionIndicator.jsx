import { AlertTriangle, GitBranch } from 'lucide-react';

// Shows which authored instruction-set version the worker is currently
// looking at, plus a yellow "newer version available" pill when the device
// is pinned to an older set than the currently-active one.
//
// Pass:
//   pinned   — the instruction_set object the worker is viewing (null OK)
//   active   — the currently-active instruction_set for (revision, stage)
//   compact  — drop padding for inline placement next to a heading
export default function VersionIndicator({ pinned, active, compact = false }) {
  if (!pinned) return null;
  const outdated = active && active.id !== pinned.id;

  const wrap = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: compact ? 0 : '6px 0',
    fontFamily: 'var(--m5-font-mono)',
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--m5-muted)',
  };

  const versionChip = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    border: '1px solid var(--m5-ink)',
    background: 'var(--m5-cream)',
    color: 'var(--m5-ink)',
    fontWeight: 600,
  };

  const outdatedPill = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    background: 'var(--m5-yellow)',
    color: 'var(--m5-ink)',
    border: '1px solid var(--m5-ink)',
    fontWeight: 700,
  };

  const upToDatePill = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    background: 'var(--m5-cream-deep)',
    color: 'var(--m5-muted)',
    border: '1px solid var(--m5-rule)',
  };

  return (
    <span style={wrap}>
      <span style={versionChip}>
        <GitBranch size={11} />
        Instructions {pinned.label}
      </span>
      {outdated ? (
        <span style={outdatedPill} title={`Active version is ${active.label}; this device stays on ${pinned.label} for continuity.`}>
          <AlertTriangle size={11} />
          Newer {active.label} available
        </span>
      ) : (
        <span style={upToDatePill}>Up to date</span>
      )}
    </span>
  );
}
