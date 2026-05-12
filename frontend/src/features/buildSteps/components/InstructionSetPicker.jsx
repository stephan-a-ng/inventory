import { useState } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { ghostBtn, primaryBtn } from '@/shared/lib/m5-styles';
import {
  createInstructionSet,
  cloneInstructionSet,
  activateInstructionSet,
} from '../lib/api';

// Row of chips for instruction-set versions of a given (revision, stage).
// Active set is highlighted yellow. Admins can switch the editor to another
// version, mark it active, clone the current one to a new version, or create
// a blank new version.
export default function InstructionSetPicker({
  revisionId,
  stageKey,
  sets,
  activeSet,
  selectedSet,
  onSelect,
  onChanged,
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const defaultNext = nextLabel(sets);

  async function doClone() {
    setBusy(true); setError(null);
    try {
      await cloneInstructionSet(selectedSet.id, newLabel.trim() || defaultNext, true);
      setAdding(false); setNewLabel('');
      onChanged?.();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function doCreateEmpty() {
    setBusy(true); setError(null);
    try {
      await createInstructionSet({
        product_revision_id: revisionId,
        stage_key: stageKey,
        label: newLabel.trim() || defaultNext,
        is_active: sets.length === 0,
      });
      setAdding(false); setNewLabel('');
      onChanged?.();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function doActivate(setId) {
    setBusy(true); setError(null);
    try {
      await activateInstructionSet(setId);
      onChanged?.();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  function cancelAdd() {
    setAdding(false);
    setNewLabel('');
    setError(null);
  }

  return (
    <div style={{
      border: '1px solid var(--m5-rule)',
      background: 'var(--m5-cream-deep)',
      padding: '10px 12px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 10.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--m5-muted)',
          whiteSpace: 'nowrap',
        }}>
          Instructions version
        </span>

        {sets.length === 0 ? (
          <span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 12, color: 'var(--m5-muted)' }}>
            (none yet)
          </span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sets.map((s) => {
              const isSelected = s.id === selectedSet?.id;
              const isActive = s.is_active;
              return (
                <div key={s.id} style={{ display: 'inline-flex', alignItems: 'stretch' }}>
                  <button
                    onClick={() => onSelect(s)}
                    style={{
                      padding: '5px 10px',
                      fontFamily: 'var(--m5-font-mono)',
                      fontSize: 12,
                      border: '1px solid ' + (isSelected ? 'var(--m5-ink)' : 'var(--m5-rule)'),
                      background: isActive ? 'var(--m5-yellow)' : (isSelected ? 'var(--m5-ink)' : 'var(--m5-cream)'),
                      color: isActive ? 'var(--m5-ink)' : (isSelected ? 'var(--m5-cream)' : 'var(--m5-ink)'),
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 0,
                    }}
                    title={isActive ? 'Currently active' : 'Click to edit'}
                  >
                    {isActive && <Check size={11} strokeWidth={3} />}
                    {s.label}
                  </button>
                  {!isActive && isSelected && (
                    <button
                      onClick={() => doActivate(s.id)}
                      disabled={busy}
                      style={{
                        ...ghostBtn(hovered, `act-${s.id}`),
                        height: 'auto',
                        padding: '5px 8px',
                        fontSize: 10.5,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--m5-font-mono)',
                        borderLeft: 'none',
                      }}
                      onMouseEnter={() => setHovered(`act-${s.id}`)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      Make active
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <span style={{ flex: 1 }} />

        {!adding ? (
          <button
            onClick={() => { setAdding(true); setNewLabel(defaultNext); }}
            style={{
              ...ghostBtn(hovered, 'new'),
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
            onMouseEnter={() => setHovered('new')}
            onMouseLeave={() => setHovered(null)}
          >
            <Plus size={12} /> New version
          </button>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. v2)"
              style={{ borderRadius: 0, width: 110, height: 32, fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelAdd(); }}
            />
            {selectedSet ? (
              <button
                onClick={doClone}
                disabled={busy || !newLabel.trim()}
                style={primaryBtn(hovered, 'clone')}
                onMouseEnter={() => setHovered('clone')}
                onMouseLeave={() => setHovered(null)}
                title={`Copy "${selectedSet.label}" steps and sub-steps into a new version`}
              >
                <Copy size={13} /> Clone {selectedSet.label} -&gt; {newLabel || defaultNext}
              </button>
            ) : null}
            <button
              onClick={doCreateEmpty}
              disabled={busy || !newLabel.trim()}
              style={{ ...ghostBtn(hovered, 'empty'), height: 38 }}
              onMouseEnter={() => setHovered('empty')}
              onMouseLeave={() => setHovered(null)}
            >
              Empty
            </button>
            <button
              onClick={cancelAdd}
              style={{
                ...ghostBtn(hovered, 'cancel'),
                fontSize: 10.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontFamily: 'var(--m5-font-mono)',
                height: 38,
              }}
              onMouseEnter={() => setHovered('cancel')}
              onMouseLeave={() => setHovered(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && (
        <div style={{
          marginTop: 8,
          padding: '6px 10px',
          background: '#fdecec',
          color: '#9b2828',
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 11,
        }}>{error.message}</div>
      )}
    </div>
  );
}

function nextLabel(sets) {
  // Suggest the next "vN" after the highest existing vN label.
  const nums = sets.map((s) => {
    const m = /^v(\d+)$/.exec(s.label);
    return m ? Number(m[1]) : 0;
  });
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `v${next}`;
}
