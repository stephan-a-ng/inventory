import { useEffect, useState } from 'react';
import { productTabBtn, PRODUCT_TYPES } from '@/shared/lib/m5-styles';
import { listRevisions } from '../lib/api';

/**
 * Reusable two-row picker: product-type tabs on top, revision chips below.
 * Calls `onChange(revision)` whenever the selection changes.
 *
 * Auto-selects the default revision (or first available) when product_type
 * changes.
 */
export default function RevisionPicker({ value, onChange }) {
  const [productType, setProductType] = useState(value?.product_type || 'EVSE');
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listRevisions(productType)
      .then((rows) => {
        setRevisions(rows);
        const next = rows.find((r) => r.is_default) || rows[0] || null;
        onChange(next);
      })
      .finally(() => setLoading(false));
    // onChange is captured at render time; consumers should memoize if needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType]);

  return (
    <div>
      <div style={{ display: 'flex', marginBottom: 12 }}>
        {PRODUCT_TYPES.map((type, idx) => (
          <button
            key={type}
            onClick={() => setProductType(type)}
            style={{
              ...productTabBtn(type, productType),
              borderRight: idx === PRODUCT_TYPES.length - 1 ? '1px solid var(--m5-rule)' : 'none',
              borderLeft: idx === 0 ? '1px solid var(--m5-rule)' : 'none',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
          Loading revisions…
        </div>
      ) : revisions.length === 0 ? (
        <div style={{ color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
          No revisions yet. Add one in the Revisions tab.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {revisions.map((r) => {
            const active = value?.id === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onChange(r)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid ' + (active ? 'var(--m5-ink)' : 'var(--m5-rule)'),
                  background: active ? 'var(--m5-ink)' : 'var(--m5-cream)',
                  color: active ? 'var(--m5-cream)' : 'var(--m5-ink)',
                  fontFamily: 'var(--m5-font-mono)',
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  borderRadius: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {r.label}
                {r.is_default && (
                  <span style={{
                    fontSize: 9,
                    background: active ? 'var(--m5-yellow)' : 'var(--m5-cream-deep)',
                    color: 'var(--m5-ink)',
                    padding: '1px 5px',
                    letterSpacing: '0.16em',
                  }}>
                    DEFAULT
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
