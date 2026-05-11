import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import useDeviceStore from '@/stores/deviceStore';

const PRODUCT_TYPES = ['AEMS', 'BEMS', 'CHARGER', 'NETWORKING'];

export default function DeviceForm({ device, onClose, onSaved }) {
  const { stages } = useDeviceStore();
  const [form, setForm] = useState({
    mac_address: device?.mac_address || '',
    product_type: device?.product_type || 'AEMS',
    serial_number: device?.serial_number || '',
    firmware_version: device?.firmware_version || '',
    hardware_revision: device?.hardware_revision || '',
    current_stage_id: device?.current_stage_id || '',
    location: device?.location || '',
    site_name: device?.site_name || '',
    notes: device?.notes || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!device;
  const filteredStages = stages.filter((s) => s.product_type === form.product_type);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const url = isEdit ? `/api/devices/${device.id}` : '/api/devices';
    const method = isEdit ? 'PATCH' : 'POST';
    const body = { ...form };
    if (!body.current_stage_id) delete body.current_stage_id;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to save device');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg mx-4 p-6 text-card-foreground">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">{isEdit ? 'Edit Device' : 'Add Device'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isEdit && device?.device_name && (
            <div>
              <label className="text-sm text-muted-foreground">Device Name</label>
              <Input value={device.device_name} disabled className="opacity-70" />
            </div>
          )}
          <div>
            <label className="text-sm text-muted-foreground">MAC Address *</label>
            <Input
              value={form.mac_address}
              onChange={(e) => setForm({ ...form, mac_address: e.target.value.toUpperCase() })}
              placeholder="AA:BB:CC:DD:EE:FF"
              required
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Product Type *</label>
            <select
              value={form.product_type}
              onChange={(e) => setForm({ ...form, product_type: e.target.value, current_stage_id: '' })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {isEdit && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Serial Number</label>
                  <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Stage</label>
                  <select
                    value={form.current_stage_id}
                    onChange={(e) => setForm({ ...form, current_stage_id: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Auto (first stage)</option>
                    {filteredStages.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Firmware Version</label>
                  <Input value={form.firmware_version} onChange={(e) => setForm({ ...form, firmware_version: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Hardware Revision</label>
                  <Input value={form.hardware_revision} onChange={(e) => setForm({ ...form, hardware_revision: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Location</label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Site Name</label>
                  <Input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Device'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
