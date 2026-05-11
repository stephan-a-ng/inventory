import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock, Download, Edit } from 'lucide-react';
import AppSidebar from '@/shared/components/layout/AppSidebar';
import DeviceForm from '@/features/devices/components/DeviceForm';
import useAuth from '@/features/auth/useAuth';
import { formatRelativeTime } from '@/features/audit/utils/relativeTime';
import './DeviceDetail.css';

const ASSEMBLY_NAMES = new Set(['assembly', 'build', 'mechanical']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function durationLabel(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m elapsed`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m elapsed`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h elapsed`;
}

function actionLabel(action) {
  if (!action) return 'Event';
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Walk the audit log (chronological order) and assign each stage an
 * "entered_at" / "exited_at" / "owner" + the audit entries that occurred
 * while the device was in that stage.
 */
function buildStageWindows(stages, audit, deviceCreatedAt, deviceCurrentStageId) {
  const sorted = [...(audit || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );

  const stageById = Object.fromEntries(stages.map((s) => [s.id, s]));
  const windows = Object.fromEntries(
    stages.map((s) => [s.id, { entered_at: null, exited_at: null, owner: null, events: [] }]),
  );

  // Seed: initial stage is whatever the "created" entry put the device into.
  // Fallback to first stage in pipeline.
  let activeStageId = null;
  const createdEntry = sorted.find((e) => e.action === 'created');
  if (createdEntry) {
    const initialStageId = createdEntry.new_value?.current_stage_id;
    if (initialStageId && windows[initialStageId]) {
      activeStageId = initialStageId;
      windows[initialStageId].entered_at = createdEntry.created_at;
      windows[initialStageId].owner = createdEntry.user_name || null;
    }
  }
  if (!activeStageId && stages.length) {
    activeStageId = stages[0].id;
    windows[activeStageId].entered_at = deviceCreatedAt || null;
  }

  for (const entry of sorted) {
    if (entry.action === 'stage_changed') {
      const nextStageId = entry.new_value?.current_stage_id;
      if (activeStageId && windows[activeStageId] && !windows[activeStageId].exited_at) {
        windows[activeStageId].exited_at = entry.created_at;
      }
      if (nextStageId && windows[nextStageId]) {
        activeStageId = nextStageId;
        windows[nextStageId].entered_at = entry.created_at;
        windows[nextStageId].owner = entry.user_name || windows[nextStageId].owner;
      }
      continue;
    }
    if (activeStageId && windows[activeStageId]) {
      windows[activeStageId].events.push(entry);
    }
  }

  // The current stage according to the device record overrides whatever the
  // audit log walk concluded — keeps things consistent if audit is sparse.
  if (deviceCurrentStageId && !stageById[deviceCurrentStageId]) {
    return windows;
  }
  return windows;
}

function stageStatus(stage, deviceCurrentStageId, stages) {
  const currentIdx = stages.findIndex((s) => s.id === deviceCurrentStageId);
  const thisIdx = stages.findIndex((s) => s.id === stage.id);
  if (thisIdx < 0 || currentIdx < 0) return 'todo';
  if (thisIdx < currentIdx) return 'done';
  if (thisIdx === currentIdx) return 'current';
  return 'todo';
}

function StatusChip({ status }) {
  if (status === 'done') {
    return (
      <span className="status-chip done">
        <Check size={11} strokeWidth={3} /> Completed
      </span>
    );
  }
  if (status === 'current') {
    return (
      <span className="status-chip current">
        <span className="pulse" /> In progress
      </span>
    );
  }
  return <span className="status-chip todo">Pending</span>;
}

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [device, setDevice] = useState(null);
  const [stages, setStages] = useState([]);
  const [audit, setAudit] = useState([]);
  const [subsystems, setSubsystems] = useState([]);
  const [boardRevisions, setBoardRevisions] = useState([]);
  const [revisionEdits, setRevisionEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [activeStageId, setActiveStageId] = useState(null);

  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  useEffect(() => {
    loadDevice();
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadDevice() {
    setLoading(true);
    try {
      const [deviceRes, stagesRes] = await Promise.all([
        fetch(`/api/devices/${id}`, { credentials: 'include' }),
        fetch('/api/stages', { credentials: 'include' }),
      ]);
      if (deviceRes.ok) {
        const d = await deviceRes.json();
        setDevice(d);
        if (stagesRes.ok) {
          const all = await stagesRes.json();
          const filtered = all
            .filter((s) => s.product_type === d.product_type)
            .sort((a, b) => a.order - b.order);
          setStages(filtered);
          setActiveStageId((prev) => prev || d.current_stage_id || filtered[0]?.id || null);
        }
        await loadBoardData(d.product_type);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadBoardData(productType) {
    const [subsRes, revRes] = await Promise.all([
      fetch(`/api/subsystems?product_type=${productType}`, { credentials: 'include' }),
      fetch(`/api/devices/${id}/board-revisions`, { credentials: 'include' }),
    ]);
    if (subsRes.ok) setSubsystems(await subsRes.json());
    if (revRes.ok) {
      const revs = await revRes.json();
      setBoardRevisions(revs);
      const edits = {};
      revs.forEach((r) => {
        edits[r.subsystem_id] = {
          revision: r.revision || '',
          component_number: r.component_number || '',
        };
      });
      setRevisionEdits(edits);
    }
  }

  async function loadAudit() {
    const res = await fetch(`/api/audit/${id}`, { credentials: 'include' });
    if (res.ok) setAudit(await res.json());
  }

  async function saveRevision(subsystemId) {
    const edit = revisionEdits[subsystemId] || {};
    const res = await fetch(`/api/devices/${id}/board-revisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        subsystem_id: subsystemId,
        revision: edit.revision || null,
        component_number: edit.component_number || null,
      }),
    });
    if (res.ok) {
      await loadBoardData(device.product_type);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || 'Failed to save board revision');
    }
  }

  async function advanceStage() {
    if (!device || !stages.length) return;
    const currentIdx = stages.findIndex((s) => s.id === device.current_stage_id);
    if (currentIdx < 0 || currentIdx >= stages.length - 1) return;
    const next = stages[currentIdx + 1];
    if (!confirm(`Advance to ${next.name}?`)) return;
    const res = await fetch(`/api/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ current_stage_id: next.id }),
    });
    if (res.ok) {
      setActiveStageId(next.id);
      loadDevice();
      loadAudit();
    }
  }

  async function downloadQR() {
    if (!device) return;
    const res = await fetch(`/api/devices/${id}/qr`, { credentials: 'include' });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${device.mac_address.replace(/:/g, '')}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stageWindows = useMemo(
    () => buildStageWindows(stages, audit, device?.created_at, device?.current_stage_id),
    [stages, audit, device?.created_at, device?.current_stage_id],
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0 }}>
          <div className="device-details-page">
            <div className="loading">Loading device…</div>
          </div>
        </main>
      </div>
    );
  }

  if (!device) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0 }}>
          <div className="device-details-page">
            <div className="not-found">Device not found</div>
          </div>
        </main>
      </div>
    );
  }

  const currentIdx = stages.findIndex((s) => s.id === device.current_stage_id);
  const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;
  const activeStage = stages.find((s) => s.id === activeStageId) || stages[currentIdx] || stages[0];
  const activeIdx = stages.findIndex((s) => s.id === activeStage?.id);
  const activeStatus = activeStage ? stageStatus(activeStage, device.current_stage_id, stages) : 'todo';
  const activeWindow = activeStage ? stageWindows[activeStage.id] : null;

  const isAssemblyPanel =
    activeStage && ASSEMBLY_NAMES.has(activeStage.name.toLowerCase());

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <div className="device-details-page">
          <button type="button" className="back" onClick={() => navigate(`/devices/${id}`)}>
            <ArrowLeft size={12} /> Back to overview
          </button>

          {/* header strip */}
          <section className="strip">
            <div>
              <div className="lbl">
                <span className="yb" />
                Device · details
              </div>
              <h1>Commissioning process</h1>
            </div>
            <div className="ident">
              {device.serial_number && <div className="ser">{device.serial_number}</div>}
              <div className="mac">{device.mac_address}</div>
              <span className="type">{device.product_type}</span>
            </div>
          </section>

          {/* actions */}
          <div className="actions">
            {canEdit && (
              <button type="button" className="btn" onClick={() => setShowEdit(true)}>
                <Edit size={14} />
                Edit
              </button>
            )}
            <button type="button" className="btn" onClick={downloadQR}>
              <Download size={14} />
              Download QR
            </button>
            {canEdit && nextStage && (
              <button type="button" className="btn btn-primary" onClick={advanceStage}>
                Advance to {nextStage.name}
                <span className="arr"><ArrowRight size={14} /></span>
              </button>
            )}
          </div>

          {/* stage tabs */}
          {stages.length > 0 && (
            <nav
              className="stage-tabs"
              style={{ '--stage-count': stages.length }}
              aria-label="Commissioning stages"
            >
              {stages.map((stage, idx) => {
                const status = stageStatus(stage, device.current_stage_id, stages);
                const isActive = stage.id === activeStage?.id;
                const className = [
                  'stage-tab',
                  status,
                  isActive ? 'active' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={stage.id}
                    type="button"
                    className={className}
                    onClick={() => {
                      setActiveStageId(stage.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    aria-pressed={isActive}
                  >
                    <div className="num-row">
                      <span className="pip">
                        {status === 'done' && (
                          <Check size={8} strokeWidth={3} />
                        )}
                      </span>
                      {pad2(idx + 1)}
                      {status === 'current' && ' · Now'}
                    </div>
                    <div className="name">{stage.name}</div>
                  </button>
                );
              })}
            </nav>
          )}

          {/* active stage panel */}
          {activeStage && (
            <section className="panel" aria-labelledby={`stage-${activeStage.id}-title`}>
              <div className="head">
                <div className="l">
                  <div className="step">
                    Stage {pad2(activeIdx + 1)}
                    {activeStatus === 'current' && ' · Now'}
                  </div>
                  <h2 id={`stage-${activeStage.id}-title`}>{activeStage.name}</h2>
                </div>
                <div className="r">
                  <StatusChip status={activeStatus} />
                </div>
              </div>

              {/* meta strip */}
              <div className="meta-strip">
                <div className="cell">
                  <div className="l">Started</div>
                  <div className="v mono">{formatDateTime(activeWindow?.entered_at)}</div>
                  {activeWindow?.entered_at && activeStatus === 'current' && (
                    <div className="sub">{formatRelativeTime(activeWindow.entered_at)}</div>
                  )}
                </div>
                <div className="cell">
                  <div className="l">{activeStatus === 'done' ? 'Finished' : 'Expected'}</div>
                  <div className="v mono">
                    {activeStatus === 'done'
                      ? formatDateTime(activeWindow?.exited_at)
                      : '—'}
                  </div>
                  {activeStatus === 'done' &&
                    activeWindow?.entered_at &&
                    activeWindow?.exited_at && (
                      <div className="sub">
                        {durationLabel(activeWindow.entered_at, activeWindow.exited_at)}
                      </div>
                    )}
                </div>
                <div className="cell">
                  <div className="l">Owner</div>
                  <div className="v">{activeWindow?.owner || '—'}</div>
                </div>
                <div className="cell">
                  <div className="l">Events</div>
                  <div className="v mono">{activeWindow?.events?.length ?? 0}</div>
                  {activeWindow?.events?.length > 0 && (
                    <div className="sub">
                      last {formatRelativeTime(
                        activeWindow.events[activeWindow.events.length - 1].created_at,
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* notes — show only on current stage if present */}
              {activeStatus === 'current' && device.notes && (
                <div className="note">
                  <strong>Notes</strong> — {device.notes}
                </div>
              )}

              {/* Assembly: board revisions inline */}
              {isAssemblyPanel && subsystems.length > 0 && (
                <div className="sec">
                  <div className="sh">
                    <h3>
                      <span className="yb" />
                      Board revisions
                    </h3>
                    <span className="sub">
                      {boardRevisions.length}/{subsystems.length} recorded
                    </span>
                  </div>
                  <div className="rev-grid">
                    {subsystems.map((sub) => {
                      const edit = revisionEdits[sub.id] || {
                        revision: '',
                        component_number: '',
                      };
                      return (
                        <div key={sub.id} className="rev-row">
                          <span className="sub-name">{sub.name}</span>
                          <input
                            type="text"
                            className="rev-input"
                            value={edit.revision}
                            onChange={(e) =>
                              setRevisionEdits((prev) => ({
                                ...prev,
                                [sub.id]: { ...edit, revision: e.target.value },
                              }))
                            }
                            placeholder="Revision (e.g. Rev B)"
                            disabled={!canEdit}
                            aria-label={`${sub.name} revision`}
                          />
                          <input
                            type="text"
                            className="rev-input"
                            value={edit.component_number}
                            onChange={(e) =>
                              setRevisionEdits((prev) => ({
                                ...prev,
                                [sub.id]: { ...edit, component_number: e.target.value },
                              }))
                            }
                            placeholder="Part number"
                            disabled={!canEdit}
                            aria-label={`${sub.name} part number`}
                          />
                          {canEdit && (
                            <button
                              type="button"
                              className="rev-save"
                              onClick={() => saveRevision(sub.id)}
                            >
                              Save
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stage events list — derived from audit log scoped to this window */}
              <div className="sec">
                <div className="sh">
                  <h3>
                    <span className="yb" />
                    Stage events
                  </h3>
                  {activeWindow?.events?.length > 0 && (
                    <span className="sub">
                      {activeWindow.events.length} event
                      {activeWindow.events.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {activeWindow?.events?.length ? (
                  <ul className="step-list">
                    {activeWindow.events.map((event) => (
                      <li key={event.id} className="done">
                        <span className="box">
                          <Check size={10} strokeWidth={3} />
                        </span>
                        <div className="lbl">{actionLabel(event.action)}</div>
                        <div className="when">{formatRelativeTime(event.created_at)}</div>
                        <div className="meta">{event.user_name || '—'}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="pending-box">
                    <Clock className="ic" strokeWidth={1.5} />
                    <h4>
                      {activeStatus === 'done'
                        ? 'No events recorded'
                        : activeStatus === 'current'
                          ? 'No events yet — waiting for activity'
                          : 'Queued'}
                    </h4>
                    <p>
                      {activeStatus === 'todo'
                        ? `Starts after stage ${pad2(activeIdx)}`
                        : 'Updates land here as work progresses'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {showEdit && (
        <DeviceForm
          device={device}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            loadDevice();
            loadAudit();
          }}
        />
      )}
    </div>
  );
}
