import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

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
 * Per-MCU parsed-line log table, rendered inline (no modal). When the
 * MCU has multiple captures, a small date selector at the top switches
 * between them. The lines table is scrollable inside a constrained
 * max-height so the surrounding page doesn't grow unbounded.
 */
export default function InlineLogPanel({ deviceId, mcuRole, captures }) {
  const { authFetch } = useAuth();

  // Sort captures newest-first and default to the most recent.
  const sortedCaptures = useMemo(
    () => [...(captures || [])].sort(
      (a, b) => new Date(b.captured_at) - new Date(a.captured_at),
    ),
    [captures],
  );
  const [selectedCaptureId, setSelectedCaptureId] = useState(
    sortedCaptures[0]?.id || null,
  );

  // Filter state.
  const [q, setQ] = useState('');
  const [levelToggles, setLevelToggles] = useState(
    Object.fromEntries(LEVELS.map((l) => [l, true])),
  );
  const [tagFilter, setTagFilter] = useState('');

  // Line buffer + paging.
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [doneStreaming, setDoneStreaming] = useState(false);
  const cursorRef = useRef(0);

  const anyFilterActive = useMemo(
    () => q.trim() !== '' || tagFilter.trim() !== ''
      || Object.values(levelToggles).some((v) => !v),
    [q, tagFilter, levelToggles],
  );

  const loadFirstPage = useCallback(async () => {
    if (!selectedCaptureId) return;
    setLoading(true);
    setError(null);
    setLines([]);
    cursorRef.current = 0;
    setDoneStreaming(false);
    try {
      if (anyFilterActive) {
        // Cross-cutting endpoint — server-side filter, scoped to device.
        const params = new URLSearchParams({
          device_id: deviceId,
          limit: String(PAGE),
        });
        if (q.trim()) params.set('q', q.trim());
        if (tagFilter.trim()) params.set('tag', tagFilter.trim());
        const activeLevels = LEVELS.filter((l) => levelToggles[l]);
        if (activeLevels.length === 1) params.set('level', activeLevels[0]);
        const r = await authFetch(`/api/flash-log-lines?${params}`);
        if (!r.ok) throw new Error(`${r.status}`);
        const data = await r.json();
        let result = (data.lines || []).filter(
          (l) => l.flash_log_id === selectedCaptureId,
        );
        if (activeLevels.length > 1 && activeLevels.length < LEVELS.length) {
          result = result.filter((l) => activeLevels.includes(l.level));
        }
        setLines(result);
        setDoneStreaming(true);
      } else {
        const r = await authFetch(
          `/api/devices/flash-logs/${selectedCaptureId}/lines?limit=${PAGE}`,
        );
        if (!r.ok) throw new Error(`${r.status}`);
        const data = await r.json();
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
  }, [authFetch, deviceId, selectedCaptureId, anyFilterActive, q, tagFilter, levelToggles]);

  const loadMore = useCallback(async () => {
    if (doneStreaming || anyFilterActive || !selectedCaptureId) return;
    try {
      const r = await authFetch(
        `/api/devices/flash-logs/${selectedCaptureId}/lines?after=${cursorRef.current}&limit=${PAGE}`,
      );
      if (!r.ok) return;
      const data = await r.json();
      const next = data.lines || [];
      setLines((prev) => [...prev, ...next]);
      cursorRef.current = data.next_after || cursorRef.current;
      if (!data.next_after || next.length < PAGE) setDoneStreaming(true);
    } catch { /* ignore */ }
  }, [authFetch, selectedCaptureId, doneStreaming, anyFilterActive]);

  useEffect(() => { loadFirstPage(); }, [loadFirstPage]);

  const distinctTags = useMemo(() => {
    const s = new Set();
    for (const l of lines) if (l.tag) s.add(l.tag);
    return [...s].sort();
  }, [lines]);

  if (sortedCaptures.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: '#888', fontStyle: 'italic' }}>
        No captures yet — run <code>flash_provision.py {mcuRole}</code> to record one.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sortedCaptures.length > 1 && (
        <CaptureSelector
          captures={sortedCaptures}
          selectedId={selectedCaptureId}
          onSelect={setSelectedCaptureId}
        />
      )}

      <FilterRow
        q={q} setQ={setQ}
        levelToggles={levelToggles} setLevelToggles={setLevelToggles}
        tagFilter={tagFilter} setTagFilter={setTagFilter}
        distinctTags={distinctTags}
      />

      <div
        style={{
          maxHeight: 480, overflow: 'auto',
          border: '1px solid #ece6d6', borderRadius: 6, background: 'white',
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
            loadMore();
          }
        }}
      >
        {loading && lines.length === 0 ? (
          <div style={{ padding: 16, color: '#888', fontSize: 12.5 }}>Loading lines…</div>
        ) : error ? (
          <div style={{ padding: 16, color: '#991b1b', fontSize: 12.5 }}>{error}</div>
        ) : lines.length === 0 ? (
          <div style={{ padding: 16, color: '#888', fontSize: 12.5 }}>No lines match.</div>
        ) : (
          <LinesTable lines={lines} />
        )}
        {!doneStreaming && !loading && !anyFilterActive && lines.length > 0 && (
          <div style={{ padding: 8, textAlign: 'center', color: '#888', fontSize: 11 }}>
            Scroll for more
          </div>
        )}
      </div>
    </div>
  );
}

