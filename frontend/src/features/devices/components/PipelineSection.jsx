import React from 'react';

export default function PipelineSection({ stages, devices, productType }) {
  const [hoveredStage, setHoveredStage] = React.useState(null);
  const [activePeriod, setActivePeriod] = React.useState('30d');
  const periods = ['7d', '30d', '90d', 'YTD'];

  // Filter stages to selected product type and sort by order
  const filteredStages = stages
    .filter((s) => s.product_type === productType)
    .sort((a, b) => a.order - b.order);

  if (filteredStages.length === 0) return null;

  // Count devices per stage
  const stageCounts = {};
  devices
    .filter((d) => d.product_type === productType)
    .forEach((d) => {
      if (d.current_stage_id) {
        stageCounts[d.current_stage_id] = (stageCounts[d.current_stage_id] || 0) + 1;
      }
    });

  // Find bottleneck: non-terminal stage with highest count (only when count > 0)
  const nonTerminalStages = filteredStages.filter((s) => s.name !== 'Deployed');
  const maxCount = Math.max(0, ...nonTerminalStages.map((s) => stageCounts[s.id] || 0));
  const bottleneckStage = maxCount > 0
    ? nonTerminalStages.find((s) => (stageCounts[s.id] || 0) === maxCount)
    : null;

  // Totals
  const totalWIP = nonTerminalStages.reduce((sum, s) => sum + (stageCounts[s.id] || 0), 0);
  const deployedStage = filteredStages.find((s) => s.name === 'Deployed');
  const deployedCount = deployedStage ? (stageCounts[deployedStage.id] || 0) : 0;
  const totalAll = totalWIP + deployedCount;

  const getPct = (stageId) =>
    totalAll > 0 ? ((stageCounts[stageId] || 0) / totalAll * 100).toFixed(1) : '0.0';

  // Meta row derived values
  const throughputPerWk = Math.round(totalWIP / 4);
  const cycleTime =
    totalAll > 0
      ? (totalWIP / Math.max(1, throughputPerWk) * 7).toFixed(1)
      : '—';

  const terminalStage = filteredStages[filteredStages.length - 1];
  const isTerminal = (stage) => stage.id === terminalStage?.id;
  const isBottleneck = (stage) =>
    bottleneckStage && stage.id === bottleneckStage.id;

  return (
    <div>
      {/* Main bordered container */}
      <div
        style={{
          border: '1px solid var(--m5-rule)',
          background: 'var(--m5-cream)',
        }}
      >
        {/* Pipeline grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${filteredStages.length}, 1fr)`,
          }}
        >
          {filteredStages.map((stage, idx) => {
            const terminal = isTerminal(stage);
            const bottleneck = isBottleneck(stage);
            const count = stageCounts[stage.id] || 0;
            const pct = getPct(stage.id);
            const isHovered = hoveredStage === stage.id;
            const isLast = idx === filteredStages.length - 1;

            const cellStyle = {
              padding: '22px 22px 24px',
              borderRight: isLast ? 'none' : '1px solid var(--m5-rule)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.12s ease',
              background: terminal
                ? isHovered
                  ? '#1c1a16'
                  : 'var(--m5-ink)'
                : isHovered
                ? 'var(--m5-cream-deep)'
                : 'var(--m5-cream)',
              color: terminal ? 'var(--m5-cream)' : 'var(--m5-ink)',
            };

            const idxLabelStyle = {
              fontFamily: 'var(--m5-font-mono)',
              fontSize: '10.5px',
              color: terminal ? 'rgba(250,247,238,0.55)' : 'var(--m5-muted)',
              letterSpacing: '0.14em',
              marginBottom: '8px',
              textTransform: 'uppercase',
            };

            const nameStyle = {
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px',
            };

            const countStyle = {
              fontSize: '36px',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              marginBottom: '6px',
            };

            const pctStyle = {
              fontFamily: 'var(--m5-font-mono)',
              fontSize: '11px',
              color: terminal ? 'rgba(250,247,238,0.55)' : 'var(--m5-muted)',
              letterSpacing: '0.06em',
            };

            const stageNum = String(idx + 1).padStart(2, '0');
            const idxLabel = isLast
              ? `STAGE ${stageNum}`
              : `STAGE ${stageNum} →`;

            return (
              <div
                key={stage.id}
                style={cellStyle}
                onMouseEnter={() => setHoveredStage(stage.id)}
                onMouseLeave={() => setHoveredStage(null)}
              >
                {/* Bottleneck top bar */}
                {bottleneck && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '-1px',
                      right: '-1px',
                      height: '4px',
                      background: 'var(--m5-yellow)',
                    }}
                  />
                )}

                <div style={idxLabelStyle}>{idxLabel}</div>

                <div style={nameStyle}>
                  <span>{stage.name}</span>
                  {bottleneck && (
                    <span
                      style={{
                        fontFamily: 'var(--m5-font-mono)',
                        fontSize: '9.5px',
                        letterSpacing: '0.16em',
                        background: 'var(--m5-yellow)',
                        color: 'var(--m5-ink)',
                        padding: '2px 6px',
                        marginLeft: '8px',
                        textTransform: 'uppercase',
                        lineHeight: 1.4,
                      }}
                    >
                      BOTTLENECK
                    </span>
                  )}
                </div>

                <div style={countStyle}>{count.toLocaleString()}</div>
                <div style={pctStyle}>{pct}% · —</div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div
          style={{
            display: 'flex',
            height: '8px',
            borderTop: '1px solid var(--m5-rule)',
          }}
        >
          {filteredStages.map((stage) => {
            const count = stageCounts[stage.id] || 0;
            const terminal = isTerminal(stage);
            const bottleneck = isBottleneck(stage);

            let bg = 'var(--m5-ink)';
            let opacity = 0.22;

            if (terminal) {
              bg = 'var(--m5-green)';
              opacity = 0.9;
            } else if (bottleneck) {
              bg = 'var(--m5-yellow)';
              opacity = 1;
            }

            return (
              <div
                key={stage.id}
                style={{
                  height: '100%',
                  flexGrow: count,
                  background: bg,
                  opacity,
                  minWidth: count > 0 ? '1px' : 0,
                }}
              />
            );
          })}
        </div>

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            padding: '14px 22px',
            borderTop: '1px solid var(--m5-rule)',
            background: 'var(--m5-cream-deep)',
            fontFamily: 'var(--m5-font-mono)',
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--m5-ink-soft)',
          }}
        >
          <span>Throughput {throughputPerWk}/wk</span>
          <span>WIP {totalWIP.toLocaleString()}</span>
          <span>Cycle time {cycleTime}d</span>

          {/* Segmented period tabs */}
          <div
            style={{
              display: 'flex',
              border: '1px solid var(--m5-rule)',
              marginLeft: 'auto',
            }}
          >
            {periods.map((period, idx) => {
              const isActive = period === activePeriod;
              const isLastTab = idx === periods.length - 1;
              return (
                <button
                  key={period}
                  onClick={() => setActivePeriod(period)}
                  style={{
                    padding: '4px 12px',
                    fontFamily: 'var(--m5-font-mono)',
                    fontSize: '10.5px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    background: isActive ? 'var(--m5-ink)' : 'var(--m5-cream)',
                    color: isActive ? 'var(--m5-cream)' : 'var(--m5-muted)',
                    border: 'none',
                    borderRight: isLastTab ? 'none' : '1px solid var(--m5-rule)',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease, color 0.12s ease',
                  }}
                >
                  {period}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
