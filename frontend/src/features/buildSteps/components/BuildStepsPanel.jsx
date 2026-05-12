import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Camera, ImageOff } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { ghostBtn, primaryBtn, dangerBtn } from '@/shared/lib/m5-styles';
import RevisionPicker from './RevisionPicker';
import InstructionSetPicker from './InstructionSetPicker';
import SaveIndicator from './SaveIndicator';
import ReferencePhotoSlot from './ReferencePhotoSlot';
import SubStepEditor from './SubStepEditor';
import { useAutoSave } from '../lib/useAutoSave';
import {
  listInstructionSets,
  createInstructionSet,
  listBuildSteps,
  createBuildStep,
  updateBuildStep,
  deleteBuildStep,
  reorderBuildSteps,
} from '../lib/api';

const STAGE_KEYS = ['Assembly', 'Firmware', 'Calibration', 'QA', 'Staging'];

const stageTabStyle = (active) => ({
  flex: 1,
  padding: '12px 16px',
  background: active ? 'var(--m5-ink)' : 'var(--m5-cream)',
  color: active ? 'var(--m5-cream)' : 'var(--m5-muted)',
  border: '1px solid var(--m5-rule)',
  borderBottom: active ? '1px solid var(--m5-ink)' : '1px solid var(--m5-rule)',
  fontFamily: 'var(--m5-font-mono)',
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  borderRadius: 0,
  fontWeight: active ? 600 : 400,
});

