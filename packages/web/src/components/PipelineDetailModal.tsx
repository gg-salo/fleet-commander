"use client";

import { useEffect, useRef } from "react";
import type { DashboardSession, Plan } from "@/lib/types";
import { SessionCard } from "./SessionCard";
import { relativeTime } from "@/lib/format";

interface PipelineDetailModalProps {
  session?: DashboardSession | null;
  plan?: Plan | null;
  onClose: () => void;
  onSend?: (sessionId: string, message: string) => Promise<void>;
  onKill?: (sessionId: string) => void;
  onMerge?: (prNumber: number) => void;
  onRestore?: (sessionId: string) => void;
}

export function PipelineDetailModal({
  session,
  plan,
  onClose,
  onSend,
  onKill,
  onMerge,
  onRestore,
}: PipelineDetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!session && !plan) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-md animate-[slide-in-right_0.2s_ease-out] overflow-y-auto border-l border-[var(--color-border-default)] bg-[var(--color-bg-base)]"
      >
        {/* Close button */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
            {session ? "Session Details" : "Plan Details"}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {session && (
            <SessionCard
              session={session}
              onSend={onSend}
              onKill={onKill}
              onMerge={onMerge}
              onRestore={onRestore}
            />
          )}
          {plan && <PlanDetail plan={plan} />}
        </div>
      </div>
    </div>
  );
}

function PlanDetail({ plan }: { plan: Plan }) {
  const completedTasks = plan.tasks.filter((t) => t.sessionId).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] font-semibold leading-snug text-[var(--color-text-primary)]">
          {plan.description}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          <span
            className="rounded-full px-2 py-0.5 font-semibold uppercase"
            style={{
              color: plan.status === "ready" ? "var(--color-status-attention)" : "var(--color-text-muted)",
              backgroundColor:
                plan.status === "ready"
                  ? "rgba(210,153,34,0.12)"
                  : "rgba(72,79,88,0.25)",
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

      {plan.tasks.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
            Tasks
          </span>
          {plan.tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-[6px] border border-[var(--color-border-subtle)] px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
