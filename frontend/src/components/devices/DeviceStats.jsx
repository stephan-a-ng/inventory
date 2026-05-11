function StatCell({ stat, isLast }) {
  const isYellow = stat.yellow;

  const cellStyle = {
    padding: '24px 28px 22px',
    borderRight: isLast
      ? 'none'
      : isYellow
      ? '1px solid var(--m5-ink)'
      : '1px solid var(--m5-rule)',
    position: 'relative',
    background: isYellow ? '#FCD01B' : 'transparent',
  };

  const labelStyle = {
    fontFamily: 'var(--m5-font-mono)',
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: isYellow ? 'var(--m5-ink)' : 'var(--m5-muted)',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const numberStyle = {
    fontSize: '56px',
    fontWeight: 900,
    letterSpacing: '-0.045em',
    lineHeight: 0.9,
    marginBottom: '10px',
    color: 'var(--m5-ink)',
  };

  const deltaStyle = {
    fontSize: '13px',
    color: isYellow ? 'var(--m5-ink)' : 'var(--m5-ink-soft, #4A4740)',
  };

  const sparkContainerStyle = {
    display: 'flex',
    gap: '2px',
    marginTop: '14px',
    height: '22px',
    alignItems: 'flex-end',
  };

  const maxHeight = 22;

  return (
    <div style={cellStyle}>
      <div style={labelStyle}>{stat.label}</div>
      <div style={numberStyle}>{stat.value}</div>
      <div style={deltaStyle}>{stat.delta}</div>
      <div style={sparkContainerStyle}>
        {stat.spark.map((h, idx) => {
          const barHeight = Math.round((h / 100) * maxHeight);
          return (
            <span
              key={idx}
              style={{
                flex: 1,
                height: `${barHeight}px`,
                background: 'var(--m5-ink)',
                opacity: isYellow ? 0.7 : 0.18,
                display: 'block',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function DeviceStats({ devices, total }) {
  const deployed = devices.filter((d) => d.current_stage_name === 'Deployed').length;
  const inCommission = devices.filter(
    (d) => d.current_stage_name && d.current_stage_name !== 'Deployed'
  ).length;
  const noStage = devices.filter((d) => !d.current_stage_name).length;

  const stats = [
    {
      label: 'Total Devices',
      value: total.toLocaleString(),
      delta: `${total} total · 4 product types`,
      spark: [25, 35, 30, 45, 35, 55, 45, 65, 55, 60, 75, 80],
      yellow: false,
    },
    {
      label: 'Deployed in field',
      value: deployed.toLocaleString(),
      delta: `${total > 0 ? ((deployed / total) * 100).toFixed(1) : 0}% of fleet`,
      spark: [20, 28, 25, 38, 30, 45, 40, 55, 50, 60, 68, 75],
      yellow: false,
    },
    {
      label: 'In commissioning',
      value: inCommission.toLocaleString(),
      delta: `${total > 0 ? ((inCommission / total) * 100).toFixed(1) : 0}% of fleet`,
      spark: [60, 55, 50, 45, 50, 50, 55, 45, 50, 48, 45, 42],
      yellow: false,
    },
    {
      label: 'Needs attention',
      value: noStage.toLocaleString(),
      delta: `${noStage} unassigned · no stage assigned`,
      spark: [10, 15, 10, 20, 15, 25, 20, 30, 40, 55, 70, 80],
      yellow: true,
    },
  ];

  return (
    <div
      style={{
        border: '1px solid var(--m5-rule)',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        background: 'var(--m5-cream)',
      }}
    >
      {stats.map((stat, i) => (
        <StatCell key={stat.label} stat={stat} isLast={i === stats.length - 1} />
      ))}
    </div>
  );
}
