import { useState } from 'react';
import { ArrowRight, Printer, Download, Edit2, X } from 'lucide-react';
import useDeviceStore from '@/features/devices/stores/deviceStore';
import { Button } from '@/shared/components/ui/button';

export default function BulkActions() {
  const { selectedIds, clearSelection, stages, fetchDevices } = useDeviceStore();
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [targetStage, setTargetStage] = useState('');
  const [loading, setLoading] = useState(false);

  if (selectedIds.size === 0) return null;

  async function handleBulkStage() {
    if (!targetStage) return;
    setLoading(true);
    try {
      const res = await fetch('/api/devices/bulk-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          device_ids: Array.from(selectedIds),
          stage_id: targetStage,
        }),
      });
      if (res.ok) {
        clearSelection();
        setShowStageDialog(false);
        fetchDevices();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 14px',
          background: 'var(--m5-ink)',
          color: 'var(--m5-cream)',
          marginBottom: 0,
        }}
      >
        {/* Check indicator */}
        <div
          style={{
            width: 16,
            height: 16,
            background: 'var(--m5-yellow)',
            border: '1px solid var(--m5-yellow)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 0,
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--m5-ink)', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>
        </div>

        {/* Label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(250,247,238,0.65)',
            }}
          >
            Selected
          </span>
          <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: '-0.01em' }}>
            {selectedIds.size}
          </span>
          <span
            style={{
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(250,247,238,0.65)',
            }}
          >
            {selectedIds.size === 1 ? 'device' : 'devices'}
          </span>
        </div>

        {/* Actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <GhostButton onClick={() => setShowStageDialog(true)}>
            <ArrowRight size={13} /> Change stage
          </GhostButton>
          <GhostButton onClick={() => {}}>
            <Printer size={13} /> Print QR
          </GhostButton>
          <GhostButton onClick={() => window.open('/api/devices/export', '_blank')}>
            <Download size={13} /> Export
          </GhostButton>
          <YellowButton onClick={() => {}}>
            <Edit2 size={13} /> Bulk edit
          </YellowButton>
          <CloseButton onClick={clearSelection} />
        </div>
      </div>

      {/* Stage dialog — kept with Tailwind for now */}
      {showStageDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-sm mx-4 text-card-foreground">
            <h3 className="font-semibold mb-4">Change Stage for {selectedIds.size} devices</h3>
            <select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm mb-4"
            >
              <option value="">Select stage...</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.product_type})</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowStageDialog(false)}>Cancel</Button>
              <Button onClick={handleBulkStage} disabled={!targetStage || loading} className="cursor-pointer">
                {loading ? 'Updating...' : 'Apply'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GhostButton({ onClick, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 30,
        padding: '0 10px',
        background: hovered ? 'rgba(250,247,238,0.08)' : 'transparent',
        border: '1px solid var(--m5-rule-dark)',
        color: 'var(--m5-cream)',
        fontSize: '12.5px',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        borderRadius: 0,
        transition: 'background 0.1s ease',
      }}
    >
      {children}
    </button>
  );
}

function YellowButton({ onClick, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 30,
        padding: '0 10px',
        background: hovered ? 'var(--m5-yellow-deep)' : 'var(--m5-yellow)',
        border: `1px solid ${hovered ? 'var(--m5-yellow-deep)' : 'var(--m5-yellow)'}`,
        color: 'var(--m5-ink)',
        fontSize: '12.5px',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        borderRadius: 0,
        transition: 'background 0.1s ease, border-color 0.1s ease',
      }}
    >
      {children}
    </button>
  );
}

function CloseButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 30,
        width: 30,
        padding: 0,
        background: hovered ? 'rgba(250,247,238,0.08)' : 'transparent',
        border: '1px solid var(--m5-rule-dark)',
        color: 'var(--m5-cream)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        borderRadius: 0,
        transition: 'background 0.1s ease',
      }}
    >
      <X size={14} />
    </button>
  );
}
