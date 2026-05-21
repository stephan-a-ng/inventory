import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import useAuth from '@/features/auth/useAuth';

const LEVELS = ['I', 'W', 'E', 'D'];
const PAGE = 200;
const LEVEL_STYLES = {
  I: { bg: '#dbeafe', fg: '#1e40af', label: 'INFO' },
  W: { bg: '#fef3c7', fg: '#92400e', label: 'WARN' },
  E: { bg: '#fee2e2', fg: '#991b1b', label: 'ERROR' },
  D: { bg: '#f1f5f9', fg: '#475569', label: 'DEBUG' },
};

/**
 * Per-capture log viewer modal. Streams parsed lines from
 * `/api/devices/flash-logs/{logId}/lines` and renders them as a
 * monospace table. Filters along the top map onto the same endpoint's
 * params; the filtered query goes through the cross-cutting
 * `/api/flash-log-lines` endpoint when any filter is active so the DB
 * does the work (vs. re-fetching everything and filtering client-side).
 *
 * Filters carry the active capture's `flash_log_id` implicitly via the
 * device_id + captured_at narrowing in the request URL — we want
 * filtered-to-this-capture semantics, not fleet-wide.
 */
export default function FlashLogViewer({ captureId, deviceId, onClose }) {
  const { authFetch } = useAuth();

  // Filter state.
  const [q, setQ] = useState('');
  const [levelToggles, setLevelToggles] = useState(
    Object.fromEntries(LEVELS.map((l) => [l, true])),
  );
  const [tagFilter, setTagFilter] = useState('');

  // Capture metadata + line buffer.
  const [meta, setMeta] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [doneStreaming, setDoneStreaming] = useState(false);
  const cursorRef = useRef(0); // last line_no fetched

  const anyFilterActive = useMemo(
    () => q.trim() !== '' || tagFilter.trim() !== '' || Object.values(levelToggles).some((v) => !v),
    [q, tagFilter, levelToggles],
  );

  // Fast path: when no filters are active, page through this capture
  // via /api/devices/flash-logs/{id}/lines. Slow path: any filter
  // active → use /api/flash-log-lines scoped to the device. Both
  // populate `lines` the same way.
  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLines([]);
    cursorRef.current = 0;
    setDoneStreaming(false);
    try {
      if (anyFilterActive) {
        // Cross-cutting endpoint — server-side filter, scoped to this device.
        const params = new URLSearchParams({
          device_id: deviceId,
          limit: String(PAGE),
        });
        if (q.trim()) params.set('q', q.trim());
        if (tagFilter.trim()) params.set('tag', tagFilter.trim());
        const activeLevels = LEVELS.filter((l) => levelToggles[l]);
        // We can only pass ONE level on the server today; if the user
        // is hiding 1+ levels we filter the response client-side after
        // the request. ((Acceptable until usage demands a CSV API.))
        if (activeLevels.length === 1) params.set('level', activeLevels[0]);
        const r = await authFetch(`/api/flash-log-lines?${params}`);
        if (!r.ok) throw new Error(`${r.status}`);
        const data = await r.json();
        let result = data.lines || [];
        if (activeLevels.length > 1 && activeLevels.length < LEVELS.length) {
          result = result.filter((l) => activeLevels.includes(l.level));
        }
        setLines(result);
        // search returns up to limit rows, no cursor — treat as one-shot.
        setDoneStreaming(true);
      } else {
        const r = await authFetch(
          `/api/devices/flash-logs/${captureId}/lines?limit=${PAGE}`,
        );
        if (!r.ok) throw new Error(`${r.status}`);
        const data = await r.json();
        setMeta(data.capture);
        setLines(data.lines || []);
        cursorRef.current = data.next_after || 0;
        if (!data.next_after || (data.lines || []).length < PAGE) {
          setDoneStreaming(true);
        }
      }
    } catch (e) {
      setError(e.message || 'failed to load lines');
    } finally {
      setLoading(false);
    }
  }, [authFetch, captureId, deviceId, anyFilterActive, q, tagFilter, levelToggles]);

  // Fetch next page on the unfiltered path.
  const loadMore = useCallback(async () => {
    if (doneStreaming || anyFilterActive) return;
    try {
      const r = await authFetch(
        `/api/devices/flash-logs/${captureId}/lines?after=${cursorRef.current}&limit=${PAGE}`,
      );
      if (!r.ok) return;
      const data = await r.json();
      const next = data.lines || [];
      setLines((prev) => [...prev, ...next]);
      cursorRef.current = data.next_after || cursorRef.current;
      if (!data.next_after || next.length < PAGE) setDoneStreaming(true);
    } catch {
      /* ignore */
    }
  }, [authFetch, captureId, doneStreaming, anyFilterActive]);

  useEffect(() => { loadFirstPage(); }, [loadFirstPage]);

  // ESC closes.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const distinctTags = useMemo(() => {
    const s = new Set();
    for (const l of lines) if (l.tag) s.add(l.tag);
    return [...s].sort();
  }, [lines]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 1100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, width: '100%',
          maxWidth: 1100, maxHeight: '92vh', display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid #ece6d6',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Flash log
            </div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              {meta
                ? `${meta.mcu_role.toUpperCase()} · ${new Date(meta.captured_at).toLocaleString()} · ${meta.line_count} lines`
                : 'Loading…'}
            </h3>
          </div>
          <button
            type="button" aria-label="Close" onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6 }}
          >
            <X size={18} />
          </button>
        </header>

        <FilterRow
          q={q} setQ={setQ}
          levelToggles={levelToggles} setLevelToggles={setLevelToggles}
          tagFilter={tagFilter} setTagFilter={setTagFilter}
          distinctTags={distinctTags}
        />

        <div
          style={{ flex: 1, overflow: 'auto', background: '#fafaf6' }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
              loadMore();
            }
          }}
        >
          {loading && lines.length === 0 ? (
            <div style={{ padding: 24, color: '#888' }}>Loading lines…</div>
          ) : error ? (
            <div style={{ padding: 24, color: '#991b1b' }}>{error}</div>
          ) : lines.length === 0 ? (
            <div style={{ padding: 24, color: '#888' }}>No lines match.</div>
          ) : (
            <LinesTable lines={lines} />
          )}
          {!doneStreaming && !loading && !anyFilterActive && lines.length > 0 && (
            <div style={{ padding: 12, textAlign: 'center', color: '#888', fontSize: 12 }}>
              Scroll for more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterRow({ q, setQ, levelToggles, setLevelToggles, tagFilter, setTagFilter, distinctTags }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 16px',
      borderBottom: '1px solid #ece6d6', alignItems: 'center', fontSize: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        border: '1px solid #d9d3c0', borderRadius: 6, padding: '4px 8px',
        background: 'white', flex: '1 1 220px', minWidth: 200,
      }}>
        <Search size={12} aria-hidden style={{ color: '#888' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search message…"
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {LEVELS.map((l) => {
          const on = levelToggles[l];
          const s = LEVEL_STYLES[l];
          return (
            <button
              key={l} type="button"
              onClick={() => setLevelToggles((v) => ({ ...v, [l]: !v[l] }))}
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 11,
                fontWeight: 700, letterSpacing: '0.04em',
                background: on ? s.bg : '#f1f5f9',
                color: on ? s.fg : '#94a3b8',
                border: `1px solid ${on ? s.bg : '#cbd5e1'}`,
                cursor: 'pointer',
              }}
              title={`Toggle ${s.label}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <select
        value={tagFilter}
        onChange={(e) => setTagFilter(e.target.value)}
        style={{
          border: '1px solid #d9d3c0', borderRadius: 6, padding: '4px 8px',
          fontSize: 12, background: 'white',
        }}
        title="Filter by tag"
      >
        <option value="">all tags</option>
        {distinctTags.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}

function LinesTable({ lines }) {
  return (
    <table style={{
      width: '100%', borderCollapse: 'collapse',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
    }}>
      <tbody>
        {lines.map((l) => (
          <LineRow key={`${l.flash_log_id || ''}-${l.line_no}`} line={l} />
        ))}
      </tbody>
    </table>
  );
}

function LineRow({ line }) {
  const s = line.level && LEVEL_STYLES[line.level];
  const isParsed = !!line.level;
  return (
    <tr style={{ borderBottom: '1px solid #f1ecdc' }}>
      <td style={{
        padding: '3px 8px 3px 12px', whiteSpace: 'nowrap',
        color: '#94a3b8', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
      }}>
        {line.line_no}
      </td>
      <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
        {line.boot_ms != null ? line.boot_ms : ''}
      </td>
      <td style={{ padding: '3px 6px' }}>
        {s ? (
          <span style={{
            display: 'inline-block', minWidth: 36, textAlign: 'center',
            background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700,
            padding: '1px 6px', borderRadius: 3,
          }}>
            {line.level}
          </span>
        ) : null}
      </td>
      <td style={{ padding: '3px 8px', whiteSpace: 'nowrap', color: '#475569' }}>
        {line.tag || ''}
      </td>
      <td style={{ padding: '3px 12px 3px 8px', color: isParsed ? '#222' : '#64748b' }}>
        {isParsed ? line.message : (line.raw || ' ')}
      </td>
    </tr>
  );
}
