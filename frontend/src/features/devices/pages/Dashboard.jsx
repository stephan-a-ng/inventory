import { useEffect, useState } from 'react';
import AppSidebar from '@/shared/components/layout/AppSidebar';
import DeviceStats from '@/features/devices/components/DeviceStats';
import DeviceFilters from '@/features/devices/components/DeviceFilters';
import DeviceTable from '@/features/devices/components/DeviceTable';
import DeviceForm from '@/features/devices/components/DeviceForm';
import BulkActions from '@/features/devices/components/BulkActions';
import PipelineSection from '@/features/devices/components/PipelineSection';
import ActivityFeed from '@/features/audit/components/ActivityFeed';
import { Plus, ScanLine, Upload, Search } from 'lucide-react';
import useDeviceStore from '@/features/devices/stores/deviceStore';
import useAuth from '@/features/auth/useAuth';

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeadBand({ total, stageCount }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '14px 40px',
        borderBottom: '1px solid var(--m5-rule)',
        background: 'var(--m5-cream-deep)',
        fontFamily: 'var(--m5-font-mono)',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--m5-ink-soft)',
      }}
    >
      <span>{total} devices</span>
      <span style={{ color: 'var(--m5-rule)' }}>·</span>
      <span>{stageCount} stages</span>
      <span style={{ color: 'var(--m5-rule)' }}>·</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--m5-green, #4ade80)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        API online
      </span>
      <span style={{ marginLeft: 'auto' }}>Last sync: just now</span>
    </div>
  );
}

function SectionHeader({ label, count }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 500,
        fontFamily: 'var(--m5-font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: 'var(--m5-muted)',
        margin: '0 0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        style={{
          width: 24,
          height: 3,
          background: 'var(--m5-yellow)',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {label}
      {count !== undefined && (
        <span style={{ color: 'var(--m5-ink)', fontWeight: 400 }}>
          — {count} total
        </span>
      )}
    </h2>
  );
}

const PRODUCT_TYPES = ['CHARGER', 'AEMS', 'BEMS', 'NETWORKING'];

function PipelineTabs({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 14 }}>
      {PRODUCT_TYPES.map((pt, idx) => {
        const isLast = idx === PRODUCT_TYPES.length - 1;
        return (
          <button
            key={pt}
            onClick={() => onChange(pt)}
            style={{
              padding: '4px 12px',
              background: value === pt ? 'var(--m5-ink)' : 'var(--m5-cream)',
              color: value === pt ? 'var(--m5-cream)' : 'var(--m5-muted)',
              border: '1px solid var(--m5-rule)',
              borderRight: isLast ? '1px solid var(--m5-rule)' : 'none',
              fontFamily: 'var(--m5-font-mono)',
              fontSize: '10.5px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            {pt}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { devices, total, stages, fetchDevices, fetchStages, filters, page, setFilter } =
    useDeviceStore();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [pipelineProductType, setPipelineProductType] = useState('CHARGER');
  const [topbarSearch, setTopbarSearch] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState(null);

  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  useEffect(() => {
    fetchStages();
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [filters.product_type, filters.stage_id, filters.search, page]);

  // Sync topbar search → store filter
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter('search', topbarSearch);
    }, 300);
    return () => clearTimeout(t);
  }, [topbarSearch]);

  // Ghost button styles
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m5-cream)' }}>
      <AppSidebar />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Head band */}
        <HeadBand total={total} stageCount={stages.length} />

        {/* Topbar */}
        <header
          style={{
            padding: '24px 40px 0',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 24,
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
              MoonFive / Operations / Inventory
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
              Inventory.
            </h1>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginLeft: 'auto',
              paddingBottom: 4,
            }}
          >
            {/* Search field */}
            <div
              style={{
                height: 38,
                border: '1px solid var(--m5-rule)',
                background: 'var(--m5-cream)',
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                width: 280,
                borderRadius: 0,
                gap: 8,
              }}
            >
              <Search size={14} style={{ color: 'var(--m5-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search devices…"
                value={topbarSearch}
                onChange={(e) => setTopbarSearch(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  flex: 1,
                  fontSize: 13.5,
                  color: 'var(--m5-ink)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Scan button */}
            <button
              style={ghostBtn('scan')}
              onMouseEnter={() => setHoveredBtn('scan')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => window.location.href = '/scanner'}
            >
              <ScanLine size={16} />
              Scan
            </button>

            {/* Import button */}
            <button
              style={ghostBtn('import')}
              onMouseEnter={() => setHoveredBtn('import')}
              onMouseLeave={() => setHoveredBtn(null)}
              onClick={() => window.location.href = '/import'}
            >
              <Upload size={16} />
              Import
            </button>

            {/* Add device button */}
            {canEdit && (
              <button
                style={primaryBtn('add')}
                onMouseEnter={() => setHoveredBtn('add')}
                onMouseLeave={() => setHoveredBtn(null)}
                onClick={() => setShowForm(true)}
              >
                <Plus size={16} />
                Add device
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <div
          style={{
            padding: '28px 40px 64px',
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
          }}
        >
          {/* Stats section */}
          <section>
            <SectionHeader label="Inventory overview" />
            <DeviceStats devices={devices} total={total} />
          </section>

          {/* Pipeline + Activity side by side */}
          <section>
            <PipelineTabs value={pipelineProductType} onChange={setPipelineProductType} />
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 0,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <PipelineSection
                  stages={stages}
                  devices={devices}
                  productType={pipelineProductType}
                />
              </div>
              <div style={{ width: 360, flexShrink: 0 }}>
                <ActivityFeed entries={[]} onViewAll={() => {}} />
              </div>
            </div>
          </section>

          {/* Devices table section */}
          <section>
            <SectionHeader label="Devices" count={total} />
            <DeviceFilters />
            <BulkActions />
            <DeviceTable />
          </section>
        </div>
      </main>

      {showForm && (
        <DeviceForm onClose={() => setShowForm(false)} onSaved={fetchDevices} />
      )}
    </div>
  );
}
