/**
 * Shared M5 inline-style helpers used by the admin panels.
 *
 * These are functions instead of objects so they can take a hover-key and
 * branch on whether that key is currently hovered. Pass `null` for none.
 */
export const ghostBtn = (hoveredKey, key) => ({
  height: 32,
  padding: '0 12px',
  border: '1px solid var(--m5-rule)',
  background: hoveredKey === key ? 'var(--m5-cream-deep)' : 'var(--m5-cream)',
  color: 'var(--m5-ink)',
  fontWeight: 500,
  fontSize: 12,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  borderRadius: 0,
  transition: 'background 0.12s ease',
});

export const primaryBtn = (hoveredKey, key) => ({
  height: 38,
  padding: '0 16px',
  border:
    hoveredKey === key
      ? '1px solid var(--m5-yellow-deep, #e6bc00)'
      : '1px solid var(--m5-yellow)',
  background: hoveredKey === key ? 'var(--m5-yellow-deep, #e6bc00)' : 'var(--m5-yellow)',
  color: 'var(--m5-ink)',
  fontWeight: 600,
  fontSize: 13.5,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  borderRadius: 0,
  transition: 'background 0.12s ease, border-color 0.12s ease',
});

export const dangerBtn = (hoveredKey, key) => ({
  height: 28,
  width: 28,
  padding: 0,
  border: '1px solid transparent',
  background: 'transparent',
  color: hoveredKey === key ? '#ef4444' : 'var(--m5-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  borderRadius: 0,
  transition: 'color 0.12s ease',
});

export const productTabBtn = (type, activeValue) => ({
  padding: '6px 14px',
  background: activeValue === type ? 'var(--m5-ink)' : 'var(--m5-cream)',
  color: activeValue === type ? 'var(--m5-cream)' : 'var(--m5-muted)',
  border: '1px solid var(--m5-rule)',
  borderRight: 'none',
  fontFamily: 'var(--m5-font-mono)',
  fontSize: '10.5px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  borderRadius: 0,
});

export const PRODUCT_TYPES = ['AEMS', 'BEMS', 'EVSE', 'NETWORKING'];
