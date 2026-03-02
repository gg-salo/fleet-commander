"use client";

import { useMemo, useState, useCallback } from "react";
import {
  type DashboardSession,
  type DashboardStats,
  type DashboardPR,
  type DailySummary,
  type FilterMode,
  isPRRateLimited,
  TERMINAL_STATUSES,
  TERMINAL_ACTIVITIES,
} from "@/lib/types";
import { CI_STATUS } from "@composio/ao-core/types";
import { useLiveSessions } from "@/hooks/use-live-sessions";
import { useViewMode } from "@/hooks/use-view-mode";
import { PipelineStats } from "./PipelineStats";
import { FilterTabs } from "./FilterTabs";
import { SessionGrid } from "./SessionGrid";
import { PipelineView } from "./PipelineView";
import { ActivityFeed } from "./ActivityFeed";
import { CommandBar } from "./CommandBar";
import { PRTableRow } from "./PRStatus";
import { DynamicFavicon } from "./DynamicFavicon";
import { NewWorkPanel } from "./NewWorkPanel";
import { PlanHistory } from "./PlanHistory";
import { DiscoveryHistory } from "./DiscoveryHistory";

interface DashboardProps {
  sessions: DashboardSession[];
  stats: DashboardStats;
  orchestratorId?: string | null;
  projectName?: string;
  projects?: Array<{ id: string; name: string }>;
  dailySummary?: DailySummary;
}

