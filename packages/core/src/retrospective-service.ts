/**
 * Retrospective Service — spawns lightweight analysis agents for failed sessions.
 *
 * When a session reaches a non-merged terminal state and the "session-failed"
 * reaction is configured with action "spawn-retrospective", this service
 * gathers context and spawns an analysis agent.
 *
 * captureOutput() reads the agent's JSON output and persists it to
 * retrospectives.jsonl for use in context enrichment and plan retrospectives.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateRetrospectivePrompt } from "./retrospective-prompt.js";
import { appendRetrospective } from "./retrospective-store.js";
import { getProjectBaseDir } from "./paths.js";
import type {
  Session,
  SessionManager,
  OrchestratorConfig,
  PluginRegistry,
  Runtime,
  EventStore,
  RetrospectiveRecord,
  RetrospectiveCategory,
} from "./types.js";

export interface RetrospectiveService {
  analyze(sessionId: string): Promise<void>;
  captureOutput(session: Session): Promise<boolean>;
}

export interface RetrospectiveServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
  eventStore?: EventStore;
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "vague_issue",
  "wrong_approach",
  "tooling_problem",
  "upstream_conflict",
  "timeout",
  "permission_error",
  "unknown",
]);

const VALID_CONFIDENCE: ReadonlySet<string> = new Set(["high", "medium", "low"]);

export function createRetrospectiveService(
  deps: RetrospectiveServiceDeps,
): RetrospectiveService {
  const { config, sessionManager, registry, eventStore } = deps;

  async function analyze(sessionId: string): Promise<void> {
    const session = await sessionManager.get(sessionId);
    if (!session) return;

    const project = config.projects[session.projectId];
    if (!project) return;

    // Gather events for this session
    const events = eventStore
      ? eventStore.query({ sessionId, limit: 50 })
      : [];

    // Get terminal output
    let terminalOutput = "";
    if (session.runtimeHandle) {
      const runtime = registry.get<Runtime>(
        "runtime",
        project.runtime ?? config.defaults.runtime,
      );
      if (runtime) {
        try {
          terminalOutput = await runtime.getOutput(session.runtimeHandle, 100);
        } catch {
          // Runtime may be dead
        }
      }
    }

    // Compute local output path for the agent to write to
    const baseDir = getProjectBaseDir(config.configPath, project.path);
    const localOutputPath = join(baseDir, `retrospective-${sessionId}-output.json`);

    const prompt = generateRetrospectivePrompt({
      session,
      events,
      terminalOutput,
      localOutputPath,
    });

    // Spawn on a disposable branch
    const retroSession = await sessionManager.spawn({
      projectId: session.projectId,
      prompt,
      branch: `retrospective/${sessionId}`,
    });

    // Store the original session ID in metadata for later capture
    retroSession.metadata["retroTargetSessionId"] = sessionId;
  }

  async function captureOutput(session: Session): Promise<boolean> {
    // Extract the original session ID from the branch name
    const branchMatch = session.branch?.match(/^retrospective\/(.+)$/);
    if (!branchMatch) return false;

    const targetSessionId = branchMatch[1];
    const targetSession = await sessionManager.get(targetSessionId);
    if (!targetSession) return false;

    const project = config.projects[targetSession.projectId];
    if (!project) return false;

    const baseDir = getProjectBaseDir(config.configPath, project.path);

    // Try local output path first
    const localPath = join(baseDir, `retrospective-${targetSessionId}-output.json`);
    let outputJson: string | undefined;

    if (existsSync(localPath)) {
      outputJson = readFileSync(localPath, "utf-8");
    } else if (session.workspacePath) {
      // Fallback: read from worktree
      const worktreePath = join(session.workspacePath, "retrospective-output.json");
      if (existsSync(worktreePath)) {
        outputJson = readFileSync(worktreePath, "utf-8");
      }
    }

    if (!outputJson) return false;

    try {
      const parsed = JSON.parse(outputJson) as Record<string, unknown>;

      // Validate required fields
      if (
        typeof parsed.failureReason !== "string" ||
        typeof parsed.category !== "string" ||
        typeof parsed.recommendation !== "string" ||
        !VALID_CATEGORIES.has(parsed.category)
      ) {
        return false;
      }

      const record: RetrospectiveRecord = {
        sessionId: targetSessionId,
        projectId: targetSession.projectId,
        planId: targetSession.metadata["planId"] as string | undefined,
        failureReason: parsed.failureReason,
        category: parsed.category as RetrospectiveCategory,
        recommendation: parsed.recommendation,
        confidence: VALID_CONFIDENCE.has(parsed.confidence as string)
          ? (parsed.confidence as "high" | "medium" | "low")
          : "low",
        timestamp: new Date().toISOString(),
      };

      appendRetrospective(config.configPath, project.path, record);
      return true;
    } catch {
      return false;
    }
  }

  return { analyze, captureOutput };
}
