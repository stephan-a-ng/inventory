import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { ghostBtn, primaryBtn, dangerBtn } from '@/shared/lib/m5-styles';
import SaveIndicator from './SaveIndicator';
import { useAutoSave } from '../lib/useAutoSave';
import {
  listSubSteps,
  createSubStep,
  updateSubStep,
  deleteSubStep,
  reorderSubSteps,
} from '../lib/api';

// Inline expandable editor for the ordered sub-steps of a build_step. Each
// sub-step has title + description; autosaved on edit/blur.
export default function SubStepEditor({ stepId, hovered, setHovered }) {
  const [open, setOpen] = useState(false);
  const [subs, setSubs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setSubs(await listSubSteps(stepId));
      setLoaded(true);
    } catch (e) { setError(e); }
  }, [stepId]);

  useEffect(() => {
    if (open && !loaded) reload();
  }, [open, loaded, reload]);

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const created = await createSubStep(stepId, { title });
      setSubs((prev) => [...prev, created]);
      setNewTitle('');
    } catch (e) { setError(e); }
  }

  async function handleDelete(subId) {
    if (!confirm('Delete this sub-step?')) return;
    try {
      await deleteSubStep(subId);
      setSubs((prev) => prev.filter((s) => s.id !== subId));
    } catch (e) { setError(e); }
  }

  async function handleMove(subId, direction) {
    const idx = subs.findIndex((s) => s.id === subId);
    const target = idx + direction;
    if (target < 0 || target >= subs.length) return;
    const next = [...subs];
    [next[idx], next[target]] = [next[target], next[idx]];
    setSubs(next.map((s, i) => ({ ...s, sort_order: i })));
    try {
      await reorderSubSteps(next.map((s) => s.id));
    } catch (e) { setError(e); reload(); }
  }

  const count = subs.length;
  const countLabel = loaded
    ? (count === 0 ? 'No sub-steps yet' : `${count} sub-step${count === 1 ? '' : 's'}`)
    : 'Sub-steps';

  return (
    <div style={{
      gridColumn: '2 / -1',
      borderTop: '1px dashed var(--m5-rule)',
      paddingTop: 10,
      marginTop: 4,
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'var(--m5-ink)',
          cursor: 'pointer',
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {countLabel}
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {subs.map((sub, idx) => (
            <SubStepRow
              key={sub.id}
              sub={sub}
              index={idx}
              total={subs.length}
              hovered={hovered}
              setHovered={setHovered}
              onLocalChange={(patch) => {
                setSubs((prev) => prev.map((s) => s.id === sub.id ? { ...s, ...patch } : s));
              }}
              onDelete={() => handleDelete(sub.id)}
              onMove={(dir) => handleMove(sub.id, dir)}
            />
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New sub-step title…"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              style={{ borderRadius: 0, flex: 1, fontSize: 13 }}
            />
            <button
              style={primaryBtn(hovered, `sub-add-${stepId}`)}
              onMouseEnter={() => setHovered(`sub-add-${stepId}`)}
              onMouseLeave={() => setHovered(null)}
              onClick={handleAdd}
              disabled={!newTitle.trim()}
            >
              <Plus size={13} /> Add sub-step
            </button>
          </div>
          {error && (
            <div style={{
              padding: '6px 10px',
              background: '#fdecec',
              color: '#9b2828',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
            }}>{error.message}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SubStepRow({ sub, index, total, hovered, setHovered, onLocalChange, onDelete, onMove }) {
  const [draft, setDraft] = useState({
    title: sub.title,
    description: sub.description || '',
  });

  useEffect(() => {
    setDraft({ title: sub.title, description: sub.description || '' });
  }, [sub.id, sub.title, sub.description]);

  const onSave = useCallback(
    (v) => updateSubStep(sub.id, {
      title: v.title.trim() || 'Untitled',
      description: v.description.trim() || null,
    }).then((updated) => {
      onLocalChange?.({ title: updated.title, description: updated.description });
      return updated;
    }),
    [sub.id, onLocalChange],
  );

  const { state, savedAt, error, flush } = useAutoSave({ value: draft, onSave, delay: 600 });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr 160px',
      gap: 10,
      padding: '8px 10px',
      border: '1px solid var(--m5-rule)',
      background: 'var(--m5-cream)',
      alignItems: 'flex-start',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        paddingTop: 4,
      }}>
        <span style={{
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 10.5,
          color: 'var(--m5-muted)',
        }}>{String(index + 1).padStart(2, '0')}</span>
        <button
          type="button"
          aria-label="Move up"
          disabled={index === 0}
          style={{
            ...ghostBtn(hovered, `sub-up-${sub.id}`),
            height: 18, width: 18, padding: 0, justifyContent: 'center',
            opacity: index === 0 ? 0.3 : 1,
          }}
          onMouseEnter={() => setHovered(`sub-up-${sub.id}`)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={9} />
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={index === total - 1}
          style={{
            ...ghostBtn(hovered, `sub-dn-${sub.id}`),
            height: 18, width: 18, padding: 0, justifyContent: 'center',
            opacity: index === total - 1 ? 0.3 : 1,
          }}
          onMouseEnter={() => setHovered(`sub-dn-${sub.id}`)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={9} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <Input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onBlur={flush}
          placeholder="Sub-step title"
          style={{ borderRadius: 0, fontWeight: 600, fontSize: 13 }}
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          onBlur={flush}
          placeholder="Optional description…"
          rows={2}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid var(--m5-rule)',
            background: 'var(--m5-cream)',
            color: 'var(--m5-ink)',
            fontFamily: 'inherit',
            fontSize: 12,
            lineHeight: 1.4,
            resize: 'vertical',
            borderRadius: 0,
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SaveIndicator state={state} savedAt={savedAt} error={error} />
          <button
            style={dangerBtn(hovered, `sub-del-${sub.id}`)}
            onMouseEnter={() => setHovered(`sub-del-${sub.id}`)}
            onMouseLeave={() => setHovered(null)}
            onClick={onDelete}
            aria-label="Delete sub-step"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