export default function BuildStepsPanel() {
  const [revision, setRevision] = useState(null);
  const [stageKey, setStageKey] = useState('Assembly');
  const [sets, setSets] = useState([]);
  const [selectedSet, setSelectedSet] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  const activeSet = useMemo(() => sets.find((s) => s.is_active) || null, [sets]);

  // Load instruction sets whenever revision or stage changes.
  const loadSets = useCallback(async () => {
    if (!revision) {
      setSets([]); setSelectedSet(null); setSteps([]);
      return;
    }
    setLoading(true); setError(null);
    try {
      const rows = await listInstructionSets(revision.id, stageKey);
      setSets(rows);
      // Default selection: active set, else first, else null.
      const nextActive = rows.find((s) => s.is_active) || rows[0] || null;
      setSelectedSet((prev) => {
        if (prev && rows.some((r) => r.id === prev.id)) {
          // Keep current selection if it still exists.
          return rows.find((r) => r.id === prev.id);
        }
        return nextActive;
      });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [revision, stageKey]);

  useEffect(() => { loadSets(); }, [loadSets]);

  // Load steps for the selected set.
  const loadSteps = useCallback(async () => {
    if (!selectedSet) { setSteps([]); return; }
    setLoading(true); setError(null);
    try {
      setSteps(await listBuildSteps(selectedSet.id));
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [selectedSet]);

  useEffect(() => { loadSteps(); }, [loadSteps]);

  async function ensureSet() {
    // For users who haven't created any instruction set yet, create v1 active
    // so the first "Add step" works without a separate setup step.
    if (selectedSet) return selectedSet;
    if (!revision) return null;
    const created = await createInstructionSet({
      product_revision_id: revision.id,
      stage_key: stageKey,
      label: 'v1',
      is_active: true,
    });
    setSets((prev) => [...prev, created]);
    setSelectedSet(created);
    return created;
  }

  async function handleAdd() {
    if (!revision || !newTitle.trim()) return;
    try {
      const targetSet = await ensureSet();
      if (!targetSet) return;
      const created = await createBuildStep({
        instruction_set_id: targetSet.id,
        title: newTitle.trim(),
        required_photo_count: 0,
      });
      setSteps((prev) => [...prev, created]);
      setNewTitle('');
    } catch (e) { setError(e); }
  }

  async function handleDelete(id, title) {
    if (!confirm(`Delete step "${title}"? Any worker progress and photos will also be removed.`)) return;
    try {
      await deleteBuildStep(id);
      setSteps((prev) => prev.filter((s) => s.id !== id));
    } catch (e) { setError(e); }
  }

  async function handleMove(id, direction) {
    const ids = steps.map((s) => s.id);
    const idx = ids.indexOf(id);
    const target = idx + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    try {
      setSteps((prev) => {
        const next = [...prev];
        [next[idx], next[target]] = [next[target], next[idx]];
        return next.map((s, i) => ({ ...s, sort_order: i }));
      });
      await reorderBuildSteps(ids);
    } catch (e) { setError(e); loadSteps(); }
  }

  const isReadOnly = !!selectedSet && selectedSet.id !== activeSet?.id;

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ marginBottom: 24 }}>
        <RevisionPicker value={revision} onChange={setRevision} />
      </div>

      {revision && (
        <>
          <div style={{ display: 'flex', marginBottom: 12 }}>
            {STAGE_KEYS.map((s) => (
              <button
                key={s}
                onClick={() => setStageKey(s)}
                style={stageTabStyle(stageKey === s)}
              >
                {s}
              </button>
            ))}
          </div>

          <InstructionSetPicker
            revisionId={revision.id}
            stageKey={stageKey}
            sets={sets}
            activeSet={activeSet}
            selectedSet={selectedSet}
            onSelect={setSelectedSet}
            onChanged={loadSets}
          />

          {selectedSet && !selectedSet.is_active && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              border: '1px dashed var(--m5-rule)',
              background: 'var(--m5-cream-deep)',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.04em',
              color: 'var(--m5-muted)',
            }}>
              You're viewing {selectedSet.label} — it's not the active version.
              Edits land on this version; in-flight devices stay on whichever
              version they started.
            </div>
          )}

          <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
            {loading ? (
              <div style={{ padding: '20px 16px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
                Loading…
              </div>
            ) : steps.length === 0 ? (
              <div style={{ padding: '20px 16px', color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 12 }}>
                No {stageKey.toLowerCase()} steps yet in {selectedSet?.label || 'this version'}.
                Add the first one below.
              </div>
            ) : (
              steps.map((step, idx) => (
                <BuildStepRow
                  key={step.id}
                  index={idx}
                  total={steps.length}
                  step={step}
                  hovered={hovered}
                  setHovered={setHovered}
                  onMove={(dir) => handleMove(step.id, dir)}
                  onDelete={() => handleDelete(step.id, step.title)}
                  onStepUpdated={(updated) => setSteps((prev) => prev.map((s) => s.id === updated.id ? { ...s, ...updated } : s))}
                />
              ))
            )}

            <div style={{ padding: '16px', display: 'flex', gap: 8, borderTop: steps.length === 0 ? 'none' : '1px solid var(--m5-rule)' }}>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`New ${stageKey.toLowerCase()} step${selectedSet ? ` in ${selectedSet.label}` : ''}…`}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                style={{ borderRadius: 0, flex: 1 }}
              />
              <button
                style={primaryBtn(hovered, 'add-step')}
                onMouseEnter={() => setHovered('add-step')}
                onMouseLeave={() => setHovered(null)}
                onClick={handleAdd}
                disabled={!newTitle.trim()}
              >
                <Plus size={14} />
                Add step
              </button>
            </div>
          </div>
        </>
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

// ── single autosaving row ────────────────────────────────────────────────────
function BuildStepRow({ step, index, total, hovered, setHovered, onMove, onDelete, onStepUpdated }) {
  const [draft, setDraft] = useState({
    title: step.title,
    description: step.description || '',
    required_photo_count: step.required_photo_count,
  });

  useEffect(() => {
    setDraft({
      title: step.title,
      description: step.description || '',
      required_photo_count: step.required_photo_count,
    });
  }, [step.id, step.title, step.description, step.required_photo_count]);

  const onSave = useCallback(
    (v) => updateBuildStep(step.id, {
      title: v.title.trim() || 'Untitled step',
      description: v.description.trim() || null,
      required_photo_count: Number(v.required_photo_count) || 0,
    }),
    [step.id],
  );

  const { state, savedAt, error, flush } = useAutoSave({ value: draft, onSave, delay: 600 });

  const photoCount = Math.max(0, Number(draft.required_photo_count) || 0);
  const photoCountLabel = useMemo(() => {
    if (photoCount === 0) return 'No photo required';
    if (photoCount === 1) return '1 photo required';
    return `${photoCount} photos required`;
  }, [photoCount]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 120px 180px',
        gap: 14,
        padding: '14px 16px',
        borderBottom: '1px solid var(--m5-rule)',
        alignItems: 'flex-start',
        rowGap: 10,
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        paddingTop: 4,
      }}>
        <span style={{
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--m5-muted)',
        }}>{String(index + 1).padStart(2, '0')}</span>
        <button
          aria-label="Move up"
          disabled={index === 0}
          style={{
            ...ghostBtn(hovered, `up-${step.id}`),
            height: 24, width: 24, padding: 0, justifyContent: 'center',
            opacity: index === 0 ? 0.3 : 1,
          }}
          onMouseEnter={() => setHovered(`up-${step.id}`)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={11} />
        </button>
        <button
          aria-label="Move down"
          disabled={index === total - 1}
          style={{
            ...ghostBtn(hovered, `down-${step.id}`),
            height: 24, width: 24, padding: 0, justifyContent: 'center',
            opacity: index === total - 1 ? 0.3 : 1,
          }}
          onMouseEnter={() => setHovered(`down-${step.id}`)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={11} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <Input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onBlur={flush}
          placeholder="Step title"
          style={{ borderRadius: 0, fontWeight: 600 }}
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          onBlur={flush}
          placeholder="Optional instructions for the tech…"
          rows={2}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--m5-rule)',
            background: 'var(--m5-cream)',
            color: 'var(--m5-ink)',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: 1.4,
            resize: 'vertical',
            borderRadius: 0,
          }}
        />
      </div>

      <ReferencePhotoSlot step={step} onChange={onStepUpdated} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SaveIndicator state={state} savedAt={savedAt} error={error} />
          <button
            style={dangerBtn(hovered, `del-${step.id}`)}
            onMouseEnter={() => setHovered(`del-${step.id}`)}
            onMouseLeave={() => setHovered(null)}
            onClick={onDelete}
            aria-label="Delete step"
          >
            <Trash2 size={13} />
          </button>
        </div>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--m5-muted)',
        }}>
          {photoCount > 0 ? <Camera size={13} /> : <ImageOff size={13} />}
          <input
            type="number"
            min={0}
            max={10}
            value={draft.required_photo_count}
            onChange={(e) => setDraft((d) => ({ ...d, required_photo_count: e.target.value }))}
            onBlur={flush}
            aria-label="Required photo count"
            style={{
              width: 56,
              padding: '6px 8px',
              border: '1px solid var(--m5-rule)',
              background: 'var(--m5-cream)',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 13,
              borderRadius: 0,
              textAlign: 'right',
            }}
          />
        </label>
        <span style={{
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          color: 'var(--m5-muted)',
        }}>
          {photoCountLabel}
        </span>
      </div>

      <SubStepEditor stepId={step.id} hovered={hovered} setHovered={setHovered} />
    </div>
  );
}
