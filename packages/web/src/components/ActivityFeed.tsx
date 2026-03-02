"use client";

import { useCallback, useEffect, useState } from "react";
import { ActivityFeedEntry, type NotificationEvent } from "./ActivityFeedEntry";

interface ActivityFeedProps {
  onToggle?: () => void;
}

export function ActivityFeed({ onToggle }: ActivityFeedProps) {
  const [events, setEvents] = useState<NotificationEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) return;
      const data = (await res.json()) as { events: NotificationEvent[] };
      setEvents(data.events);
    } catch {
      // Fetch failed — keep current state
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
    const interval = setInterval(() => void fetchEvents(), 15_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
          Activity
        </h3>
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
            aria-label="Close activity feed"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-[var(--color-text-muted)]">
            No events yet
          </div>
        ) : (
          events.map((event) => (
            <ActivityFeedEntry key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
