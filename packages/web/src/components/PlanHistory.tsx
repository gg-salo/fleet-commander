"use client";

import { useCallback, useEffect, useState } from "react";
import type { Plan, PlanStatus } from "@/lib/types";
import { DependencyGraph } from "./DependencyGraph";

interface PlanHistoryProps {
  projects: Array<{ id: string; name: string }>;
}

const STATUS_COLORS: Record<PlanStatus, string> = {
  done: "var(--color-accent-green)",
  failed: "var(--color-status-error)",
  executing: "var(--color-accent-blue)",
  ready: "var(--color-status-attention)",
  approved: "var(--color-accent-green)",
  planning: "var(--color-text-muted)",
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

export function PlanHistory({ projects }: PlanHistoryProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const fetchPlans = useCallback(async () => {
    const allPlans: Plan[] = [];
    for (const project of projects) {
      try {
        const res = await fetch(`/api/plans?projectId=${encodeURIComponent(project.id)}`);
        if (!res.ok) continue;
        const data = (await res.json()) as { plans: Plan[] };
        allPlans.push(...data.plans);
      } catch {
        // Skip failed fetch
      }
    }
    // Sort newest first
    allPlans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setPlans(allPlans);
  }, [projects]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  // Only show plans that are done, failed, or executing (active plans are in NewWorkPanel)
  const historyPlans = plans.filter(
    (p) => p.status === "done" || p.status === "failed" || p.status === "executing",
  );

  if (historyPlans.length === 0) return null;

  return (
    <div className="mb-8">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-3 flex items-center gap-2 px-1"
      >
        <h2 className="text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
          Plans
        </h2>
        <span className="rounded-full bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
          {historyPlans.length}
        </span>
        <svg
          className={`h-3 w-3 text-[var(--color-text-muted)] transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="space-y-3">
          {historyPlans.map((plan) => {
            const completedTasks = plan.tasks.filter((t) => t.sessionId).length;
            const isExpanded = expandedId === plan.id;
            const hasDeps = plan.tasks.some((t) => t.dependencies.length > 0);

            return (
              <div
                key={plan.id}
                className="rounded-[8px] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : plan.id)}
                  className="flex w-full items-start justify-between px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug text-[var(--color-text-primary)]" style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {plan.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                      <span
                        className="rounded-full px-2 py-0.5 font-semibold uppercase"
                        style={{
                          color: STATUS_COLORS[plan.status],
                          backgroundColor: `color-mix(in srgb, ${STATUS_COLORS[plan.status]} 12%, transparent)`,
                        }}
                      >
                        {plan.status}
                      </span>
                      <span className="text-[var(--color-text-muted)]">
                        {relativeTime(plan.createdAt)}
                      </span>
                      <span className="text-[var(--color-text-muted)]">
                        {completedTasks}/{plan.tasks.length} tasks
                      </span>
                    </div>
                  </div>
                  <svg
                    className={`ml-2 mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--color-border-subtle)] px-4 py-3">
                    {/* Dependency graph */}
                    {hasDeps && (
                      <div className="mb-3">
                        <DependencyGraph tasks={plan.tasks} />
                      </div>
                    )}

                    {/* Task list */}
                    <div className="space-y-2">
                      {plan.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-2 rounded-[6px] border border-[var(--color-border-subtle)] px-3 py-2"
                        >
                          <span className="mt-0.5 text-[11px] font-mono text-[var(--color-text-muted)]">
                            #{task.id}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
                              {task.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                                {task.scope}
                              </span>
                              {task.issueUrl && (
                                <a
                                  href={task.issueUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-[var(--color-accent)] hover:underline"
                                >
                                  {task.issueNumber ? `#${task.issueNumber}` : "issue"}
                                </a>
                              )}
                              {task.sessionId && (
                                <a
                                  href={`/sessions/${encodeURIComponent(task.sessionId)}`}
                                  className="text-[10px] text-[var(--color-accent)] hover:underline"
                                >
                                  {task.sessionId}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
