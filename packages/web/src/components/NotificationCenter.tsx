"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface NotificationEvent {
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

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) return;
      const data = (await res.json()) as { events: NotificationEvent[] };
      setEvents(data.events);

      const lastSeen = localStorage.getItem("ao-notifications-last-seen");
      if (lastSeen) {
        const lastSeenTime = new Date(lastSeen).getTime();
        const unread = data.events.filter(
          (e) => new Date(e.timestamp).getTime() > lastSeenTime,
        ).length;
        setUnreadCount(unread);
      } else {
        setUnreadCount(data.events.length);
      }
    } catch {
      // Fetch failed — keep current state
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
    const interval = setInterval(() => void fetchEvents(), 30_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  useEffect(() => {
    if (open) {
      localStorage.setItem("ao-notifications-last-seen", new Date().toISOString());
      setUnreadCount(0);
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center rounded-[7px] border border-[var(--color-border-default)] p-2 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
        aria-label="Notifications"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-status-error)] px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-[8px] border border-[var(--color-border-default)] bg-[var(--color-bg-base)]"
          style={{
            boxShadow: "0 8px 30px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4)",
            animation: "slide-up 0.15s ease-out",
          }}
        >
          <div className="border-b border-[var(--color-border-subtle)] px-4 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              Notifications
            </h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-[var(--color-text-muted)]">
                No events yet
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3 last:border-b-0"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PRIORITY_COLORS[event.priority] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug text-[var(--color-text-primary)]">
                      {event.message}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                      <span>{relativeTime(event.timestamp)}</span>
                      <span>·</span>
                      <a
                        href={`/sessions/${encodeURIComponent(event.sessionId)}`}
                        className="hover:text-[var(--color-accent)]"
                      >
                        {event.sessionId}
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
