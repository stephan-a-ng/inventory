import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import StageIndicator from '@/components/devices/StageIndicator';
import DeviceForm from '@/components/devices/DeviceForm';
import AuditTimeline from '@/components/audit/AuditTimeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Edit, Download, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import useAuth from '@/hooks/useAuth';

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

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center min-h-screen">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (!device) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center min-h-screen text-muted-foreground">
            Device not found
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const currentIdx = stages.findIndex((s) => s.id === device.current_stage_id);
  const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 p-4 border-b border-border">
          <SidebarTrigger />
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{device.device_name || device.mac_address}</h1>
            <p className="text-sm text-muted-foreground font-mono">{device.mac_address} · {device.product_type} — {device.current_stage_name || 'Unassigned'}</p>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setShowEdit(true)}>
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
              {nextStage && (
                <Button onClick={advanceStage} className="cursor-pointer">
                  <ArrowRight className="h-4 w-4 mr-1" /> Advance to {nextStage.name}
                </Button>
              )}
            </div>
          )}
        </header>

        <div className="p-4 space-y-4">
          {/* Stage Pipeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Commissioning Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <StageIndicator stages={stages} currentStageId={device.current_stage_id} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Device Info */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Device Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium mt-0.5">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
                {device.notes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-sm mt-1">{device.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* QR Code */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <QrCode className="h-4 w-4" /> QR Code
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG value={device.mac_address} size={160} />
                </div>
                <Button variant="outline" size="sm" onClick={downloadQR} className="cursor-pointer">
                  <Download className="h-4 w-4 mr-1" /> Download PNG
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Audit Trail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTimeline entries={audit} />
            </CardContent>
          </Card>

          {/* Board Revisions */}
          {subsystems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Board Revisions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {subsystems.map((sub) => {
                    const edit = revisionEdits[sub.id] || { revision: '', component_number: '' };
                    return (
                      <div key={sub.id} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                        <span className="text-sm font-medium w-36 shrink-0">{sub.name}</span>
                        <input
                          type="text"
                          value={edit.revision}
                          onChange={(e) => setRevisionEdits(prev => ({ ...prev, [sub.id]: { ...edit, revision: e.target.value } }))}
                          placeholder="Revision (e.g. Rev B)"
                          disabled={!canEdit}
                          className="flex h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-xs disabled:opacity-50"
                        />
                        <input
                          type="text"
                          value={edit.component_number}
                          onChange={(e) => setRevisionEdits(prev => ({ ...prev, [sub.id]: { ...edit, component_number: e.target.value } }))}
                          placeholder="Part number"
                          disabled={!canEdit}
                          className="flex h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-xs disabled:opacity-50"
                        />
                        {canEdit && (
                          <Button size="sm" variant="outline" onClick={() => saveRevision(sub.id)} className="cursor-pointer shrink-0">
                            Save
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {showEdit && (
          <DeviceForm
            device={device}
            onClose={() => setShowEdit(false)}
            onSaved={() => { loadDevice(); loadAudit(); }}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
