import { useNavigate } from 'react-router-dom';
import useDeviceStore from '@/stores/deviceStore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DeviceTable() {
  const navigate = useNavigate();
  const { devices, total, page, pageSize, setPage, selectedIds, toggleSelect, selectAll, clearSelection, loading } = useDeviceStore();
  const totalPages = Math.ceil(total / pageSize);
  const allSelected = devices.length > 0 && devices.every((d) => selectedIds.has(d.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No devices found</p>
        <p className="text-sm mt-1">Try adjusting your filters or add a new device</p>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile card layout */}
      <div className="sm:hidden space-y-2 p-2">
        {devices.map((device) => (
          <div
            key={device.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/50 cursor-pointer"
            onClick={() => navigate(`/devices/${device.id}`)}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(device.id)}
              onChange={() => toggleSelect(device.id)}
              onClick={(e) => e.stopPropagation()}
              className="rounded cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{device.device_name || device.mac_address}</p>
              <p className="font-mono text-xs text-muted-foreground truncate">{device.mac_address}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {device.product_type} — {device.current_stage_name || 'Unassigned'}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => allSelected ? clearSelection() : selectAll()}
                  className="rounded cursor-pointer"
                />
              </th>
              <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="p-3 text-left font-medium text-muted-foreground">MAC Address</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="p-3 text-left font-medium text-muted-foreground hidden md:table-cell">Serial</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Stage</th>
              <th className="p-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Location</th>
              <th className="p-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr
                key={device.id}
                className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/devices/${device.id}`)}
              >
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(device.id)}
                    onChange={() => toggleSelect(device.id)}
                    className="rounded cursor-pointer"
                  />
                </td>
                <td className="p-3 font-medium font-mono text-xs">{device.device_name || '—'}</td>
                <td className="p-3 font-mono text-xs">{device.mac_address}</td>
                <td className="p-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {device.product_type}
                  </span>
                </td>
                <td className="p-3 hidden md:table-cell text-muted-foreground">{device.serial_number || '—'}</td>
                <td className="p-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">{device.current_stage_name || 'Unassigned'}</span>
                </td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground">{device.location || '—'}</td>
                <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                  {new Date(device.updated_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => setPage(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
