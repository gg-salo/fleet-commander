"use client";

export interface NotificationEvent {
  id: string;
  type: string;
  priority: "urgent" | "action" | "warning" | "info";
  sessionId: string;
  projectId: string;
  timestamp: string;
  message: string;
  data: Record<string, unknown>;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--color-status-error)",
  action: "var(--color-accent-green)",
  warning: "var(--color-status-attention)",
  info: "var(--color-accent-blue)",
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ActivityFeedEntryProps {
  event: NotificationEvent;
}

export function ActivityFeedEntry({ event }: ActivityFeedEntryProps) {
  // Extract short session name (last segment after last -)
  const shortName = event.sessionId.split("-").slice(0, 2).join("-");

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 border-b border-[var(--color-border-subtle)] last:border-b-0">
      <span
        className="mt-1.5 h-[6px] w-[6px] shrink-0 rounded-full"
        style={{ backgroundColor: PRIORITY_COLORS[event.priority] ?? PRIORITY_COLORS.info }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <a
            href={`/sessions/${encodeURIComponent(event.sessionId)}`}
            className="text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] truncate"
          >
            {shortName}
          </a>
          <span className="shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
            {relativeTime(event.timestamp)}
          </span>
        </div>
        <p className="text-[11px] leading-snug text-[var(--color-text-muted)] line-clamp-2">
          {event.message}
        </p>
      </div>
    </div>
  );
}
