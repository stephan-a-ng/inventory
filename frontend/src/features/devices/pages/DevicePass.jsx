import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import AppSidebar from '@/shared/components/layout/AppSidebar';
import { formatRelativeTime } from '@/features/audit/utils/relativeTime';

import './DevicePass.css';

function getInitials(name) {
  if (!name) return '··';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '··';
}

/**
 * Return all audit entries that represent a stage transition, oldest-first.
 * The backend logs single-device PATCH stage changes as action="updated" with
 * current_stage_id in new_value; bulk stage changes use action="stage_changed"
 * with stage_id in new_value. We treat both as stage transitions.
 */
function extractStageTransitions(audit) {
  if (!Array.isArray(audit)) return [];
  return audit
    .filter((e) => {
      const nv = e.new_value || {};
      return (
        e.action === 'stage_changed' ||
        (e.action === 'updated' && (nv.current_stage_id || nv.stage_id))
      );
    })
    .map((e) => {
      const nv = e.new_value || {};
      return {
        id: e.id,
        stage_id: nv.current_stage_id || nv.stage_id || null,
        when: e.created_at,
        by: e.user_name || null,
        actor_email: e.user_email || null,
      };
    })
    .sort((a, b) => new Date(a.when) - new Date(b.when));
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString(undefined, { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} · ${hh}:${mm}`;
}

function lastNameInitial(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function ActorLabel({ entry }) {
  if (!entry) return null;
  const label = entry.user_name || entry.user_email || 'system';
  return <span>{label}</span>;
}

function HistoryItem({ entry, stagesById }) {
  const nv = entry.new_value || {};
  const ov = entry.old_value || {};

  let what;
  let tag;
  if (entry.action === 'stage_changed' || (entry.action === 'updated' && (nv.current_stage_id || nv.stage_id))) {
    const toId = nv.current_stage_id || nv.stage_id;
    const fromId = ov.current_stage_id || ov.stage_id;
    const toName = stagesById.get(toId)?.name || 'a new stage';
    const fromName = fromId && fromId !== 'None' ? stagesById.get(fromId)?.name : null;
    tag = 'STAGE';
    what = fromName ? (
      <>
        Moved <span className="from">{fromName}</span>
        <span className="arrow">→</span>
        <span className="to">{toName}</span>
      </>
    ) : (
      <>
        Picked up <span className="to">{toName}</span>
      </>
    );
  } else if (entry.action === 'created') {
    tag = 'CREATED';
    what = <>Registered device</>;
  } else if (entry.action === 'deleted') {
    tag = 'DELETED';
    what = <>Deleted</>;
  } else {
    tag = entry.action ? entry.action.toUpperCase() : 'EVENT';
    const keys = Object.keys(nv);
    what = keys.length ? <>Updated <strong>{keys.join(', ')}</strong></> : <>Updated</>;
  }

  return (
    <div className="feed-item">
      <div className="feed-time">{formatRelativeTime(entry.created_at)}</div>
      <div className="feed-who">
        <ActorLabel entry={entry} />
      </div>
      <div className="feed-what">{what}</div>
      <div className="feed-tag">{tag}</div>
    </div>
  );
}

export default function DevicePass() {
  const { id } = useParams();
  const [device, setDevice] = useState(null);
  const [stages, setStages] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  // Field name (e.g. "serial" or "mac") that was most recently copied —
  // drives the brief "Copied" affordance on the stub.
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [deviceRes, stagesRes, auditRes] = await Promise.all([
          fetch(`/api/devices/${id}`, { credentials: 'include' }),
          fetch('/api/stages', { credentials: 'include' }),
          fetch(`/api/audit/${id}`, { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (deviceRes.ok) {
          const d = await deviceRes.json();
          setDevice(d);
          if (stagesRes.ok) {
            const all = await stagesRes.json();
            setStages(
              all
                .filter((s) => s.product_type === d.product_type)
                .sort((a, b) => a.order - b.order),
            );
          }
        }
        if (auditRes.ok) setAudit(await auditRes.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const stagesById = useMemo(() => {
    const m = new Map();
    stages.forEach((s) => m.set(s.id, s));
    return m;
  }, [stages]);

  const transitions = useMemo(() => extractStageTransitions(audit), [audit]);

  const currentIdx = device && stages.length
    ? stages.findIndex((s) => s.id === device.current_stage_id)
    : -1;
  const currentStage = currentIdx >= 0 ? stages[currentIdx] : null;
  const atTerminal = currentIdx >= 0 && currentIdx === stages.length - 1;

  // Latest stage transition INTO the current stage → who picked it up.
  const pickedUp = useMemo(() => {
    if (!currentStage) return null;
    for (let i = transitions.length - 1; i >= 0; i -= 1) {
      if (transitions[i].stage_id === currentStage.id) return transitions[i];
    }
    return null;
  }, [transitions, currentStage]);

  // Build "completed stages" list — for each stage with order < current, find
  // the transition that moved AWAY from it (i.e. the time at which it was
  // completed).
  const completedStages = useMemo(() => {
    if (!currentStage) return [];
    const past = stages.filter((s) => s.order < currentStage.order);
    return past.map((stage) => {
      // The earliest transition whose preceding state was this stage.
      // Equivalent: the earliest transition INTO any later stage that comes
      // after this one was the moment this stage finished. Simpler heuristic:
      // find the transition INTO the NEXT stage after `stage` and use its time.
      const nextIdx = stages.findIndex((s) => s.id === stage.id) + 1;
      const next = stages[nextIdx];
      const exitTransition = next
        ? transitions.find((t) => t.stage_id === next.id)
        : null;
      return {
        stage,
        when: exitTransition?.when || null,
        by: exitTransition?.by || null,
      };
    });
  }, [stages, transitions, currentStage]);

  async function copyToClipboard(value, field) {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for older browsers / non-secure contexts.
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(field);
    } catch {
      // Swallow — clipboard permission can fail in odd environments and
      // there's nothing useful we can do here.
    }
  }

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  if (loading) {
    return (
      <div className="dp-shell">
        <AppSidebar />
        <main className="dp-main dp-center">
          <div className="dp-spinner" />
        </main>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="dp-shell">
        <AppSidebar />
        <main className="dp-main dp-center">
          <span className="dp-empty">Device not found</span>
        </main>
      </div>
    );
  }

  const totalStages = stages.length || 0;
  const stageNum = currentIdx >= 0 ? currentIdx + 1 : 0;
  const stageName = currentStage?.name || 'Not yet started';
  const statusLabel = currentStage
    ? (atTerminal ? 'Completed' : 'In progress')
    : 'Not started';
  const statusClass = currentStage ? (atTerminal ? 'is-done' : 'is-now') : 'is-empty';

  return (
    <div className="dp-shell">
      <AppSidebar />
      <main className="dp-main">
        <div className="dp-page">
          <Link to="/devices" className="dp-back">← Back to devices</Link>

          <section className="pass">
            <div className="stub-edge" aria-hidden="true" />

            <div className="body">
              <div className="meta">
                <span className="yb" />
                Commissioning
                <span className="sep">·</span>
                {currentStage ? (atTerminal ? 'complete' : 'in progress') : 'not started'}
              </div>

              <div className="stage-row">
                <div className="stage-num">
                  {totalStages > 0 ? (
                    <>
                      STAGE {String(stageNum).padStart(2, '0')}{' '}
                      <span className="of">/ {String(totalStages).padStart(2, '0')}</span>
                    </>
                  ) : (
                    <>NO STAGES CONFIGURED</>
                  )}
                </div>
              </div>
              <h1 className="stage-name">{stageName}</h1>

              <div className={`status-line ${statusClass}`}>
                <span className="pulse" />
                {statusLabel}
              </div>

              {pickedUp && (
                <div className="who-line">
                  <div className="av">{getInitials(pickedUp.by)}</div>
                  <div>
                    <strong>{pickedUp.by || 'Unknown'}</strong>
                    {' '}picked this up
                    <span className="since"> · {formatRelativeTime(pickedUp.when)}</span>
                  </div>
                </div>
              )}

              <hr />

              {totalStages > 0 && (
                <div className="progress" aria-hidden="true">
                  {stages.map((s, i) => {
                    let cls = '';
                    if (currentIdx >= 0 && i < currentIdx) cls = 'done';
                    else if (currentIdx >= 0 && i === currentIdx) {
                      cls = atTerminal ? 'done' : 'now';
                    }
                    return <div key={s.id} className={`seg ${cls}`} />;
                  })}
                </div>
              )}

              {completedStages.length > 0 && (
                <>
                  <div className="past-head">Completed stages</div>
                  <div className="past">
                    {completedStages.map(({ stage, when, by }, i) => (
                      <div key={stage.id} className="row">
                        <span className="tick" aria-hidden="true">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                            <path d="m5 12 5 5 9-10" />
                          </svg>
                        </span>
                        <div className="n">
                          <span className="num">{String(i + 1).padStart(2, '0')}</span>
                          {stage.name}
                        </div>
                        <div className="when">{when ? shortDate(when) : '—'}</div>
                        <div className="by">{by ? lastNameInitial(by) : '—'}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {currentStage && (
                <div className="advance-row">
                  <Link to={`/devices/${id}/details`} className="advance">
                    <span>Open {currentStage.name}</span>
                    <span className="advance-trailing">
                      <span className="arr" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square">
                          <path d="M5 12h14M13 5l7 7-7 7" />
                        </svg>
                      </span>
                    </span>
                  </Link>
                </div>
              )}
            </div>

            <aside className="stub">
              <div className="field">
                <div className="lbl">
                  <span className="lbl-text">
                    Serial
                    <Link
                      to="/serial-format"
                      className="serial-info-dot"
                      aria-label="What does this serial number mean?"
                      title="Serial-number format"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8h.01" />
                        <path d="M11 12h1v5h1" />
                      </svg>
                    </Link>
                  </span>
                  <span className={`copy-hint${copied === 'serial' ? ' is-on' : ''}`} aria-live="polite">
                    {copied === 'serial' ? 'Copied' : 'Copy'}
                  </span>
                </div>
                <button
                  type="button"
                  className="serial serial-display is-copyable"
                  onClick={() => copyToClipboard(device.serial_number, 'serial')}
                  disabled={!device.serial_number}
                  title={device.serial_number ? 'Click to copy' : undefined}
                >
                  {device.serial_number || '—'}
                </button>
              </div>
              <div className="field">
                <div className="lbl">
                  <span className="lbl-text">MAC</span>
                  <span className={`copy-hint${copied === 'mac' ? ' is-on' : ''}`} aria-live="polite">
                    {copied === 'mac' ? 'Copied' : 'Copy'}
                  </span>
                </div>
                <button
                  type="button"
                  className="mac mac-display is-copyable"
                  onClick={() => copyToClipboard(device.mac_address, 'mac')}
                  title="Click to copy"
                >
                  {device.mac_address}
                </button>
              </div>
              <div className="field">
                <div className="lbl">Type</div>
                <span className="type">{device.product_type}</span>
              </div>
              <Link to={`/devices/${id}/details`} className="stub-more">
                View full details →
              </Link>
            </aside>
          </section>

          <details className="disclosure" open>
            <summary>
              <span className="disclosure-left">
                <span className="chev">▸</span>
                <span>History</span>
                {audit.length > 0 && (
                  <span className="count">
                    · {audit.length} event{audit.length === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              <Link to={`/devices/${id}/details`} className="count disclosure-link">
                View audit log ↗
              </Link>
            </summary>
            <div className="feed">
              {audit.length === 0 ? (
                <div className="feed-empty">No activity yet.</div>
              ) : (
                audit
                  .slice(0, 5)
                  .map((entry) => (
                    <HistoryItem key={entry.id} entry={entry} stagesById={stagesById} />
                  ))
              )}
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
