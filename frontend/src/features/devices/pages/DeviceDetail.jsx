import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppSidebar from '@/shared/components/layout/AppSidebar';
import StageIndicator from '@/features/devices/components/StageIndicator';
import DeviceForm from '@/features/devices/components/DeviceForm';
import AuditTimeline from '@/features/audit/components/AuditTimeline';
import { ArrowLeft, ArrowRight, Edit, Download, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import useAuth from '@/features/auth/useAuth';

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [device, setDevice] = useState(null);
  const [stages, setStages] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [subsystems, setSubsystems] = useState([]);
  const [boardRevisions, setBoardRevisions] = useState([]);
  const [revisionEdits, setRevisionEdits] = useState({});
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  useEffect(() => {
    loadDevice();
    loadAudit();
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
          const allStages = await stagesRes.json();
          setStages(allStages.filter((s) => s.product_type === d.product_type).sort((a, b) => a.order - b.order));
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
      // Initialize edit state from existing data
      const edits = {};
      revs.forEach(r => {
        edits[r.subsystem_id] = { revision: r.revision || '', component_number: r.component_number || '' };
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
    const nextStage = stages[currentIdx + 1];
    if (!confirm(`Advance to ${nextStage.name}?`)) return;

    const res = await fetch(`/api/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ current_stage_id: nextStage.id }),
    });
    if (res.ok) {
      loadDevice();
      loadAudit();
    }
  }

  async function downloadQR() {
    const res = await fetch(`/api/devices/${id}/qr`, { credentials: 'include' });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${device.mac_address.replace(/:/g, '')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const ghostBtn = (key) => ({
    height: 38,
    padding: '0 16px',
    border: '1px solid var(--m5-rule)',
    background: hoveredBtn === key ? 'var(--m5-cream-deep)' : 'var(--m5-cream)',
    color: 'var(--m5-ink)',
    fontWeight: 600,
    fontSize: 13.5,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.12s ease',
  });

  const primaryBtn = (key) => ({
    height: 38,
    padding: '0 16px',
    border: hoveredBtn === key ? '1px solid var(--m5-yellow-deep, #e6bc00)' : '1px solid var(--m5-yellow)',
    background: hoveredBtn === key ? 'var(--m5-yellow-deep, #e6bc00)' : 'var(--m5-yellow)',
    color: 'var(--m5-ink)',
    fontWeight: 600,
    fontSize: 13.5,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background 0.12s ease, border-color 0.12s ease',
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 32,
            height: 32,
            border: '2px solid var(--m5-yellow)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
        </main>
      </div>
    );
  }

  if (!device) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--m5-muted)', fontFamily: 'var(--m5-font-mono)', fontSize: 13 }}>
            Device not found
          </span>
        </main>
      </div>
    );
  }

  const currentIdx = stages.findIndex((s) => s.id === device.current_stage_id);
  const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* M5 topbar */}
        <header style={{ padding: '24px 40px 0', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div>
            <div style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
              marginBottom: 6,
            }}>
              MoonFive / Inventory / Device
            </div>
            <h1 style={{
              fontSize: 48,
              fontWeight: 900,
              letterSpacing: '-0.035em',
              lineHeight: 1,
              margin: 0,
              color: 'var(--m5-ink)',
            }}>
              {device.hostname || device.mac_address}.
            </h1>
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginLeft: 'auto',
            paddingBottom: 4,
          }}>
            <button
              style={ghostBtn('back')}
              onMouseEnter={() => setHoveredBtn('back')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => navigate('/')}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            {canEdit && (
              <button
                style={ghostBtn('edit')}
                onMouseEnter={() => setHoveredBtn('edit')}
                onMouseLeave={() => setHoveredBtn(null)}
                onClick={() => setShowEdit(true)}
              >
                <Edit size={16} />
                Edit
              </button>
            )}
            {canEdit && nextStage && (
              <button
                style={primaryBtn('advance')}
                onMouseEnter={() => setHoveredBtn('advance')}
                onMouseLeave={() => setHoveredBtn(null)}
                onClick={advanceStage}
              >
                <ArrowRight size={16} />
                Advance to {nextStage.name}
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: '28px 40px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Stage Pipeline */}
          <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--m5-rule)',
              background: 'var(--m5-cream-deep)',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
            }}>
              Commissioning Pipeline
            </div>
            <div style={{ padding: '20px' }}>
              <StageIndicator stages={stages} currentStageId={device.current_stage_id} />
            </div>
          </div>

          {/* Device Info + QR */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>
            {/* Device Info */}
            <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--m5-rule)',
                background: 'var(--m5-cream-deep)',
                fontFamily: 'var(--m5-font-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--m5-muted)',
              }}>
                Device Information
              </div>
              <div style={{ padding: '20px' }}>
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                  {[
                    ['MAC Address', device.mac_address],
                    ['Product Type', device.product_type],
                    ['Serial Number', device.serial_number],
                    ['Firmware', device.firmware_version],
                    ['Hardware Rev', device.hardware_revision],
                    ['Location', device.location],
                    ['Site', device.site_name],
                    ['Created', new Date(device.created_at).toLocaleString()],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt style={{ fontSize: 11, fontFamily: 'var(--m5-font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--m5-muted)', marginBottom: 4 }}>{label}</dt>
                      <dd style={{ fontSize: 14, color: 'var(--m5-ink)', fontWeight: 500 }}>{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
                {device.notes && (
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--m5-rule)' }}>
                    <p style={{ fontSize: 11, fontFamily: 'var(--m5-font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--m5-muted)', marginBottom: 6 }}>Notes</p>
                    <p style={{ fontSize: 14, color: 'var(--m5-ink)' }}>{device.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* QR Code */}
            <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--m5-rule)',
                background: 'var(--m5-cream-deep)',
                fontFamily: 'var(--m5-font-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--m5-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <QrCode size={12} />
                QR Code
              </div>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ background: '#fff', padding: 16 }}>
                  <QRCodeSVG value={device.mac_address} size={160} />
                </div>
                <button
                  style={ghostBtn('download')}
                  onMouseEnter={() => setHoveredBtn('download')}
                  onMouseLeave={() => setHoveredBtn(null)}
                  onClick={downloadQR}
                >
                  <Download size={14} />
                  Download PNG
                </button>
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--m5-rule)',
              background: 'var(--m5-cream-deep)',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--m5-muted)',
            }}>
              Audit Trail
            </div>
            <div style={{ padding: '20px' }}>
              <AuditTimeline entries={audit} />
            </div>
          </div>

          {/* Board Revisions */}
          {subsystems.length > 0 && (
            <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
              <div style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--m5-rule)',
                background: 'var(--m5-cream-deep)',
                fontFamily: 'var(--m5-font-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--m5-muted)',
              }}>
                Board Revisions
              </div>
              <div style={{ padding: '20px' }}>
                <div className="space-y-3">
                  {subsystems.map((sub) => {
                    const edit = revisionEdits[sub.id] || { revision: '', component_number: '' };
                    return (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, width: 144, flexShrink: 0 }}>{sub.name}</span>
                        <input
                          type="text"
                          value={edit.revision}
                          onChange={(e) => setRevisionEdits(prev => ({ ...prev, [sub.id]: { ...edit, revision: e.target.value } }))}
                          placeholder="Revision (e.g. Rev B)"
                          disabled={!canEdit}
                          style={{ flex: 1, minWidth: 0, height: 32, border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', padding: '0 12px', fontSize: 12, borderRadius: 0, outline: 'none', opacity: canEdit ? 1 : 0.5 }}
                        />
                        <input
                          type="text"
                          value={edit.component_number}
                          onChange={(e) => setRevisionEdits(prev => ({ ...prev, [sub.id]: { ...edit, component_number: e.target.value } }))}
                          placeholder="Part number"
                          disabled={!canEdit}
                          style={{ flex: 1, minWidth: 0, height: 32, border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', padding: '0 12px', fontSize: 12, borderRadius: 0, outline: 'none', opacity: canEdit ? 1 : 0.5 }}
                        />
                        {canEdit && (
                          <button onClick={() => saveRevision(sub.id)} style={{ height: 32, padding: '0 14px', border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)', color: 'var(--m5-ink)', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 0, flexShrink: 0 }}>
                            Save
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {showEdit && (
        <DeviceForm
          device={device}
          onClose={() => setShowEdit(false)}
          onSaved={() => { loadDevice(); loadAudit(); }}
        />
      )}
    </div>
  );
}
