"use client";

import { useMemo, useState } from "react";
import { type DashboardSession, type AttentionLevel, type FilterMode, getAttentionLevel } from "@/lib/types";
import { SessionCard } from "./SessionCard";

interface SessionGridProps {
  sessions: DashboardSession[];
  filter: FilterMode;
  onSend?: (sessionId: string, message: string) => Promise<void>;
  onKill?: (sessionId: string) => void;
  onMerge?: (prNumber: number) => void;
  onRestore?: (sessionId: string) => void;
}

const GROUP_ORDER: AttentionLevel[] = ["merge", "respond", "review", "pending", "working", "done"];

const GROUP_CONFIG: Record<AttentionLevel, { label: string; color: string }> = {
  merge:   { label: "MERGE READY", color: "var(--color-status-ready)" },
  respond: { label: "NEEDS RESPONSE", color: "var(--color-status-error)" },
  review:  { label: "NEEDS REVIEW", color: "var(--color-accent-orange)" },
  pending: { label: "PENDING", color: "var(--color-status-attention)" },
  working: { label: "WORKING", color: "var(--color-status-working)" },
  done:    { label: "DONE", color: "var(--color-text-tertiary)" },
};

/** Which groups show for each filter mode. */
const FILTER_GROUPS: Record<FilterMode, Set<AttentionLevel>> = {
  all: new Set(GROUP_ORDER),
  action: new Set(["merge", "respond", "review"]),
  working: new Set(["working", "pending"]),
  done: new Set(["done"]),
};

export function SessionGrid({ sessions, filter, onSend, onKill, onMerge, onRestore }: SessionGridProps) {
  const [doneExpanded, setDoneExpanded] = useState(false);

  const grouped = useMemo(() => {
    const groups: Record<AttentionLevel, DashboardSession[]> = {
      merge: [], respond: [], review: [], pending: [], working: [], done: [],
    };
    for (const session of sessions) {
      groups[getAttentionLevel(session)].push(session);
    }
    return groups;
  }, [sessions]);

  const visibleGroups = FILTER_GROUPS[filter];

  return (
    <div className="space-y-6 py-4 px-1">
      {GROUP_ORDER.map((level) => {
        const group = grouped[level];
        if (group.length === 0 || !visibleGroups.has(level)) return null;

        const config = GROUP_CONFIG[level];
        const isDone = level === "done";

        // Group done sessions by planId
        const doneByPlan = isDone && doneExpanded
          ? groupByPlan(group)
          : null;

        return (
          <div key={level}>
            {/* Section header */}
            <button
              className="mb-3 flex w-full items-center gap-2.5 py-0.5 text-left"
              onClick={() => isDone && setDoneExpanded(!doneExpanded)}
            >
              <div
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: config.color }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                {config.label}
              </span>
              <div className="h-px flex-1 bg-[var(--color-border-subtle)]" />
              <span className="tabular-nums text-[11px] text-[var(--color-text-muted)]">
                {group.length}
              </span>
              {isDone && (
                <svg
                  className="h-3 w-3 shrink-0 text-[var(--color-text-muted)] transition-transform duration-150"
                  style={{ transform: doneExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {/* Cards */}
            {isDone && !doneExpanded ? null : isDone && doneByPlan ? (
              <div className="space-y-4">
                {doneByPlan.map(({ planId, sessions: planSessions }) => (
                  <div key={planId}>
                    {planId !== "ungrouped" && (
                      <div className="mb-2 text-[10px] font-medium text-[var(--color-text-muted)]">
                        Plan: {planId}
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {planSessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          onSend={onSend}
                          onKill={onKill}
                          onMerge={onMerge}
                          onRestore={onRestore}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onSend={onSend}
                    onKill={onKill}
                    onMerge={onMerge}
                    onRestore={onRestore}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {sessions.length === 0 && (
        <div className="py-12 text-center text-[13px] text-[var(--color-text-muted)]">
          No sessions
        </div>
      )}
    </div>
  );
}

function groupByPlan(sessions: DashboardSession[]): Array<{ planId: string; sessions: DashboardSession[] }> {
  const map = new Map<string, DashboardSession[]>();
  for (const s of sessions) {
    const key = s.planId ?? "ungrouped";
    const arr = map.get(key);
    if (arr) {
      arr.push(s);
    } else {
      map.set(key, [s]);
    }
  }
  // Named plans first, ungrouped last
  const result: Array<{ planId: string; sessions: DashboardSession[] }> = [];
  for (const [planId, planSessions] of map) {
    if (planId !== "ungrouped") result.push({ planId, sessions: planSessions });
  }
  const ungrouped = map.get("ungrouped");
  if (ungrouped) result.push({ planId: "ungrouped", sessions: ungrouped });
  return result;
}
