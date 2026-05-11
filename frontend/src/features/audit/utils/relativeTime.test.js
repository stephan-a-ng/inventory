import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const NOW = new Date('2026-05-11T12:00:00Z');

describe('formatRelativeTime', () => {
  it('returns "just now" for a moment ago', () => {
    const t = new Date(NOW.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(t, { now: NOW })).toBe('just now');
  });

  it('returns "{N}m ago" within the hour', () => {
    const t = new Date(NOW.getTime() - 11 * 60 * 1000).toISOString();
    expect(formatRelativeTime(t, { now: NOW })).toBe('11m ago');
  });

  it('returns "{N}h ago" within the day', () => {
    const t = new Date(NOW.getTime() - 3 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(t, { now: NOW })).toBe('3h ago');
  });

  it('returns "{N}d ago" within 30 days', () => {
    const t = new Date(NOW.getTime() - 7 * 86400 * 1000).toISOString();
    expect(formatRelativeTime(t, { now: NOW })).toBe('7d ago');
  });

  it('falls back to a locale date past 30 days', () => {
    const t = new Date(NOW.getTime() - 60 * 86400 * 1000).toISOString();
    const out = formatRelativeTime(t, { now: NOW });
    // Don't assert exact locale formatting — just confirm it's no longer relative.
    expect(out).not.toMatch(/ago/);
    expect(out).not.toBe('just now');
  });
});
