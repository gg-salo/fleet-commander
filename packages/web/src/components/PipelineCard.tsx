"use client";

import { type DashboardSession, type Plan, type AttentionLevel, getAttentionLevel } from "@/lib/types";
import { cn } from "@/lib/cn";
import { getSessionTitle, relativeTime, activityLabel, activityTextColor } from "@/lib/format";
import { ActivityDot } from "./ActivityDot";

interface PipelineCardProps {
  session: DashboardSession;
  onClick: () => void;
}

const borderColorByLevel: Record<AttentionLevel, string> = {
  merge: "border-l-[var(--color-status-ready)]",
  respond: "border-l-[var(--color-status-error)]",
  review: "border-l-[var(--color-accent-orange)]",
  pending: "border-l-[var(--color-status-attention)]",
  working: "border-l-[var(--color-status-working)]",
  done: "border-l-[var(--color-border-default)]",
};

export function PipelineCard({ session, onClick }: PipelineCardProps) {
  const level = getAttentionLevel(session);
  const title = getSessionTitle(session);
  const isReadyToMerge = session.pr?.mergeability.mergeable && session.pr.state === "open";

  return (
    <button
      onClick={onClick}
      className={cn(
        "pipeline-card w-full cursor-pointer border border-l-[3px] text-left",
        "hover:border-[var(--color-border-strong)]",
        borderColorByLevel[level],
        isReadyToMerge
          ? "card-merge-ready border-[rgba(63,185,80,0.3)]"
          : "border-[var(--color-border-default)]",
      )}
    >
      {/* Title */}
      <p className="truncate px-3 pt-2.5 text-[12px] font-semibold leading-snug text-[var(--color-text-primary)]">
        {title}
      </p>

      {/* Activity + time */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
        <ActivityDot activity={session.activity} dotOnly size={5} />
        <span className="text-[10px] font-medium" style={{ color: activityTextColor(session.activity) }}>
          {activityLabel(session.activity, session.status)}
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
          {relativeTime(session.lastActivityAt)}
        </span>
      </div>

      {/* CI badge (compact) */}
      {session.pr && session.pr.ciStatus !== "passing" && (
        <div className="px-3 pb-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
              session.pr.ciStatus === "failing"
                ? "bg-[rgba(248,81,73,0.1)] text-[var(--color-status-error)]"
                : "bg-[rgba(210,153,34,0.1)] text-[var(--color-status-attention)]",
            )}
          >
            CI {session.pr.ciStatus}
          </span>
        </div>
      )}
    </button>
  );
}

interface PipelinePlanCardProps {
  plan: Plan;
  onClick: () => void;
}

export function PipelinePlanCard({ plan, onClick }: PipelinePlanCardProps) {
  const completedTasks = plan.tasks.filter((t) => t.sessionId).length;

  return (
    <button
      onClick={onClick}
      className="pipeline-card w-full cursor-pointer border border-l-[3px] border-[var(--color-border-default)] border-l-[var(--color-accent-violet)] text-left hover:border-[var(--color-border-strong)]"
    >
      <p className="truncate px-3 pt-2.5 text-[12px] font-semibold leading-snug text-[var(--color-text-primary)]">
        {plan.description}
      </p>
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
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
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {completedTasks}/{plan.tasks.length} tasks
        </span>
        <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
          {relativeTime(plan.createdAt)}
        </span>
      </div>
    </button>
  );
}
