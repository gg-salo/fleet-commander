"use client";

import type { DashboardSession, Plan } from "@/lib/types";
import type { StageConfig } from "@/lib/pipeline";
import { cn } from "@/lib/cn";
import { PipelineCard, PipelinePlanCard } from "./PipelineCard";

interface PipelineColumnProps {
  stage: StageConfig;
  sessions: DashboardSession[];
  plans?: Plan[];
  onSessionClick: (session: DashboardSession) => void;
  onPlanClick: (plan: Plan) => void;
}

export function PipelineColumn({
  stage,
  sessions,
  plans = [],
  onSessionClick,
  onPlanClick,
}: PipelineColumnProps) {
  const count = stage.id === "input" ? plans.length : sessions.length;
  const isBuilding = stage.id === "building";

  return (
    <div className={cn("pipeline-column flex min-w-[200px] flex-col", isBuilding ? "flex-[2]" : "flex-1")}>
      {/* Column header */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: stage.color }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
          {stage.label}
        </span>
        {count > 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              color: stage.color,
              backgroundColor: `color-mix(in srgb, ${stage.color} 12%, transparent)`,
            }}
          >
            {count}
          </span>
        )}
      </div>

      {/* Scrollable card area */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {/* Plans (only in input column) */}
        {stage.id === "input" &&
          plans.map((plan) => (
            <PipelinePlanCard key={plan.id} plan={plan} onClick={() => onPlanClick(plan)} />
          ))}

        {/* Sessions */}
        {sessions.map((session) => (
          <PipelineCard key={session.id} session={session} onClick={() => onSessionClick(session)} />
        ))}

        {/* Empty state */}
        {count === 0 && sessions.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-[7px] border border-dashed border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-tertiary)]">
            No items
          </div>
        )}
      </div>
    </div>
  );
}
