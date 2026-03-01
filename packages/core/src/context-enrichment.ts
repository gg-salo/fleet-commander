/**
 * Context Enrichment — gathers contextual data for agent prompts.
 *
 * Central module for:
 *   - Reading project CLAUDE.md
 *   - Gathering sibling session context
 *   - Gathering dependency diffs (merged PRs in same plan)
 *   - Deriving project lessons from historical outcomes
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readOutcomes } from "./outcome-store.js";
import { classifyError } from "./error-classifier.js";
import {
  TERMINAL_STATUSES,
  type SessionManager,
  type Plan,
  type PlanTask,
} from "./types.js";

const execFileAsync = promisify(execFile);

const MAX_CLAUDE_MD_CHARS = 4000;

// =============================================================================
// CLAUDE.md
// =============================================================================

/** Read CLAUDE.md from the project root, truncated to 4000 chars. */
export function readClaudeMd(projectPath: string): string | undefined {
  const filePath = join(projectPath, "CLAUDE.md");
  if (!existsSync(filePath)) return undefined;

  try {
    const content = readFileSync(filePath, "utf-8").trim();
    if (!content) return undefined;
    if (content.length > MAX_CLAUDE_MD_CHARS) {
      return content.slice(0, MAX_CLAUDE_MD_CHARS) + "\n\n[...truncated]";
    }
    return content;
  } catch {
    return undefined;
  }
}

// =============================================================================
// SIBLING CONTEXT
// =============================================================================

export interface SiblingSessionContext {
  sessionId: string;
  branch: string;
  summary: string | null;
  issueId: string | null;
  affectedFiles?: string[];
}

/** Gather active sibling sessions in the same plan. */
export async function gatherSiblingContext(
  sessionManager: SessionManager,
  projectId: string,
  planId: string | undefined,
  excludeSessionId?: string,
): Promise<SiblingSessionContext[]> {
  if (!planId) return [];

  try {
    const sessions = await sessionManager.list(projectId);
    const siblings = sessions.filter(
      (s) =>
        s.id !== excludeSessionId &&
        s.metadata["planId"] === planId &&
        !TERMINAL_STATUSES.has(s.status),
    );

    return siblings.map((s) => ({
      sessionId: s.id,
      branch: s.branch ?? "unknown",
      summary: s.agentInfo?.summary ?? null,
      issueId: s.issueId,
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// DEPENDENCY DIFFS
// =============================================================================

export interface DependencyDiffContext {
  taskTitle: string;
  prNumber: number;
  diffStat: string;
}

/** Gather diff stats for merged dependency PRs in the same plan. */
export async function gatherDependencyDiffs(
  repo: string,
  plan: Plan,
  task: PlanTask,
): Promise<DependencyDiffContext[]> {
  if (task.dependencies.length === 0) return [];

  const results: DependencyDiffContext[] = [];

  for (const depId of task.dependencies) {
    const depTask = plan.tasks.find((t) => t.id === depId);
    if (!depTask?.issueNumber) continue;

    // Find merged PR for this task — we need the PR number, which may differ from issue number
    // For now, use the issue number as a heuristic (GitHub auto-linking)
    try {
      const { stdout } = await execFileAsync(
        "gh",
        ["pr", "diff", String(depTask.issueNumber), "--repo", repo, "--stat"],
        { timeout: 30_000 },
      );
      results.push({
        taskTitle: depTask.title,
        prNumber: depTask.issueNumber,
        diffStat: stdout.trim(),
      });
    } catch {
      // PR may not exist or gh CLI unavailable
    }
  }

  return results;
}

// =============================================================================
// PROJECT LESSONS (Feature 5)
// =============================================================================

/** Derive project lessons from historical outcome records. */
export function getProjectLessons(
  configPath: string,
  projectPath: string,
): string | undefined {
  const outcomes = readOutcomes(configPath, projectPath, 20);
  if (outcomes.length === 0) return undefined;

  const bullets: string[] = [];

  // Count failing checks by name
  const checkCounts = new Map<string, number>();
  for (const o of outcomes) {
    if (o.failingChecks) {
      for (const check of o.failingChecks) {
        checkCounts.set(check, (checkCounts.get(check) ?? 0) + 1);
      }
    }
  }

  // Top 3 failing checks with count >= 2
  const topChecks = [...checkCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topChecks.length > 0) {
    for (const [checkName, count] of topChecks) {
      const classification = classifyError(checkName);
      bullets.push(
        `- "${checkName}" has failed ${count} times in recent sessions. ${classification.recommendation}`,
      );
    }
  }

  // Average CI retries
  const totalRetries = outcomes.reduce((sum, o) => sum + o.ciRetries, 0);
  const avgRetries = totalRetries / outcomes.length;
  if (avgRetries > 1.5) {
    bullets.push(
      `- Average CI retries: ${avgRetries.toFixed(1)} per session. Run checks locally before pushing.`,
    );
  }

  // Failure rate
  const failures = outcomes.filter((o) => o.outcome !== "merged").length;
  const failureRate = failures / outcomes.length;
  if (failureRate > 0.3) {
    // Find the most common error category
    const categoryCounts = new Map<string, number>();
    for (const o of outcomes) {
      if (o.outcome !== "merged" && o.failingChecks) {
        for (const check of o.failingChecks) {
          const cat = classifyError(check).category;
          categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
        }
      }
    }
    const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const catNote = topCategory ? ` Most common issue: ${topCategory[0]}.` : "";
    bullets.push(
      `- ${Math.round(failureRate * 100)}% of recent sessions failed.${catNote}`,
    );
  }

  if (bullets.length === 0) return undefined;
  return bullets.join("\n");
}