function CaptureSelector({ captures, selectedId, onSelect }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ color: '#888', fontSize: 11 }}>Capture:</span>
      <select
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          border: '1px solid #d9d3c0', borderRadius: 6, padding: '4px 8px',
          fontSize: 12, background: 'white', fontFamily: 'var(--m5-font-mono)',
        }}
      >
        {captures.map((c) => (
          <option key={c.id} value={c.id}>
            {new Date(c.captured_at).toLocaleString()} · {c.line_count} lines
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterRow({ q, setQ, levelToggles, setLevelToggles, tagFilter, setTagFilter, distinctTags }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        border: '1px solid #d9d3c0', borderRadius: 6, padding: '4px 8px',
        background: 'white', flex: '1 1 200px', minWidth: 180,
      }}>
        <Search size={12} aria-hidden style={{ color: '#888' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search message…"
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, minWidth: 0 }}
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
                padding: '3px 8px', borderRadius: 999, fontSize: 10,
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
          border: '1px solid #d9d3c0', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, background: 'white',
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
      // table-layout: fixed pins the column widths to the colgroup so
      // one giant unbroken message (e.g. an INVENTORY: pair JSON blob,
      // ~1.5 KB of comma-no-space text) can't force the whole row wider
      // than the container.
      tableLayout: 'fixed',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 11.5,
    }}>
      <colgroup>
        <col style={{ width: 48 }} />   {/* line_no */}
        <col style={{ width: 64 }} />   {/* boot_ms */}
        <col style={{ width: 44 }} />   {/* level chip */}
        <col style={{ width: 120 }} />  {/* tag */}
        <col />                          {/* message — takes remaining */}
      </colgroup>
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
    <tr style={{ borderBottom: '1px solid #f4f0e2' }}>
      <td style={{
        padding: '2px 6px 2px 10px', whiteSpace: 'nowrap',
        color: '#94a3b8', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
      }}>
        {line.line_no}
      </td>
      <td style={{ padding: '2px 6px', whiteSpace: 'nowrap', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
        {line.boot_ms != null ? line.boot_ms : ''}
      </td>
      <td style={{ padding: '2px 4px' }}>
        {s ? (
          <span style={{
            display: 'inline-block', minWidth: 32, textAlign: 'center',
            background: s.bg, color: s.fg, fontSize: 9, fontWeight: 700,
            padding: '1px 5px', borderRadius: 3,
          }}>
            {line.level}
          </span>
        ) : null}
      </td>
      <td style={{
        padding: '2px 6px', color: '#475569',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
        title={line.tag || ''}
      >
        {line.tag || ''}
      </td>
      <td style={{
        padding: '2px 10px 2px 6px',
        color: isParsed ? '#222' : '#64748b',
        // Break long unbroken strings (JSON blobs, base64 SHAs, etc.)
        // so the column stays inside the table's fixed width.
        wordBreak: 'break-all',
        overflowWrap: 'anywhere',
      }}>
        {isParsed ? line.message : (line.raw || ' ')}
      </td>
    </tr>
  );
}
