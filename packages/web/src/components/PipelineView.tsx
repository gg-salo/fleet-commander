"use client";

import { useMemo, useState } from "react";
import type { DashboardSession, DashboardStats, Plan } from "@/lib/types";
import { PIPELINE_STAGES, groupByStage, computeStageCounts } from "@/lib/pipeline";
import { usePlans } from "@/hooks/use-plans";
import { PipelineCanvas } from "./PipelineCanvas";
import { PipelineColumn } from "./PipelineColumn";
import { PipelineConnector } from "./PipelineConnector";
import { PipelineDetailModal } from "./PipelineDetailModal";

interface PipelineViewProps {
  sessions: DashboardSession[];
  stats: DashboardStats;
  projects: Array<{ id: string; name: string }>;
  onSend?: (sessionId: string, message: string) => Promise<void>;
  onKill?: (sessionId: string) => void;
  onMerge?: (prNumber: number) => void;
  onRestore?: (sessionId: string) => void;
}

export function PipelineView({
  sessions,
  stats,
  projects,
  onSend,
  onKill,
  onMerge,
  onRestore,
}: PipelineViewProps) {
  const { plans } = usePlans(projects);
  const [selectedSession, setSelectedSession] = useState<DashboardSession | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const staged = useMemo(() => groupByStage(sessions), [sessions]);
  const inputPlans = useMemo(
    () => plans.filter((p) => p.status === "planning" || p.status === "ready"),
    [plans],
  );
  const counts = useMemo(
    () => computeStageCounts(sessions, plans),
    [sessions, plans],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Stage counters bar */}
      <div className="flex items-center gap-4 border-b border-[var(--color-border-subtle)] px-6 py-2.5">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.id} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: stage.color }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
              {stage.label}
            </span>
            <span
              className="text-[10px] font-bold"
              style={{ color: counts[stage.id] > 0 ? stage.color : "var(--color-text-tertiary)" }}
            >
              {counts[stage.id]}
            </span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
          {stats.totalSessions} total
        </span>
      </div>

      {/* Pipeline canvas */}
      <PipelineCanvas>
        <div className="flex h-full gap-0 p-6">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage.id} className="flex">
              {i > 0 && (
                <PipelineConnector
                  fromColor={PIPELINE_STAGES[i - 1].color}
                  toColor={stage.color}
                />
              )}
              <PipelineColumn
                stage={stage}
                sessions={staged[stage.id]}
                plans={stage.id === "input" ? inputPlans : undefined}
                onSessionClick={setSelectedSession}
                onPlanClick={setSelectedPlan}
              />
            </div>
          ))}
        </div>
      </PipelineCanvas>

      {/* Detail modal */}
      {(selectedSession || selectedPlan) && (
        <PipelineDetailModal
          session={selectedSession}
          plan={selectedPlan}
          onClose={() => {
            setSelectedSession(null);
            setSelectedPlan(null);
          }}
          onSend={onSend}
          onKill={onKill}
          onMerge={onMerge}
          onRestore={onRestore}
        />
      )}
    </div>
  );
}
