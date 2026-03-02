/**
 * Pipeline stage mapping — pure functions for the Pipeline View.
 *
 * Maps sessions and plans into a left-to-right factory-floor visualization:
 *   Input → Planning → Building → Review → Merge
 */

import { type DashboardSession, type Plan, getAttentionLevel } from "@/lib/types";

export type PipelineStage = "input" | "planning" | "building" | "review" | "merge";

export interface StageConfig {
  id: PipelineStage;
  label: string;
  color: string;
}

export const PIPELINE_STAGES: StageConfig[] = [
  { id: "input", label: "Input", color: "var(--color-accent-violet)" },
  { id: "planning", label: "Planning", color: "var(--color-status-attention)" },
  { id: "building", label: "Building", color: "var(--color-status-working)" },
  { id: "review", label: "Review", color: "var(--color-accent-orange)" },
  { id: "merge", label: "Merge", color: "var(--color-status-ready)" },
];

/**
 * Map a session to its pipeline column.
 *
 * - Planning: spawning status with no branch (planning agent sessions)
 * - Building: working or respond attention level without a PR
 * - Review: review, pending, or respond attention level with a PR
 * - Merge: merge or done attention level
 */
export function getPipelineStage(session: DashboardSession): PipelineStage {
  // Planning stage: spawning sessions with no branch yet
  if (session.status === "spawning" && !session.branch) {
    return "planning";
  }

  const level = getAttentionLevel(session);

  // Done/merge sessions
  if (level === "done" || level === "merge") {
    return "merge";
  }

  // Sessions with a PR go to Review
  if (session.pr) {
    return "review";
  }

  // No PR → Building (covers working, respond, review, pending without PR)
  return "building";
}

/**
 * Group sessions into pipeline stage buckets.
 */
export function groupByStage(
  sessions: DashboardSession[],
): Record<PipelineStage, DashboardSession[]> {
  const groups: Record<PipelineStage, DashboardSession[]> = {
    input: [],
    planning: [],
    building: [],
    review: [],
    merge: [],
  };

  for (const session of sessions) {
    const stage = getPipelineStage(session);
    groups[stage].push(session);
  }

  return groups;
}

/**
 * Compute count per stage, including plans in the Input column.
 */
export function computeStageCounts(
  sessions: DashboardSession[],
  plans: Plan[],
): Record<PipelineStage, number> {
  const groups = groupByStage(sessions);
  return {
    input: plans.filter((p) => p.status === "planning" || p.status === "ready").length,
    planning: groups.planning.length,
    building: groups.building.length,
    review: groups.review.length,
    merge: groups.merge.length,
  };
}
