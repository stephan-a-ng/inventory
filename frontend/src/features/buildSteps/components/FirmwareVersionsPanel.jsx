import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { ghostBtn, primaryBtn, dangerBtn } from '@/shared/lib/m5-styles';
import RevisionPicker from './RevisionPicker';
import {
  listFirmware,
  createFirmware,
  setFirmwareStandard,
  deleteFirmware,
} from '../lib/api';

export default function FirmwareVersionsPanel() {
  const [revision, setRevision] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const reload = useCallback(async () => {
    if (!revision) { setRows([]); return; }
    setLoading(true); setError(null);
    try {
      setRows(await listFirmware(revision.id));
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [revision]);

  useEffect(() => { reload(); }, [reload]);

  async function handleAdd() {
    if (!revision || !newVersion.trim()) return;
    try {
      await createFirmware(revision.id, {
        version: newVersion.trim(),
        notes: newNotes.trim() || null,
        is_standard: rows.length === 0,
      });
      setNewVersion(''); setNewNotes('');
      await reload();
    } catch (e) { setError(e); }
  }

  async function handleSetStandard(id) {
    try { await setFirmwareStandard(id); await reload(); } catch (e) { setError(e); }
  }

  async function handleDelete(id, version) {
    if (!confirm(`Delete firmware version "${version}"?`)) return;
    try { await deleteFirmware(id); await reload(); } catch (e) { setError(e); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <RevisionPicker value={revision} onChange={setRevision} />
      </div>

      {!revision ? null : (
        <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr auto auto',
            padding: '10px 16px',
            background: 'var(--m5-cream-deep)',
            borderBottom: '1px solid var(--m5-rule)',
            fontFamily: 'var(--m5-font-mono)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--m5-muted)',
          }}>
            <span>Version</span>
            <span>Notes</span>
            <span>Standard</span>
            <span>Actions</span>
          </div>

          {loading ? (
            <div style={{ padding: '20px 16px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '14px 16px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
              No firmware registered for this revision yet.
            </div>
          ) : (
            rows.map((f) => (
              <div
                key={f.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr auto auto',
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--m5-rule)',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 13, color: 'var(--m5-ink)' }}>
                  {f.version}
                </span>
                <span style={{ fontSize: 13, color: 'var(--m5-ink-soft)' }}>{f.notes || '—'}</span>
                <button
                  onClick={() => !f.is_standard && handleSetStandard(f.id)}
                  aria-label={f.is_standard ? 'Standard firmware' : 'Mark as standard'}
                  title={f.is_standard ? 'Standard firmware' : 'Mark as standard'}
                  style={{
                    ...ghostBtn(hovered, `std-${f.id}`),
                    border: '1px solid ' + (f.is_standard ? 'var(--m5-yellow)' : 'var(--m5-rule)'),
                    background: f.is_standard ? 'var(--m5-yellow)' : 'transparent',
                    color: f.is_standard ? 'var(--m5-ink)' : 'var(--m5-muted)',
                    cursor: f.is_standard ? 'default' : 'pointer',
                  }}
                  onMouseEnter={() => setHovered(`std-${f.id}`)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <Star size={13} fill={f.is_standard ? 'var(--m5-ink)' : 'none'} />
                  {f.is_standard ? 'Standard' : 'Mark standard'}
                </button>
                <button
                  style={dangerBtn(hovered, `del-${f.id}`)}
                  onMouseEnter={() => setHovered(`del-${f.id}`)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleDelete(f.id, f.version)}
                  aria-label="Delete firmware version"
                  title="Delete firmware version"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}

          <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 8 }}>
            <Input
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="e.g. 2.4.1"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{ borderRadius: 0, fontFamily: 'var(--m5-font-mono)' }}
            />
            <Input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Notes (optional)"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{ borderRadius: 0 }}
            />
            <button
              style={primaryBtn(hovered, 'add-fw')}
              onMouseEnter={() => setHovered('add-fw')}
              onMouseLeave={() => setHovered(null)}
              onClick={handleAdd}
              disabled={!newVersion.trim()}
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 12,
          padding: '10px 16px',
          background: '#fdecec',
          border: '1px solid #f1c0c0',
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