export function Dashboard({ sessions, stats, orchestratorId, projectName, projects = [] }: DashboardProps) {
  const { liveSessions, liveStats, refresh } = useLiveSessions(sessions, stats);
  const { viewMode, setViewMode } = useViewMode();
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
  const [newWorkOpen, setNewWorkOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("ao-sidebar-open");
    if (stored !== null) return stored === "true";
    return window.innerWidth >= 1024;
  });

  const openPRs = useMemo(() => {
    return liveSessions
      .filter((s): s is DashboardSession & { pr: DashboardPR } => s.pr?.state === "open")
      .map((s) => s.pr)
      .sort((a, b) => mergeScore(a) - mergeScore(b));
  }, [liveSessions]);

  const handleSend = useCallback(async (sessionId: string, message: string) => {
    const session = liveSessions.find((s) => s.id === sessionId);
    if (session) {
      const isTerminal =
        TERMINAL_STATUSES.has(session.status) ||
        (session.activity !== null && TERMINAL_ACTIVITIES.has(session.activity));

      if (isTerminal) {
        const restoreRes = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/restore`, {
          method: "POST",
        });
        if (!restoreRes.ok && restoreRes.status !== 409) {
          throw new Error(`Failed to restore session: ${await restoreRes.text()}`);
        }
        if (restoreRes.ok) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      throw new Error(`Failed to send message to ${sessionId}: ${await res.text()}`);
    }
    setTimeout(() => void refresh(), 1500);
  }, [liveSessions, refresh]);

  const handleKill = async (sessionId: string) => {
    if (!confirm(`Kill session ${sessionId}?`)) return;
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/kill`, {
      method: "POST",
    });
    if (!res.ok) {
      console.error(`Failed to kill ${sessionId}:`, await res.text());
      return;
    }
    await refresh();
  };

  const handleMerge = async (prNumber: number) => {
    const res = await fetch(`/api/prs/${prNumber}/merge`, { method: "POST" });
    if (!res.ok) {
      console.error(`Failed to merge PR #${prNumber}:`, await res.text());
      return;
    }
    await refresh();
  };

  const handleRestore = async (sessionId: string) => {
    if (!confirm(`Restore session ${sessionId}?`)) return;
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/restore`, {
      method: "POST",
    });
    if (!res.ok) {
      console.error(`Failed to restore ${sessionId}:`, await res.text());
      return;
    }
    setTimeout(() => void refresh(), 2000);
  };

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("ao-sidebar-open", String(next));
      return next;
    });
  }, []);

  const anyRateLimited = useMemo(
    () => liveSessions.some((s) => s.pr && isPRRateLimited(s.pr)),
    [liveSessions],
  );

  return (
    <div className="flex h-screen flex-col">
      <DynamicFavicon sessions={liveSessions} projectName={projectName} />

      {/* Header */}
      <header className="shrink-0 border-b border-[var(--color-border-subtle)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
              Fleet Commander
            </h1>
            <PipelineStats
              counts={liveStats.attentionCounts}
              activeFilter={filterMode}
              onFilterChange={setFilterMode}
            />
          </div>
          <div className="flex items-center gap-2.5">
            {/* View toggle (hidden on mobile) */}
            <div className="hidden md:flex items-center rounded-[5px] border border-[var(--color-border-default)] p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`rounded px-1.5 py-1 transition-colors ${viewMode === "list" ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}
                aria-label="List view"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("pipeline")}
                className={`rounded px-1.5 py-1 transition-colors ${viewMode === "pipeline" ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}
                aria-label="Pipeline view"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 12h4l3-9 4 18 3-9h4" />
                </svg>
              </button>
            </div>
            {/* Sidebar toggle */}
            <button
              onClick={toggleSidebar}
              className="rounded-[5px] border border-[var(--color-border-default)] p-1.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
              aria-label="Toggle activity feed"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {projects.length > 0 && (
              <button
                onClick={() => setNewWorkOpen(true)}
                className="flex items-center gap-1.5 rounded-[7px] border border-[rgba(63,185,80,0.25)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--color-accent-green)] transition-all hover:-translate-y-px"
                style={{
                  background: "linear-gradient(175deg, rgba(63,185,80,0.12) 0%, rgba(63,185,80,0.06) 100%)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.6), 0 3px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New
              </button>
            )}
            {orchestratorId && (
              <a
                href={`/sessions/${encodeURIComponent(orchestratorId)}`}
                className="orchestrator-btn flex items-center gap-2 rounded-[7px] px-3.5 py-1.5 text-[12px] font-semibold hover:no-underline"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] opacity-80" />
                orchestrator
              </a>
            )}
          </div>
        </div>
      </header>

      {/* New Work panel (modal) */}
      {newWorkOpen && (
        <NewWorkPanel projects={projects} onClose={() => setNewWorkOpen(false)} />
      )}

      {/* Main content + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === "pipeline" ? (
          <PipelineView
            sessions={liveSessions}
            stats={liveStats}
            projects={projects}
            onSend={handleSend}
            onKill={handleKill}
            onMerge={handleMerge}
            onRestore={handleRestore}
          />
        ) : (
          /* List view — main scrollable area */
          <main className="flex-1 overflow-y-auto px-6">
            {/* Filter tabs */}
            <FilterTabs
              activeFilter={filterMode}
              counts={liveStats.attentionCounts}
              onFilterChange={setFilterMode}
            />

            {/* Rate limit notice */}
            {anyRateLimited && !rateLimitDismissed && (
              <div className="mx-1 mt-4 flex items-center gap-2.5 rounded border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.05)] px-3.5 py-2.5 text-[11px] text-[var(--color-status-attention)]">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span className="flex-1">
                  GitHub API rate limited — PR data may be stale. Will retry automatically.
                </span>
                <button
                  onClick={() => setRateLimitDismissed(true)}
                  className="ml-1 shrink-0 opacity-60 hover:opacity-100"
                  aria-label="Dismiss"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Session grid */}
            <SessionGrid
              sessions={liveSessions}
              filter={filterMode}
              onSend={handleSend}
              onKill={handleKill}
              onMerge={handleMerge}
              onRestore={handleRestore}
            />

            {/* Plan History */}
            {projects.length > 0 && (
              <div className="mt-4">
                <PlanHistory projects={projects} />
              </div>
            )}

            {/* Discovery History */}
            {projects.length > 0 && (
              <div className="mt-4">
                <DiscoveryHistory projects={projects} />
              </div>
            )}

            {/* PR Table */}
            {openPRs.length > 0 && (
              <div className="mx-auto mt-6 mb-8 max-w-[900px]">
                <h2 className="mb-3 px-1 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
                  Pull Requests
                </h2>
                <div className="overflow-hidden rounded-[6px] border border-[var(--color-border-default)]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border-muted)]">
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">PR</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Title</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Size</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">CI</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Review</th>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Unresolved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPRs.map((pr) => (
                        <PRTableRow key={pr.number} pr={pr} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        )}

        {/* Activity feed sidebar */}
        {sidebarOpen && (
          <aside className="w-72 shrink-0 border-l border-[var(--color-border-subtle)] overflow-y-auto hidden lg:block">
            <ActivityFeed onToggle={toggleSidebar} />
          </aside>
        )}
      </div>

      {/* Command bar */}
      {orchestratorId && (
        <CommandBar orchestratorId={orchestratorId} onSend={handleSend} />
      )}
    </div>
  );
}

function mergeScore(
  pr: Pick<DashboardPR, "ciStatus" | "reviewDecision" | "mergeability" | "unresolvedThreads">,
): number {
  let score = 0;
  if (!pr.mergeability.noConflicts) score += 40;
  if (pr.ciStatus === CI_STATUS.FAILING) score += 30;
  else if (pr.ciStatus === CI_STATUS.PENDING) score += 5;
  if (pr.reviewDecision === "changes_requested") score += 20;
  else if (pr.reviewDecision !== "approved") score += 10;
  score += pr.unresolvedThreads * 5;
  return score;
}
