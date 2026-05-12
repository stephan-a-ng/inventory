import { useEffect, useState } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import {
  ghostBtn,
  primaryBtn,
  dangerBtn,
  productTabBtn,
  PRODUCT_TYPES,
} from '@/shared/lib/m5-styles';
import {
  listRevisions,
  createRevision,
  setRevisionDefault,
  deleteRevision,
} from '../lib/api';

export default function RevisionsPanel() {
  const [activeType, setActiveType] = useState('EVSE');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setRows(await listRevisions(activeType));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [activeType]);

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    try {
      await createRevision({
        product_type: activeType,
        label,
        is_default: rows.length === 0,
      });
      setNewLabel('');
      await reload();
    } catch (e) {
      setError(e);
    }
  }

  async function handleSetDefault(id) {
    try {
      await setRevisionDefault(id);
      await reload();
    } catch (e) { setError(e); }
  }

  async function handleDelete(id, label) {
    if (!confirm(`Delete revision "${label}"? Linked build steps and firmware versions will also be removed.`)) return;
    try {
      await deleteRevision(id);
      await reload();
    } catch (e) { setError(e); }
  }

  return (
    <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', maxWidth: 720 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--m5-rule)' }}>
        {PRODUCT_TYPES.map((type, idx) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            style={{
              ...productTabBtn(type, activeType),
              borderRight: idx === PRODUCT_TYPES.length - 1 ? '1px solid var(--m5-rule)' : 'none',
              borderTop: 'none',
              borderLeft: idx === 0 ? 'none' : '1px solid var(--m5-rule)',
              borderBottom: activeType === type ? '2px solid var(--m5-ink)' : '1px solid var(--m5-rule)',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        padding: '10px 16px',
        background: 'var(--m5-cream-deep)',
        borderBottom: '1px solid var(--m5-rule)',
        fontFamily: 'var(--m5-font-mono)',
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--m5-muted)',
      }}>
        <span>Revision label</span>
        <span>Default</span>
        <span>Actions</span>
      </div>

      {loading ? (
        <div style={{ padding: '20px 16px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
          Loading…
        </div>
      ) : (
        <div>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                padding: '14px 16px',
                borderBottom: '1px solid var(--m5-rule)',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--m5-ink)' }}>{r.label}</span>
              <button
                onClick={() => !r.is_default && handleSetDefault(r.id)}
                aria-label={r.is_default ? 'Default revision' : 'Set as default'}
                title={r.is_default ? 'Default revision' : 'Set as default'}
                style={{
                  ...ghostBtn(hovered, `def-${r.id}`),
                  border: '1px solid ' + (r.is_default ? 'var(--m5-yellow)' : 'var(--m5-rule)'),
                  background: r.is_default ? 'var(--m5-yellow)' : 'transparent',
                  color: r.is_default ? 'var(--m5-ink)' : 'var(--m5-muted)',
                  cursor: r.is_default ? 'default' : 'pointer',
                }}
                onMouseEnter={() => setHovered(`def-${r.id}`)}
                onMouseLeave={() => setHovered(null)}
              >
                <Star size={13} fill={r.is_default ? 'var(--m5-ink)' : 'none'} />
                {r.is_default ? 'Default' : 'Set default'}
              </button>
              <button
                style={dangerBtn(hovered, `del-${r.id}`)}
                onMouseEnter={() => setHovered(`del-${r.id}`)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handleDelete(r.id, r.label)}
                aria-label="Delete revision"
                title="Delete revision"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={`New ${activeType} revision (e.g. v2)`}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{ borderRadius: 0, flex: 1 }}
            />
            <button
              style={primaryBtn(hovered, 'add-rev')}
              onMouseEnter={() => setHovered('add-rev')}
              onMouseLeave={() => setHovered(null)}
              onClick={handleAdd}
              disabled={!newLabel.trim()}
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 16px',
          background: '#fdecec',
          borderTop: '1px solid #f1c0c0',
          color: '#9b2828',
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 12,
        }}>
          {error.message}
        </div>
      )}
    </div>
  );
}
