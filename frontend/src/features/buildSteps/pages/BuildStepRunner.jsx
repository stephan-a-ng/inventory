import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Camera, ArrowLeft, ArrowRight, Trash2, ImagePlus } from 'lucide-react';
import AppSidebar from '@/shared/components/layout/AppSidebar';
import { authFetch } from '@/shared/lib/api';
import {
  getWorkerView,
  toggleStep,
  uploadDevicePhoto,
  deleteDevicePhoto,
} from '../lib/api';
import useCameraCapture, { isCameraSupported } from '../hooks/useCameraCapture';
import './BuildStepRunner.css';

export default function BuildStepRunner() {
  const { deviceId, stageKey, stepId } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
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

  useEffect(() => { reload(); }, [reload]);

  const steps = view?.steps || [];
  const idx = steps.findIndex((s) => s.step.id === stepId);
  const current = idx >= 0 ? steps[idx] : null;
  const prevStep = idx > 0 ? steps[idx - 1] : null;
  const nextStep = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;

  function patchCurrent(patch) {
    setView((v) => v && ({
      ...v,
      steps: v.steps.map((s) => s.step.id === stepId ? { ...s, ...patch(s) } : s),
    }));
  }

  async function onToggle(checked) {
    patchCurrent((s) => ({ status: { ...s.status, checked, checked_at: checked ? new Date().toISOString() : null } }));
    try {
      const status = await toggleStep(deviceId, stepId, checked);
      patchCurrent(() => ({ status }));
    } catch (e) {
      setError(e);
      reload();
    }
  }

  async function onCaptured(blob) {
    try {
      const photo = await uploadDevicePhoto(deviceId, stepId, blob, `step-${stepId}-${Date.now()}.jpg`);
      patchCurrent((s) => ({ photos: [...s.photos, photo] }));
    } catch (e) {
      setError(e);
    }
  }

  async function onDeletePhoto(photoId) {
    if (!confirm('Delete this photo?')) return;
    try {
      await deleteDevicePhoto(deviceId, photoId);
      patchCurrent((s) => ({ photos: s.photos.filter((p) => p.id !== photoId) }));
    } catch (e) {
      setError(e);
    }
  }

  const photosOk = current ? current.photos.length >= (current.step.required_photo_count || 0) : false;
  const canAdvance = !!current && current.status.checked && photosOk;

  function goToStep(s) {
    navigate(`/devices/${deviceId}/stages/${stageKey}/steps/${s.step.id}`);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <div className="step-runner">
          <a
            className="sr-back"
            onClick={() => navigate(`/devices/${deviceId}/stages/${stageKey}`)}
            style={{ cursor: 'pointer' }}
          >
            <ArrowLeft size={13} /> Back to {stageKey.toLowerCase()} steps
          </a>

          {device && (
            <div className="sr-dev-chip">
              <span className="type">{device.product_type}</span>
              <span className="ser">{device.serial_number || device.device_name || 'Unknown'}</span>
              <span className="div" />
              <span className="meta">{device.mac_address}</span>
              <span className="div" />
              <span className="meta">
                {stageKey} · Step {idx >= 0 ? String(idx + 1).padStart(2, '0') : '—'} of{' '}
                {String(steps.length).padStart(2, '0')}
              </span>
              <span className="spacer" />
              <a
                className="meta"
                onClick={() => navigate(`/devices/${deviceId}/details`)}
                style={{ cursor: 'pointer' }}
              >Save &amp; exit ↗</a>
            </div>
          )}

          {loading ? (
            <div style={{ padding: 24, fontFamily: 'var(--m5-font-mono)', fontSize: 13, color: 'var(--m5-muted)' }}>
              Loading step…
            </div>
          ) : !current ? (
            <div style={{ padding: 24, fontFamily: 'var(--m5-font-mono)', fontSize: 13, color: 'var(--m5-muted)' }}>
              Step not found. <a onClick={() => navigate(`/devices/${deviceId}/stages/${stageKey}`)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Back to step list.</a>
            </div>
          ) : (
            <>
              <section className="sr-head">
                <div>
                  <div className="lbl"><span className="yb" />Build step</div>
                  <h1>{current.step.title}</h1>
                  {current.step.description && <p>{current.step.description}</p>}
                </div>
                <div className="r">
                  <div className="lbl-r">Step</div>
                  <div className="v">
                    {String(idx + 1).padStart(2, '0')}
                    <span className="total">/{String(steps.length).padStart(2, '0')}</span>
                  </div>
                  <div className="est">
                    {current.step.required_photo_count > 0 ? `${current.photos.length} / ${current.step.required_photo_count} photo${current.step.required_photo_count === 1 ? '' : 's'}` : 'no photo required'}
                  </div>
                </div>
              </section>

              <div className="sr-prog">
                {steps.map((s, i) => (
                  <div
                    key={s.step.id}
                    className={`seg ${i < idx ? 'done' : i === idx ? 'now' : ''}`}
                  />
                ))}
              </div>

              <div className="sr-work">
                <aside className="sr-diagram">
                  <div className="topbar">
                    <span className="ref">FIG · {current.step.title}</span>
                    <span>Reference</span>
                  </div>
                  <div className="body">
                    {current.step.reference_photo_url ? (
                      <img src={current.step.reference_photo_url} alt={`Reference for ${current.step.title}`} />
                    ) : (
                      <div className="empty">
                        No reference photo attached.
                        <br />
                        Admins can upload one in Settings → Build steps.
                      </div>
                    )}
                  </div>
                </aside>

                <div className="sr-checks">
                  {/* Ordered sub-steps (read-only instructions) */}
                  {current.sub_steps && current.sub_steps.length > 0 && (
                    <div className="sr-check">
                      <div className="row">
                        <span className="toggle" aria-hidden="true" style={{
                          background: 'var(--m5-cream-deep)', border: '1.5px solid var(--m5-rule)',
                        }} />
                        <div>
                          <div className="lbl">Follow these steps in order</div>
                          <div className="sub">
                            {current.sub_steps.length} sub-step{current.sub_steps.length === 1 ? '' : 's'}
                          </div>
                        </div>
                        <span className="req">Instructions</span>
                      </div>
                      <div className="input-area">
                        <ol style={{
                          listStyle: 'none', counterReset: 'sub', padding: 0, margin: 0,
                          display: 'flex', flexDirection: 'column', gap: 10,
                        }}>
                          {current.sub_steps.map((sub) => (
                            <li
                              key={sub.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '28px 1fr',
                                gap: 10,
                                padding: '6px 0',
                                borderBottom: '1px solid var(--m5-rule)',
                                counterIncrement: 'sub',
                              }}
                            >
                              <span style={{
                                fontFamily: 'var(--m5-font-mono)',
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--m5-muted)',
                                paddingTop: 3,
                              }}>{String(sub.sort_order + 1).padStart(2, '0')}</span>
                              <div>
                                <div style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  letterSpacing: '-0.005em',
                                  lineHeight: 1.3,
                                }}>{sub.title}</div>
                                {sub.description && (
                                  <div style={{
                                    fontSize: 13,
                                    color: 'var(--m5-ink-soft)',
                                    lineHeight: 1.45,
                                    marginTop: 4,
                                    whiteSpace: 'pre-wrap',
                                  }}>{sub.description}</div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}

                  {/* Checkbox card */}
                  <div className={`sr-check ${current.status.checked ? 'checked' : ''}`}>
                    <div className="row">
                      <button
                        className="toggle"
                        aria-pressed={current.status.checked}
                        onClick={() => onToggle(!current.status.checked)}
                      >
                        {current.status.checked && <Check size={14} strokeWidth={3} />}
                      </button>
                      <div>
                        <div className="lbl"><span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--m5-muted)', marginRight: 10 }}>01</span>Mark this step complete</div>
                        <div className="sub">
                          {current.status.checked && current.status.checked_at
                            ? `Checked at ${new Date(current.status.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Tap when the work is done — counts toward stage advance.'}
                        </div>
                      </div>
                      <span className="req">Checkbox</span>
                    </div>
                  </div>

                  {current.step.required_photo_count > 0 && (
                    <PhotoCaptureCard
                      step={current.step}
                      photos={current.photos}
                      onCaptured={onCaptured}
                      onDelete={onDeletePhoto}
                    />
                  )}
                </div>
              </div>

              {error && (
                <div style={{
                  padding: '10px 16px',
                  background: '#fdecec',
                  border: '1px solid #f1c0c0',
                  color: '#9b2828',
                  fontFamily: 'var(--m5-font-mono)',
                  fontSize: 12,
                  marginBottom: 12,
                }}>
                  {error.message}
                </div>
              )}

              <div className="sr-footer">
                <button
                  className="prev"
                  onClick={() => prevStep && goToStep(prevStep)}
                  disabled={!prevStep}
                  style={prevStep ? {} : { opacity: 0.4, cursor: 'not-allowed' }}
                >
                  <ArrowLeft size={14} /> Previous step
                </button>
                <div className="req-note">
                  {current.step.required_photo_count > 0 && !photosOk ? (
                    <><strong>{current.photos.length} of {current.step.required_photo_count}</strong> photos taken — both required before advancing</>
                  ) : !current.status.checked ? (
                    <>Mark this step complete before advancing</>
                  ) : nextStep ? (
                    <>Ready — advance to the next step</>
                  ) : (
                    <>Last step of {stageKey.toLowerCase()}.</>
                  )}
                </div>
                <button
                  className="next"
                  onClick={() => nextStep ? goToStep(nextStep) : navigate(`/devices/${deviceId}/stages/${stageKey}`)}
                  disabled={!canAdvance}
                >
                  {nextStep ? 'Next step' : 'Finish stage'}
                  <span className="arr"><ArrowRight size={14} /></span>
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ── photo capture card ──────────────────────────────────────────────────────
function PhotoCaptureCard({ step, photos, onCaptured, onDelete }) {
  const required = step.required_photo_count;
  const fileRef = useRef(null);
  const slotCount = Math.max(required, photos.length, 1);
  const supported = isCameraSupported();
  const { videoRef, start, stop, capture, isStreaming, error } = useCameraCapture();
  const [busy, setBusy] = useState(false);

  // Auto-stop the stream when all required photos are captured.
  useEffect(() => {
    if (photos.length >= required && isStreaming) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, required, isStreaming]);

  async function onShutter() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await capture();
      await onCaptured(blob);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onCaptured(file);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const done = photos.length >= required;
  const checked = done;

  return (
    <div className={`sr-check ${checked ? 'checked' : ''}`}>
      <div className="row">
        <div className="toggle" aria-hidden="true">
          {checked && <Check size={14} strokeWidth={3} />}
        </div>
        <div>
          <div className="lbl">
            <span style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--m5-muted)', marginRight: 10 }}>02</span>
            Capture {required === 1 ? 'a proof photo' : `${required} proof photos`}
          </div>
          <div className="sub">
            <span className="pill">{photos.length} / {required}</span>{' '}
            {done ? 'all photos captured' : 'required before this step can be marked complete'}
          </div>
        </div>
        <span className="req">{required === 1 ? '1 photo' : `${required} photos`}</span>
      </div>
      <div className="input-area">
        <div className="sr-photo-row" style={{ '--photo-slot-count': slotCount }}>
          {/* Live camera tile */}
          <div className="sr-cam">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="vf" />
            <span className="bracket b-tl" /><span className="bracket b-tr" />
            <span className="bracket b-bl" /><span className="bracket b-br" />
            <span className="lbl-cam"><span className="live-dot" />{isStreaming ? 'Live · device cam' : 'Tap to start cam'}</span>
            {!isStreaming && !error && (
              <button type="button" className="start-btn" onClick={start} disabled={!supported}>
                <Camera size={22} />
                {supported ? 'Start camera' : 'Camera not supported · use upload below'}
              </button>
            )}
            {error && (
              <div className="cam-error">
                <Camera size={18} />
                <div>{error.message || 'Camera unavailable'}</div>
                <div style={{ opacity: 0.6, fontSize: 10 }}>Use the upload button below.</div>
              </div>
            )}
            {isStreaming && (
              <button
                type="button"
                className="shutter"
                aria-label="Capture photo"
                onClick={onShutter}
                disabled={busy || done}
              >
                <Camera size={20} strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Slots */}
          {Array.from({ length: slotCount }).map((_, i) => {
            const photo = photos[i];
            return photo ? (
              <div className="sr-shot" key={photo.id}>
                <button
                  className="delete-btn"
                  aria-label="Delete photo"
                  title="Delete photo"
                  onClick={() => onDelete(photo.id)}
                >
                  <Trash2 size={12} />
                </button>
                <div className="body-area">
                  {photo.url ? (
                    <img src={photo.url} alt={`Capture ${i + 1}`} />
                  ) : (
                    <div className="cap"><strong>Photo {i + 1}</strong>(no preview)</div>
                  )}
                </div>
                <div className="meta">
                  <span>#{i + 1}</span>
                  <span>{new Date(photo.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ) : (
              <div className="sr-shot empty" key={`empty-${i}`}>
                <div className="body-area">
                  <div className="cap">
                    <strong>Photo {i + 1}</strong>
                    {i < required ? 'Required' : 'Optional'}
                  </div>
                </div>
                <div className="meta"><span>—</span><span>—</span></div>
              </div>
            );
          })}
        </div>

        {/* Upload fallback — visible alongside camera so users can pick existing photos too. */}
        <div className="sr-fallback">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            id={`upload-${step.id}`}
          />
          <label htmlFor={`upload-${step.id}`}>
            <ImagePlus size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Upload from gallery or system camera
          </label>
        </div>
      </div>
    </div>
  );
}
