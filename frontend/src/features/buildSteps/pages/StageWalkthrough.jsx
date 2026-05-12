import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ArrowRight } from 'lucide-react';
import AppSidebar from '@/shared/components/layout/AppSidebar';
import { authFetch } from '@/shared/lib/api';
import { getWorkerView } from '../lib/api';
import './StageWalkthrough.css';

const STAGE_BLURBS = {
  Assembly: 'Build the unit. Follow each step in order and take any required proof photos.',
  Firmware: 'Flash and configure the unit. Capture proof photos on critical operations.',
  Calibration: 'Calibrate sensors and verify readings.',
};

export default function StageWalkthrough() {
  const { deviceId, stageKey } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [d, v] = await Promise.all([
        authFetch(`/api/devices/${deviceId}`).then((r) => r.ok ? r.json() : Promise.reject(new Error('Device fetch failed'))),
        getWorkerView(deviceId, stageKey),
      ]);
      setDevice(d);
      setView(v);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [deviceId, stageKey]);

  useEffect(() => { load(); }, [load]);

  // Find the current step (first not-checked) for the right-side counter.
  const steps = view?.steps || [];
  const doneCount = steps.filter((s) => s.status.checked && photoRequirementMet(s)).length;
  const currentIdx = steps.findIndex((s) => !(s.status.checked && photoRequirementMet(s)));
  const totalSteps = steps.length;

  function openStep(stepId) {
    navigate(`/devices/${deviceId}/stages/${stageKey}/steps/${stepId}`);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <div className="stage-walkthrough">
          <div className="sw-crumb">
            <a onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Inventory</a>
            <span>→</span>
            <a onClick={() => navigate(`/devices/${deviceId}/details`)} style={{ cursor: 'pointer' }}>
              {device?.device_name || device?.serial_number || 'Device'}
            </a>
            <span>→</span>
            <span className="here">{stageKey}</span>
          </div>

          {device && (
            <div className="sw-dev-chip">
              <span className="type">{device.product_type}</span>
              <span className="ser">{device.serial_number || device.device_name || 'Unknown'}</span>
              <span className="div" />
              <span className="meta">{device.mac_address}</span>
              {device.hardware_revision && (
                <>
                  <span className="div" />
                  <span className="meta">HW {device.hardware_revision}</span>
                </>
              )}
              <span className="spacer" />
              <a className="exit" onClick={() => navigate(`/devices/${deviceId}/details`)} style={{ cursor: 'pointer' }}>
                Save &amp; exit ↗
              </a>
            </div>
          )}

          <section className="sw-banner">
            <div>
              <div className="lbl"><span className="yb" />Stage · {stageKey}</div>
              <h1>{stageHeadline(stageKey)}</h1>
              <p>{STAGE_BLURBS[stageKey]}</p>
            </div>
            <div className="r">
              <div className="step">Step</div>
              <div className="v">
                {String(Math.min(currentIdx === -1 ? totalSteps : currentIdx + 1, totalSteps)).padStart(2, '0')}
                <span className="total">/{String(totalSteps).padStart(2, '0')}</span>
              </div>
            </div>
            <div className="sw-progress">
              {steps.map((s, i) => (
                <div
                  key={s.step.id}
                  className={`seg ${s.status.checked && photoRequirementMet(s) ? 'done' : i === currentIdx ? 'now' : ''}`}
                />
              ))}
            </div>
          </section>

          {loading ? (
            <div className="sw-empty">Loading…</div>
          ) : error ? (
            <div className="sw-empty" style={{ color: '#9b2828' }}>{error.message}</div>
          ) : steps.length === 0 ? (
            <div className="sw-empty">
              No {stageKey.toLowerCase()} steps have been authored for this revision.
              {view?.revision && (
                <div style={{ marginTop: 6 }}>
                  (Revision <b>{view.revision.label}</b> — ask an admin to add steps in Settings.)
                </div>
              )}
            </div>
          ) : (
            <section className="sw-steps">
              {steps.map((s, i) => {
                const checkedFully = s.status.checked && photoRequirementMet(s);
                const isCurrent = i === currentIdx;
                const isTodo = !checkedFully && !isCurrent;
                const photoMax = s.step.required_photo_count || 0;
                const photoCount = s.photos.length;
                return (
                  <a
                    key={s.step.id}
                    className={`sw-step-row ${checkedFully ? 'done' : isCurrent ? 'current' : 'todo'}`}
                    onClick={() => openStep(s.step.id)}
                    role="button"
                  >
                    <div className="num">
                      <span className="pip">
                        {checkedFully ? <Check size={12} /> : String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="n-lbl">{checkedFully ? 'Done' : isCurrent ? 'Now' : 'Next'}</span>
                    </div>
                    <div>
                      <div className="title">{s.step.title}</div>
                      {s.step.description && <div className="blurb">{s.step.description}</div>}
                    </div>
                    <div className="photos">
                      {photoMax > 0 ? (
                        <>
                          <span className="v">{photoCount} / {photoMax}</span> photo{photoMax === 1 ? '' : 's'}
                        </>
                      ) : (
                        <span style={{ color: 'var(--m5-muted)' }}>No photo</span>
                      )}
                    </div>
                    <div className="status">
                      {checkedFully ? `Done${s.status.checked_at ? ' · ' + new Date(s.status.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                        : isCurrent ? 'In progress' : 'Queued'}
                    </div>
                    <span className="go"><ArrowRight size={16} /></span>
                  </a>
                );
              })}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function stageHeadline(stageKey) {
  if (stageKey === 'Assembly') return 'Build the unit.';
  if (stageKey === 'Firmware') return 'Flash the firmware.';
  if (stageKey === 'Calibration') return 'Calibrate the unit.';
  return stageKey;
}

function photoRequirementMet(s) {
  const need = s.step.required_photo_count || 0;
  return s.photos.length >= need;
}
