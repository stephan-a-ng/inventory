export default function StageIndicator({ stages, currentStageId }) {
  if (!stages || stages.length === 0) return null;

  const currentIdx = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {stages.map((stage, idx) => {
        const isCompleted = currentIdx >= 0 && idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isFuture = currentIdx >= 0 && idx > currentIdx;

        return (
          <div key={stage.id} className="flex items-center">
            {idx > 0 && (
              <div className={`h-0.5 w-4 sm:w-8 ${isCompleted ? 'bg-green-500' : 'bg-border'}`} />
            )}
            <div
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                isCompleted
                  ? 'bg-green-500/20 text-green-400'
                  : isCurrent
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/50'
                    : 'bg-secondary text-muted-foreground'
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  isCompleted ? 'bg-green-500' : isCurrent ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
              {stage.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
