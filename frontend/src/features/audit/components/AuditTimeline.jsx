import { Clock, ArrowRight, Plus, Trash2, Edit, RefreshCw } from 'lucide-react';

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const ACTION_CONFIG = {
  created: { icon: Plus, color: 'text-green-500', bg: 'bg-green-500/10' },
  updated: { icon: Edit, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  deleted: { icon: Trash2, color: 'text-red-500', bg: 'bg-red-500/10' },
  stage_changed: { icon: ArrowRight, color: 'text-primary', bg: 'bg-primary/10' },
};

export default function AuditTimeline({ entries }) {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No audit entries yet</p>;
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, idx) => {
        const config = ACTION_CONFIG[entry.action] || { icon: RefreshCw, color: 'text-muted-foreground', bg: 'bg-secondary' };
        const Icon = config.icon;

        return (
          <div key={entry.id} className="flex gap-3 pb-4">
            <div className="flex flex-col items-center">
              <div className={`p-1.5 rounded-full ${config.bg}`}>
                <Icon className={`h-3 w-3 ${config.color}`} />
              </div>
              {idx < entries.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium capitalize">{entry.action.replace('_', ' ')}</span>
                <span className="text-muted-foreground text-xs">{formatRelativeTime(entry.created_at)}</span>
              </div>
              {entry.user_name && (
                <p className="text-xs text-muted-foreground">by {entry.user_name}</p>
              )}
              {entry.new_value && (
                <div className="mt-1 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1">
                  {Object.entries(entry.new_value).map(([k, v]) => (
                    <span key={k} className="mr-3">{k}: <span className="text-foreground">{v}</span></span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
