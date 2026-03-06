/**
 * Plan Retrospective Service — analyzes completed plans for cross-PR quality patterns.
 *
 * Flow:
 *   analyze()       → gathers PR reviews + outcomes + retros → spawns analysis agent
 *   captureOutput() → reads agent output → persists lessons to lessons.jsonl
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readPlan } from "./plan-store.js";
import { readOutcomes } from "./outcome-store.js";
import { readRetrospectives } from "./retrospective-store.js";
import { readLessons, appendLessons } from "./lesson-store.js";
import { getProjectBaseDir } from "./paths.js";
import { generatePlanRetrospectivePrompt } from "./plan-retrospective-prompt.js";
import type {
  OrchestratorConfig,
  SessionManager,
  PluginRegistry,
  SCM,
  Session,
  Lesson,
  LessonCategory,
  ReviewComment,
} from "./types.js";

export interface PlanRetrospectiveService {
  analyze(projectId: string, planId: string): Promise<void>;
  captureOutput(session: Session): Promise<boolean>;
}

export interface PlanRetrospectiveServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "convention",
  "architecture",
  "tooling",
  "anti_pattern",
  "testing",
  "security",
]);

const VALID_SEVERITIES: ReadonlySet<string> = new Set(["high", "medium", "low"]);

export function createPlanRetrospectiveService(
  deps: PlanRetrospectiveServiceDeps,
): PlanRetrospectiveService {
  const { config, sessionManager, registry } = deps;

  async function analyze(projectId: string, planId: string): Promise<void> {
    const project = config.projects[projectId];
    if (!project) return;

    const plan = readPlan(config.configPath, project.path, planId);
    if (!plan) return;

    // Gather PR review comments via SCM
    const scm = project.scm
      ? registry.get<SCM>("scm", project.scm.plugin)
      : null;

    const prReviewData: Array<{
      prNumber: number;
      title: string;
      comments: ReviewComment[];
    }> = [];

    if (scm) {
      for (const task of plan.tasks) {
        if (!task.sessionId) continue;
        try {
          // Get the session to find its PR info
          const taskSession = await sessionManager.get(task.sessionId);
          if (!taskSession?.pr) continue;

          const comments = await scm.getPendingComments(taskSession.pr);
          const reviews = await scm.getReviews(taskSession.pr);

          // Include review body comments as well
          const reviewComments: ReviewComment[] = reviews
            .filter((r) => r.body && r.body.trim().length > 0)
            .map((r) => ({
              id: `review-${r.author}-${r.submittedAt.getTime()}`,
              author: r.author,
              body: r.body ?? "",
              isResolved: false,
              createdAt: r.submittedAt,
              url: "",
            }));

          const allComments = [...comments, ...reviewComments];
          if (allComments.length > 0) {
            prReviewData.push({
              prNumber: taskSession.pr.number,
              title: task.title,
              comments: allComments,
            });
          }
        } catch {
          // SCM unavailable for this PR
        }
      }
    }

    // Gather outcomes for plan sessions
    const allOutcomes = readOutcomes(config.configPath, project.path, 100);
    const planSessionIds = new Set(
      plan.tasks.filter((t) => t.sessionId).map((t) => t.sessionId!),
    );
    const outcomes = allOutcomes.filter((o) => planSessionIds.has(o.sessionId));

    // Gather retrospectives for plan sessions
    const allRetros = readRetrospectives(config.configPath, project.path, 100);
    const retrospectives = allRetros.filter((r) => planSessionIds.has(r.sessionId));

    // Read existing lessons to avoid duplicates
    const existingLessons = readLessons(config.configPath, project.path, 50);

    // Compute output path
    const baseDir = getProjectBaseDir(config.configPath, project.path);
    const outputPath = join(baseDir, `plan-retrospective-${planId}-output.json`);

    const prompt = generatePlanRetrospectivePrompt({
      plan,
      prReviewData,
      outcomes,
      retrospectives,
      existingLessons,
      outputPath,
    });

    // Spawn analysis agent on a disposable branch
    await sessionManager.spawn({
      projectId,
      prompt,
      branch: `plan-retrospective/${planId}`,
    });
  }

  async function captureOutput(session: Session): Promise<boolean> {
    // Extract plan ID from branch name
    const branchMatch = session.branch?.match(/^plan-retrospective\/(.+)$/);
    if (!branchMatch) return false;

    const planId = branchMatch[1];
    const project = config.projects[session.projectId];
    if (!project) return false;

    const baseDir = getProjectBaseDir(config.configPath, project.path);

    // Try local output path first
    const localPath = join(baseDir, `plan-retrospective-${planId}-output.json`);
    let outputJson: string | undefined;

    if (existsSync(localPath)) {
      outputJson = readFileSync(localPath, "utf-8");
    } else if (session.workspacePath) {
      // Fallback: read from worktree
      const worktreePath = join(
        session.workspacePath,
        `plan-retrospective-${planId}-output.json`,
      );
      if (existsSync(worktreePath)) {
        outputJson = readFileSync(worktreePath, "utf-8");
      }
    }

    if (!outputJson) return false;

    try {
      const parsed = JSON.parse(outputJson) as { lessons?: unknown[] };
      if (!Array.isArray(parsed.lessons) || parsed.lessons.length === 0) {
        return true; // Valid output with no lessons — nothing to persist
      }

      const lessons: Lesson[] = [];
      for (const raw of parsed.lessons) {
        const entry = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
          string,
          unknown
        >;

        if (
          typeof entry.pattern !== "string" ||
          typeof entry.recommendation !== "string" ||
          !VALID_CATEGORIES.has(entry.category as string)
        ) {
          continue; // Skip invalid entries
        }

        lessons.push({
          id: randomUUID().slice(0, 12),
          projectId: session.projectId,
          planId,
          pattern: entry.pattern,
          recommendation: entry.recommendation,
          category: entry.category as LessonCategory,
          severity: VALID_SEVERITIES.has(entry.severity as string)
            ? (entry.severity as "high" | "medium" | "low")
            : "medium",
          occurrences: typeof entry.occurrences === "number" ? entry.occurrences : 1,
          examples: Array.isArray(entry.examples)
            ? entry.examples.filter((e): e is string => typeof e === "string")
            : undefined,
          codified: false,
          timestamp: new Date().toISOString(),
        });
      }

      if (lessons.length > 0) {
        appendLessons(config.configPath, project.path, lessons);
      }
      return true;
    } catch {
      return false;
    }
  }

  return { analyze, captureOutput };
}
