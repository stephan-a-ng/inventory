import { useState } from 'react';
import { Search, Download } from 'lucide-react';
import useDeviceStore from '@/stores/deviceStore';

const PRODUCT_TYPES = ['', 'AEMS', 'BEMS', 'CHARGER', 'NETWORKING'];

export default function DeviceFilters() {
  const { filters, setFilter, stages } = useDeviceStore();
  const [searchFocused, setSearchFocused] = useState(false);

  const selectStyle = {
    height: 38,
    padding: '0 12px',
    border: '1px solid var(--m5-rule)',
    background: 'var(--m5-cream)',
    color: 'var(--m5-ink)',
    fontSize: '13.5px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    borderRadius: 0,
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    paddingRight: 28,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237A7468' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 14,
      }}
    >
      {/* Search field */}
      <div
        style={{
          height: 38,
          border: `1px solid var(--m5-rule)`,
          background: 'var(--m5-cream)',
          padding: '0 12px',
          display: 'inline-flex',
          alignItems: 'center',
          flex: '0 1 320px',
          borderRadius: 0,
          outline: searchFocused ? '2px solid var(--m5-yellow)' : 'none',
          outlineOffset: -1,
          transition: 'outline 0.1s ease',
        }}
      >
        <Search
          size={14}
          style={{ color: 'var(--m5-muted)', marginRight: 8, flexShrink: 0 }}
        />
        <input
          placeholder="Search MAC, serial, site…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            flex: 1,
            fontSize: 14,
            color: 'var(--m5-ink)',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Type filter */}
      <select
        value={filters.product_type}
        onChange={(e) => setFilter('product_type', e.target.value)}
        style={selectStyle}
      >
        <option value="">All Types</option>
        {PRODUCT_TYPES.filter(Boolean).map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {/* Stage filter */}
      <select
        value={filters.stage_id}
        onChange={(e) => setFilter('stage_id', e.target.value)}
        style={{ ...selectStyle, maxWidth: 200 }}
      >
        <option value="">All Stages</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({s.product_type})</option>
        ))}
      </select>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Export CSV */}
      <ExportButton />
    </div>
  );
}

function ExportButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => window.open('/api/devices/export', '_blank')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 30,
        padding: '0 10px',
        border: '1px solid var(--m5-rule)',
        background: hovered ? 'var(--m5-cream-deep)' : 'var(--m5-cream)',
        color: 'var(--m5-ink)',
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
      <Download size={14} />
      Export CSV
    </button>
  );
}
