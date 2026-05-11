import { useEffect, useState } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import DeviceStats from '@/components/devices/DeviceStats';
import DeviceFilters from '@/components/devices/DeviceFilters';
import DeviceTable from '@/components/devices/DeviceTable';
import DeviceForm from '@/components/devices/DeviceForm';
import BulkActions from '@/components/devices/BulkActions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import useDeviceStore from '@/stores/deviceStore';
import useAuth from '@/hooks/useAuth';

export default function Dashboard() {
  const { devices, total, fetchDevices, fetchStages, filters, page } = useDeviceStore();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  useEffect(() => {
    fetchStages();
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [filters.product_type, filters.stage_id, filters.search, page]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex items-center gap-2 p-4 border-b border-border">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold flex-1">Dashboard</h1>
          {canEdit && (
            <Button onClick={() => setShowForm(true)} className="cursor-pointer">
              <Plus className="h-4 w-4 mr-1" /> Add Device
            </Button>
          )}
        </header>
        <div className="p-4 space-y-4">
          <DeviceStats devices={devices} total={total} />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <DeviceFilters />
            </div>
            <BulkActions />
          </div>
          <Card>
            <DeviceTable />
          </Card>
        </div>
        {showForm && (
          <DeviceForm
            onClose={() => setShowForm(false)}
            onSaved={fetchDevices}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
