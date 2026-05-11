import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import AppSidebar from '@/shared/components/layout/AppSidebar';
import DeviceFilters from '@/features/devices/components/DeviceFilters';
import DeviceTable from '@/features/devices/components/DeviceTable';
import DeviceForm from '@/features/devices/components/DeviceForm';
import BulkActions from '@/features/devices/components/BulkActions';
import useDeviceStore from '@/features/devices/stores/deviceStore';
import useAuth from '@/features/auth/useAuth';

/**
 * Browse-all devices page. Hosts the filters, bulk actions, and table that
 * used to live on the dashboard. Linked from the sidebar.
 */
export default function Devices() {
  const { total, fetchDevices, fetchStages, filters, page } = useDeviceStore();
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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            padding: '32px 48px 8px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 24,
            maxWidth: 1280,
            width: '100%',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--m5-font-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--m5-muted)',
                marginBottom: 6,
              }}
            >
              MoonFive / Inventory / Devices
            </div>
            <h1
              style={{
                fontSize: 48,
                fontWeight: 900,
                letterSpacing: '-0.035em',
                lineHeight: 1,
                margin: 0,
                color: 'var(--m5-ink)',
              }}
            >
              Devices.
            </h1>
            <div
              style={{
                fontFamily: 'var(--m5-font-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--m5-muted)',
                marginTop: 10,
              }}
            >
              {total.toLocaleString()} total
            </div>
          </div>

          {canEdit && (
            <button
              style={{
                marginLeft: 'auto',
                height: 38,
                padding: '0 16px',
                border: '1px solid var(--m5-yellow)',
                background: 'var(--m5-yellow)',
                color: 'var(--m5-ink)',
                fontWeight: 600,
                fontSize: 13.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                borderRadius: 0,
              }}
              onClick={() => setShowForm(true)}
            >
              <Plus size={16} />
              Add device
            </button>
          )}
        </header>

        <div style={{ padding: '24px 48px 64px' }}>
          <DeviceFilters />
          <BulkActions />
          <DeviceTable />
        </div>
      </main>

      {showForm && (
        <DeviceForm onClose={() => setShowForm(false)} onSaved={fetchDevices} />
      )}
    </div>
  );
}
