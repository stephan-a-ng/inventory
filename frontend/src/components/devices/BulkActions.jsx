import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, X } from 'lucide-react';
import useDeviceStore from '@/stores/deviceStore';

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
      <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-lg">
        <span className="text-sm font-medium">{selectedIds.size} selected</span>
        <Button size="sm" variant="outline" onClick={() => setShowStageDialog(true)}>
          <ArrowRight className="h-3 w-3 mr-1" /> Change Stage
        </Button>
        <Button size="sm" variant="ghost" onClick={clearSelection}>
          <X className="h-3 w-3" />
        </Button>
      </div>

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
