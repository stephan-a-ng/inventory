import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useDeviceStore from '@/features/devices/stores/deviceStore';
import { ChevronLeft, ChevronRight, QrCode, MoreHorizontal } from 'lucide-react';

const TYPE_TAG_STYLES = {
  CHARGER: {
    background: 'var(--m5-ink)',
    color: 'var(--m5-cream)',
    borderColor: 'var(--m5-ink)',
  },
  AEMS: {
    background: 'transparent',
    color: 'var(--m5-ink)',
    borderColor: 'var(--m5-ink)',
  },
  BEMS: {
    background: 'var(--m5-cream-deep)',
    color: 'var(--m5-ink-soft)',
    borderColor: 'var(--m5-rule)',
  },
  NETWORKING: {
    background: 'transparent',
    color: 'var(--m5-ink-soft)',
    borderColor: 'var(--m5-ink-soft)',
  },
};

function TypeTag({ type }) {
  const s = TYPE_TAG_STYLES[type] || TYPE_TAG_STYLES.AEMS;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        border: `1px solid ${s.borderColor}`,
        background: s.background,
        color: s.color,
        fontFamily: 'var(--m5-font-mono)',
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        borderRadius: 0,
      }}
    >
      {type}
    </span>
  );
}

function SquareCheckbox({ checked, indeterminate, onChange, onClick }) {
  return (
    <div
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      tabIndex={0}
      onClick={(e) => {
        if (onClick) onClick(e);
        if (onChange) onChange(e);
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (onChange) onChange(e);
        }
      }}
      style={{
        width: 16,
        height: 16,
        border: '1px solid var(--m5-ink)',
        background: checked || indeterminate ? 'var(--m5-ink)' : 'var(--m5-cream)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        borderRadius: 0,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {indeterminate && !checked && (
        <span style={{ color: 'var(--m5-cream)', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>—</span>
      )}
      {checked && (
        <span style={{ color: 'var(--m5-cream)', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>
      )}
    </div>
  );
}

function PipStrip({ stages, currentStageId }) {
  if (!stages || stages.length === 0) return null;
  const currentIdx = stages.findIndex((s) => s.id === currentStageId);
  const isDeployed = currentIdx === stages.length - 1 && currentIdx >= 0;

  return (
    <div style={{ display: 'flex', gap: 2, height: 4, marginTop: 5 }}>
      {stages.map((s, i) => {
        let bg;
        if (isDeployed) {
          bg = 'var(--m5-green)';
        } else if (i < currentIdx) {
          bg = 'var(--m5-ink)';
        } else if (i === currentIdx) {
          bg = 'var(--m5-yellow)';
        } else {
          bg = 'var(--m5-rule)';
        }
        return (
          <span
            key={s.id}
            style={{
              flex: 1,
              display: 'block',
              height: 4,
              borderRadius: 0,
              background: bg,
            }}
          />
        );
      })}
    </div>
  );
}

function ActionButton({ onClick, children, hovered }) {
  const [btnHovered, setBtnHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setBtnHovered(true)}
      onMouseLeave={() => setBtnHovered(false)}
      style={{
        width: 26,
        height: 26,
        border: `1px solid ${btnHovered ? 'var(--m5-ink)' : 'var(--m5-rule)'}`,
        background: 'var(--m5-cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: btnHovered ? 'var(--m5-ink)' : 'var(--m5-muted)',
        borderRadius: 0,
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export default function DeviceTable() {
  const navigate = useNavigate();
  const {
    devices,
    total,
    page,
    pageSize,
    setPage,
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    loading,
    stages,
  } = useDeviceStore();
  const totalPages = Math.ceil(total / pageSize);
  const allSelected = devices.length > 0 && devices.every((d) => selectedIds.has(d.id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const [hoveredRow, setHoveredRow] = useState(null);

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 0',
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 12,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--m5-muted)',
        }}
      >
        Loading devices…
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 0',
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 12,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--m5-muted)',
        }}
      >
        No devices found
      </div>
    );
  }

  const thStyle = {
    textAlign: 'left',
    padding: '12px 16px',
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '10.5px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--m5-muted)',
    fontWeight: 500,
    borderBottom: '1px solid var(--m5-rule)',
    background: 'var(--m5-cream-deep)',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ border: '1px solid var(--m5-rule)', background: 'var(--m5-cream)' }}>
      {/* Mobile card view */}
      <div className="sm:hidden" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {devices.map((device) => (
          <div
            key={device.id}
            onClick={() => navigate(`/devices/${device.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              border: '1px solid var(--m5-rule)',
              background: selectedIds.has(device.id) ? 'rgba(252,208,27,0.10)' : 'var(--m5-cream)',
              cursor: 'pointer',
            }}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <SquareCheckbox
                checked={selectedIds.has(device.id)}
                onChange={() => toggleSelect(device.id)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {device.device_name || device.mac_address}
              </div>
              <div style={{ fontFamily: 'var(--m5-font-mono)', fontSize: 11, color: 'var(--m5-muted)', marginTop: 2 }}>
                {device.mac_address}
              </div>
              <div style={{ fontSize: 12, color: 'var(--m5-ink-soft)', marginTop: 2 }}>
                {device.product_type} — {device.current_stage_name || 'Unassigned'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 48 }}>
                <SquareCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => (allSelected ? clearSelection() : selectAll())}
                />
              </th>
              <th style={thStyle}>Device</th>
              <th style={thStyle}>MAC Address</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Stage</th>
              <th style={{ ...thStyle }} className="hidden lg:table-cell">Site</th>
              <th style={thStyle}>Upd</th>
              <th style={{ ...thStyle, width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device, idx) => {
              const isSelected = selectedIds.has(device.id);
              const isHovered = hoveredRow === device.id;
              const isLast = idx === devices.length - 1;

              const rowBg = isSelected
                ? 'rgba(252,208,27,0.10)'
                : isHovered
                ? 'var(--m5-cream-deep)'
                : 'var(--m5-cream)';

              const tdStyle = {
                padding: '14px 16px',
                verticalAlign: 'middle',
                borderBottom: isLast ? 'none' : '1px solid var(--m5-rule)',
              };

              // Find device stages filtered by product_type for pip bar
              const deviceStages = stages.filter((s) => s.product_type === device.product_type);

              return (
                <tr
                  key={device.id}
                  style={{ background: rowBg, cursor: 'pointer', transition: 'background 0.1s ease' }}
                  onClick={() => navigate(`/devices/${device.id}`)}
                  onMouseEnter={() => setHoveredRow(device.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Checkbox */}
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <SquareCheckbox
                      checked={isSelected}
                      onChange={() => toggleSelect(device.id)}
                    />
                  </td>

                  {/* Device name + serial */}
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, letterSpacing: '-0.005em' }}>
                      {device.device_name || '—'}
                    </div>
                    {device.serial_number && (
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'var(--m5-font-mono)',
                          fontSize: 11,
                          color: 'var(--m5-muted)',
                          marginTop: 2,
                        }}
                      >
                        {device.serial_number}
                      </span>
                    )}
                  </td>

                  {/* MAC address */}
                  <td style={tdStyle}>
                    <span
                      style={{
                        fontFamily: 'var(--m5-font-mono)',
                        fontSize: '12.5px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {device.mac_address}
                    </span>
                  </td>

                  {/* Type tag */}
                  <td style={tdStyle}>
                    {device.product_type ? <TypeTag type={device.product_type} /> : '—'}
                  </td>

                  {/* Stage + pip bar */}
                  <td style={tdStyle}>
                    {device.current_stage_name ? (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {device.current_stage_name}
                        </div>
                        <PipStrip stages={deviceStages} currentStageId={device.current_stage_id} />
                      </>
                    ) : (
                      <span style={{ color: 'var(--m5-red)', fontWeight: 600, fontSize: 13 }}>
                        Unassigned
                      </span>
                    )}
                  </td>

                  {/* Location */}
                  <td
                    style={{ ...tdStyle, color: 'var(--m5-ink-soft)' }}
                    className="hidden lg:table-cell"
                  >
                    {device.location || '—'}
                  </td>

                  {/* Updated */}
                  <td style={tdStyle}>
                    <span
                      style={{
                        fontFamily: 'var(--m5-font-mono)',
                        fontSize: '11.5px',
                        color: 'var(--m5-ink-soft)',
                      }}
                    >
                      {formatRelativeTime(device.updated_at)}
                    </span>
                  </td>

                  {/* Row actions */}
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 4,
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.1s ease',
                      }}
                    >
                      <ActionButton
                        hovered={isHovered}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/api/devices/${device.id}/qr`, '_blank');
                        }}
                      >
                        <QrCode size={13} />
                      </ActionButton>
                      <ActionButton
                        hovered={isHovered}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/devices/${device.id}`);
                        }}
                      >
                        <MoreHorizontal size={13} />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid var(--m5-rule)',
          background: 'var(--m5-cream-deep)',
          fontFamily: 'var(--m5-font-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--m5-ink-soft)',
          gap: 16,
        }}
      >
        <span>
          Showing {rangeStart}–{rangeEnd} of {total}
        </span>

        {totalPages > 1 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <PagerButton
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              active={false}
            >
              <ChevronLeft size={13} />
            </PagerButton>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                // Show first, last, current, and adjacent pages
                return p === 1 || p === totalPages || Math.abs(p - page) <= 1;
              })
              .reduce((acc, p, i, arr) => {
                if (i > 0 && p - arr[i - 1] > 1) {
                  acc.push('…');
                }
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…' ? (
                  <span
                    key={`ellipsis-${i}`}
                    style={{
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--m5-font-mono)',
                      fontSize: 12,
                      color: 'var(--m5-muted)',
                    }}
                  >
                    …
                  </span>
                ) : (
                  <PagerButton
                    key={p}
                    onClick={() => setPage(p)}
                    active={p === page}
                    disabled={false}
                  >
                    {p}
                  </PagerButton>
                )
              )}
            <PagerButton
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              active={false}
            >
              <ChevronRight size={13} />
            </PagerButton>
          </div>
        )}
      </div>
    </div>
  );
}

function PagerButton({ onClick, disabled, active, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28,
        height: 28,
        border: `1px solid ${active ? 'var(--m5-ink)' : 'var(--m5-rule)'}`,
        background: active ? 'var(--m5-ink)' : hovered && !disabled ? 'var(--m5-cream-deep)' : 'var(--m5-cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--m5-font-mono)',
        fontSize: 12,
        color: active ? 'var(--m5-cream)' : 'var(--m5-ink-soft)',
        borderRadius: 0,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}
