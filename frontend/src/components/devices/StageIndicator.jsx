export default function StageIndicator({ stages, currentStageId }) {
  if (!stages || stages.length === 0) {
    return (
      <div style={{ color: 'var(--m5-red)', fontWeight: 600, fontSize: 13 }}>
        Unassigned
      </div>
    );
  }

  const currentIdx = stages.findIndex((s) => s.id === currentStageId);
  const isDeployed = currentIdx === stages.length - 1 && currentIdx >= 0;

  if (!currentStageId || currentIdx < 0) {
    return (
      <div style={{ color: 'var(--m5-red)', fontWeight: 600, fontSize: 13 }}>
        Unassigned
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Current stage name + position */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--m5-ink)',
          marginBottom: 6,
        }}
      >
        {stages[currentIdx]?.name || 'Unknown'}
        <span
          style={{
            fontFamily: 'var(--m5-font-mono)',
            fontSize: 11,
            color: 'var(--m5-muted)',
            fontWeight: 400,
            marginLeft: 6,
          }}
        >
          {currentIdx + 1}/{stages.length}
        </span>
      </div>

      {/* Pip strip */}
      <div style={{ display: 'flex', gap: 2, height: 4 }}>
        {stages.map((stage, i) => {
          let bg;
          if (i < currentIdx) {
            bg = 'var(--m5-ink)';
          } else if (i === currentIdx) {
            bg = isDeployed ? 'var(--m5-green)' : 'var(--m5-yellow)';
          } else {
            bg = 'var(--m5-rule)';
          }

          return (
            <span
              key={stage.id}
              title={stage.name}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 0,
                background: bg,
                display: 'block',
              }}
            />
          );
        })}
      </div>

      {/* Stage labels below pips */}
      <div style={{ display: 'flex', gap: 3 }}>
        {stages.map((stage, i) => (
          <div
            key={stage.id}
            style={{
              flex: 1,
              fontFamily: 'var(--m5-font-mono)',
              fontSize: 9,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: i > currentIdx ? 'var(--m5-muted)' : 'var(--m5-ink-soft)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {stage.name}
          </div>
        ))}
      </div>
    </div>
  );
}
