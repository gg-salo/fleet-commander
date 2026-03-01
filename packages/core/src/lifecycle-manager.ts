/**
 * Lifecycle Manager — state machine + polling loop + reaction engine.
 *
 * Periodically polls all sessions and:
 * 1. Detects state transitions (spawning → working → pr_open → etc.)
 * 2. Emits events on transitions
 * 3. Triggers reactions (auto-handle CI failures, review comments, etc.)
 * 4. Escalates to human notification when auto-handling fails
 *
 * Reference: scripts/claude-session-status, scripts/claude-review-check
 */

import { randomUUID } from "node:crypto";
import {
  SESSION_STATUS,
  PR_STATE,
  CI_STATUS,
  TERMINAL_STATUSES,
  type LifecycleManager,
  type SessionManager,
  type SessionId,
  type SessionStatus,
  type EventType,
  type OrchestratorEvent,
  type OrchestratorConfig,
  type ReactionConfig,
  type ReactionResult,
  type PluginRegistry,
  type Runtime,
  type Agent,
  type SCM,
  type Notifier,
  type Session,
  type EventPriority,
  type EventStore,
  type ProjectConfig as _ProjectConfig,
} from "./types.js";
import { updateMetadata } from "./metadata.js";
import { getSessionsDir } from "./paths.js";
import { generateReviewPrompt } from "./review-prompt.js";
import { formatClassifiedErrors } from "./error-classifier.js";
import { readPlan } from "./plan-store.js";

/** Parse a duration string like "10m", "30s", "1h" to milliseconds. */
function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(s|m|h)$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      return 0;
  }
}

/** Infer a reasonable priority from event type. */
function inferPriority(type: EventType): EventPriority {
  if (type.includes("stuck") || type.includes("needs_input") || type.includes("errored")) {
    return "urgent";
  }
  if (type.startsWith("summary.")) {
    return "info";
  }
  if (
    type.includes("approved") ||
    type.includes("ready") ||
    type.includes("merged") ||
    type.includes("completed")
  ) {
    return "action";
  }
  if (type.includes("fail") || type.includes("changes_requested") || type.includes("conflicts")) {
    return "warning";
  }
  return "info";
}

/** Create an OrchestratorEvent with defaults filled in. */
function createEvent(
  type: EventType,
  opts: {
    sessionId: SessionId;
    projectId: string;
    message: string;
    priority?: EventPriority;
    data?: Record<string, unknown>;
  },
): OrchestratorEvent {
  return {
    id: randomUUID(),
    type,
    priority: opts.priority ?? inferPriority(type),
    sessionId: opts.sessionId,
    projectId: opts.projectId,
    timestamp: new Date(),
    message: opts.message,
    data: opts.data ?? {},
  };
}

/** Determine which event type corresponds to a status transition. */
function statusToEventType(from: SessionStatus | undefined, to: SessionStatus): EventType | null {
  switch (to) {
    case "working":
      return "session.working";
    case "pr_open":
      // Distinguish initial PR creation from PR updates after review feedback
      return from === "changes_requested" ? "pr.updated" : "pr.created";
    case "ci_failed":
      return "ci.failing";
    case "review_pending":
      return "review.pending";
    case "changes_requested":
      return "review.changes_requested";
    case "approved":
      return "review.approved";
    case "mergeable":
      return "merge.ready";
    case "merged":
      return "merge.completed";
    case "needs_input":
      return "session.needs_input";
    case "stuck":
      return "session.stuck";
    case "errored":
      return "session.errored";
    case "killed":
      return "session.killed";
    default:
      return null;
  }
}

/** Map event type to reaction config key. */
function eventToReactionKey(eventType: EventType): string | null {
  switch (eventType) {
    case "ci.failing":
      return "ci-failed";
    case "review.changes_requested":
      return "changes-requested";
    case "automated_review.found":
      return "bugbot-comments";
    case "merge.conflicts":
      return "merge-conflicts";
    case "merge.ready":
      return "approved-and-green";
    case "pr.created":
      return "pr-created";
    case "pr.updated":
      return "pr-updated";
    case "session.stuck":
      return "agent-stuck";
    case "session.needs_input":
      return "agent-needs-input";
    case "session.killed":
      return "agent-exited";
    case "summary.all_complete":
      return "all-complete";
    default:
      return null;
  }
}

export interface LifecycleManagerDeps {
  config: OrchestratorConfig;
  registry: PluginRegistry;
  sessionManager: SessionManager;
  eventStore?: EventStore;
  planService?: {
    checkPlanCompletion(projectId: string, planId: string): Promise<boolean>;
    spawnReadyTasks?(projectId: string, planId: string): Promise<void>;
  };
  reconciliationService?: {
    create(projectId: string, planId: string): Promise<unknown>;
  };
  outcomeService?: {
    captureOutcome(session: Session): void;
  };
  retrospectiveService?: {
    analyze(sessionId: string): Promise<void>;
  };
}

/** Track attempt counts for reactions per session. */
interface ReactionTracker {
  attempts: number;
  firstTriggered: Date;
}

/**
 * Conservative keyword matching to detect if an agent is already
 * working on the issue a reaction would notify about.
 * Returns false by default (fail-open — better to send duplicate than miss).
 */
function checkAgentAwareness(reactionKey: string, terminalOutput: string): boolean {
  const lower = terminalOutput.toLowerCase();
  switch (reactionKey) {
    case "ci-failed":
      return (
        lower.includes("ci fail") ||
        lower.includes("fixing ci") ||
        lower.includes("lint error") ||
        lower.includes("test fail") ||
        lower.includes("build fail")
      );
    case "changes-requested":
      return (
        lower.includes("review feedback") ||
        lower.includes("address comment") ||
        lower.includes("changes requested")
      );
    default:
      return false;
  }
}

/** Create a LifecycleManager instance. */
export function createLifecycleManager(deps: LifecycleManagerDeps): LifecycleManager {
  const {
    config,
    registry,
    sessionManager,
    eventStore,
    planService,
    reconciliationService,
    outcomeService,
    retrospectiveService,
  } = deps;

  const states = new Map<SessionId, SessionStatus>();
  const reactionTrackers = new Map<string, ReactionTracker>(); // "sessionId:reactionKey"
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let polling = false; // re-entrancy guard
  let allCompleteEmitted = false; // guard against repeated all_complete

  /** Determine current status for a session by polling plugins. */
  async function determineStatus(session: Session): Promise<SessionStatus> {
    const project = config.projects[session.projectId];
    if (!project) return session.status;

    const agentName = session.metadata["agent"] ?? project.agent ?? config.defaults.agent;
    const agent = registry.get<Agent>("agent", agentName);
    const scm = project.scm ? registry.get<SCM>("scm", project.scm.plugin) : null;

    // 1. Check if runtime is alive
    if (session.runtimeHandle) {
      const runtime = registry.get<Runtime>("runtime", project.runtime ?? config.defaults.runtime);
      if (runtime) {
        const alive = await runtime.isAlive(session.runtimeHandle).catch(() => true);
        if (!alive) return "killed";
      }
    }

    // 2. Check agent activity via terminal output + process liveness
    if (agent && session.runtimeHandle) {
      try {
        const runtime = registry.get<Runtime>(
          "runtime",
          project.runtime ?? config.defaults.runtime,
        );
        const terminalOutput = runtime ? await runtime.getOutput(session.runtimeHandle, 10) : "";
        // Only trust detectActivity when we actually have terminal output;
        // empty output means the runtime probe failed, not that the agent exited.
        if (terminalOutput) {
          const activity = agent.detectActivity(terminalOutput);
          if (activity === "waiting_input") return "needs_input";

          // Check whether the agent process is still alive. Some agents
          // (codex, aider, opencode) return "active" for any non-empty
          // terminal output, including the shell prompt visible after exit.
          // Checking isProcessRunning for both "idle" and "active" ensures
          // exit detection works regardless of the agent's classifier.
          const processAlive = await agent.isProcessRunning(session.runtimeHandle);
          if (!processAlive) return "killed";
        }
      } catch {
        // On probe failure, preserve current stuck/needs_input state rather
        // than letting the fallback at the bottom coerce them to "working"
        if (
          session.status === SESSION_STATUS.STUCK ||
          session.status === SESSION_STATUS.NEEDS_INPUT
        ) {
          return session.status;
        }
      }
    }

    // 3. Auto-detect PR by branch if metadata.pr is missing.
    //    This is critical for agents without auto-hook systems (Codex, Aider,
    //    OpenCode) that can't reliably write pr=<url> to metadata on their own.
    if (!session.pr && scm && session.branch) {
      try {
        const detectedPR = await scm.detectPR(session, project);
        if (detectedPR) {
          session.pr = detectedPR;
          // Persist PR URL so subsequent polls don't need to re-query.
          // Don't write status here — step 4 below will determine the
          // correct status (merged, ci_failed, etc.) on this same cycle.
          const sessionsDir = getSessionsDir(config.configPath, project.path);
          updateMetadata(sessionsDir, session.id, { pr: detectedPR.url });
        }
      } catch {
        // SCM detection failed — will retry next poll
      }
    }

    // 4. Check PR state if PR exists
    if (session.pr && scm) {
      try {
        const prState = await scm.getPRState(session.pr);
        if (prState === PR_STATE.MERGED) return "merged";
        if (prState === PR_STATE.CLOSED) return "killed";

        // Check CI
        const ciStatus = await scm.getCISummary(session.pr);
        if (ciStatus === CI_STATUS.FAILING) return "ci_failed";

        // Check reviews
        const reviewDecision = await scm.getReviewDecision(session.pr);
        if (reviewDecision === "changes_requested") return "changes_requested";
        if (reviewDecision === "approved") {
          // Check merge readiness
          const mergeReady = await scm.getMergeability(session.pr);
          if (mergeReady.mergeable) return "mergeable";
          return "approved";
        }
        if (reviewDecision === "pending") return "review_pending";

        return "pr_open";
      } catch {
        // SCM check failed — keep current status
      }
    }

    // 5. Default: if agent is active, it's working
    if (
      session.status === "spawning" ||
      session.status === SESSION_STATUS.STUCK ||
      session.status === SESSION_STATUS.NEEDS_INPUT
    ) {
      return "working";
    }
    return session.status;
  }

  /** Execute a reaction for a session. */
  async function executeReaction(
    sessionId: SessionId,
    projectId: string,
    reactionKey: string,
    reactionConfig: ReactionConfig,
  ): Promise<ReactionResult> {
    const trackerKey = `${sessionId}:${reactionKey}`;
    let tracker = reactionTrackers.get(trackerKey);

    if (!tracker) {
      // Restore from session metadata if available (Feature 3d)
      const session = await sessionManager.get(sessionId);
      const savedAttempts = session?.metadata[`reaction_${reactionKey}_attempts`];
      const savedFirstTriggered = session?.metadata[`reaction_${reactionKey}_firstTriggered`];
      tracker = {
        attempts: savedAttempts ? parseInt(savedAttempts, 10) : 0,
        firstTriggered: savedFirstTriggered ? new Date(savedFirstTriggered) : new Date(),
      };
      reactionTrackers.set(trackerKey, tracker);
    }

    // Increment attempts before checking escalation
    tracker.attempts++;

    // Check if we should escalate
    const maxRetries = reactionConfig.retries ?? Infinity;
    const escalateAfter = reactionConfig.escalateAfter;
    let shouldEscalate = false;

    if (tracker.attempts > maxRetries) {
      shouldEscalate = true;
    }

    if (typeof escalateAfter === "string") {
      const durationMs = parseDuration(escalateAfter);
      if (durationMs > 0 && Date.now() - tracker.firstTriggered.getTime() > durationMs) {
        shouldEscalate = true;
      }
    }

    if (typeof escalateAfter === "number" && tracker.attempts > escalateAfter) {
      shouldEscalate = true;
    }

    if (shouldEscalate) {
      // Escalate to human
      const event = createEvent("reaction.escalated", {
        sessionId,
        projectId,
        message: `Reaction '${reactionKey}' escalated after ${tracker.attempts} attempts`,
        data: { reactionKey, attempts: tracker.attempts },
      });
      eventStore?.append(event);
      await notifyHuman(event, reactionConfig.priority ?? "urgent");
      return {
        reactionType: reactionKey,
        success: true,
        action: "escalated",
        escalated: true,
      };
    }

    // Execute the reaction action
    const action = reactionConfig.action ?? "notify";

    switch (action) {
      case "send-to-agent": {
        if (reactionConfig.message) {
          // Reaction deduplication (Feature 2):
          // Check if the agent is already aware of and working on this issue
          try {
            const dedupSession = await sessionManager.get(sessionId);
            if (dedupSession) {
              const project = config.projects[dedupSession.projectId];
              const agentName =
                dedupSession.metadata["agent"] ??
                project?.agent ??
                config.defaults.agent;
              const agent = registry.get<Agent>("agent", agentName);
              const runtime = project
                ? registry.get<Runtime>(
                    "runtime",
                    project.runtime ?? config.defaults.runtime,
                  )
                : null;

              if (agent && runtime && dedupSession.runtimeHandle) {
                const activityState = await agent.getActivityState(dedupSession);
                if (activityState?.state === "active") {
                  const recentOutput = await runtime.getOutput(
                    dedupSession.runtimeHandle,
                    30,
                  );
                  if (checkAgentAwareness(reactionKey, recentOutput)) {
                    // Agent is already working on this — skip the send
                    eventStore?.append(
                      createEvent("reaction.triggered", {
                        sessionId,
                        projectId,
                        message: `Reaction '${reactionKey}' skipped — agent already aware`,
                        data: { reactionKey, skipped: true, reason: "agent-aware" },
                      }),
                    );
                    return {
                      reactionType: reactionKey,
                      success: true,
                      action: "send-to-agent",
                      message: "Skipped — agent already aware",
                      escalated: false,
                    };
                  }
                }
              }
            }
          } catch {
            // Dedup check failed — proceed with send (fail-open)
          }

          try {
            let enrichedMessage = reactionConfig.message;

            // Enrich CI failure messages with context
            if (reactionKey === "ci-failed") {
              const session = await sessionManager.get(sessionId);
              if (session?.pr) {
                const project = config.projects[session.projectId];
                const scm = project?.scm
                  ? registry.get<SCM>("scm", project.scm.plugin)
                  : null;

                if (scm) {
                  try {
                    const checks = await scm.getCIChecks(session.pr);
                    const failingChecks = checks.filter((c) => c.status === "failed");

                    let prSize = "";
                    if (scm.getPRSummary) {
                      try {
                        const summary = await scm.getPRSummary(session.pr);
                        prSize = `\n## Your PR\n- +${summary.additions} -${summary.deletions}\n`;
                      } catch {
                        // ignore
                      }
                    }

                    // Check if sibling sessions merged recently
                    let siblingNote = "";
                    const planIdMeta = session.metadata["planId"];
                    if (planIdMeta && project) {
                      try {
                        const allSessions = await sessionManager.list(session.projectId);
                        const recentMerges = allSessions.filter(
                          (s) =>
                            s.id !== sessionId &&
                            s.metadata["planId"] === planIdMeta &&
                            s.status === "merged",
                        );
                        if (recentMerges.length > 0) {
                          const mergedPRs = recentMerges
                            .filter((s) => s.pr)
                            .map((s) => `#${s.pr!.number}`)
                            .join(", ");
                          if (mergedPRs) {
                            siblingNote = `\n## Note\nPR ${mergedPRs} merged since your branch was created. Consider rebasing first: \`git fetch origin && git rebase origin/${project.defaultBranch}\`\n`;
                          }
                        }
                      } catch {
                        // ignore
                      }
                    }

                    if (failingChecks.length > 0) {
                      // Use classified error formatting
                      const classifiedSection = formatClassifiedErrors(
                        failingChecks.map((c) => ({ name: c.name, url: c.url })),
                      );

                      // Attempt-aware messaging (Feature 3)
                      let attemptNote = "";
                      if (tracker.attempts > 1 && eventStore) {
                        const currentCheckNames = new Set(failingChecks.map((c) => c.name));
                        const prevCiEvents = eventStore.query({
                          sessionId,
                          types: ["ci.fix_sent"],
                          limit: 1,
                        });
                        if (prevCiEvents.length > 0) {
                          const prevChecks = prevCiEvents[0].data["failingChecks"];
                          if (Array.isArray(prevChecks)) {
                            const prevCheckNames = new Set(prevChecks.filter((c): c is string => typeof c === "string"));
                            const stillFailing = [...currentCheckNames].filter((c) => prevCheckNames.has(c));
                            const nowPassing = [...prevCheckNames].filter((c) => !currentCheckNames.has(c));
                            const newFailures = [...currentCheckNames].filter((c) => !prevCheckNames.has(c));

                            const notes: string[] = [];
                            if (stillFailing.length > 0) {
                              notes.push(`Your previous fix did NOT resolve: ${stillFailing.join(", ")}. Try a fundamentally different approach.`);
                            }
                            if (nowPassing.length > 0) {
                              notes.push(`Previously failing now passing: ${nowPassing.join(", ")}. Good progress.`);
                            }
                            if (newFailures.length > 0) {
                              notes.push(`New failures introduced: ${newFailures.join(", ")}. Your fix may have caused a regression.`);
                            }
                            if (notes.length > 0) {
                              attemptNote = `\n## Attempt ${tracker.attempts} Analysis\n${notes.join("\n")}\n`;
                            }
                          }
                        }
                      }

                      // Store failing check names in ci.failing event data
                      const ciEvent = createEvent("ci.failing", {
                        sessionId,
                        projectId,
                        message: `CI failing: ${failingChecks.map((c) => c.name).join(", ")}`,
                        data: {
                          failingChecks: failingChecks.map((c) => c.name),
                          attempt: tracker.attempts,
                        },
                      });
                      eventStore?.append(ciEvent);

                      enrichedMessage = `# CI Failed on PR #${session.pr.number}\n\n## Failing Checks\n${classifiedSection}\n${prSize}${attemptNote}${siblingNote}\n## Instructions\n${reactionConfig.message}`;
                    }
                  } catch {
                    // Fall back to static message
                  }
                }
              }
            }

            await sessionManager.send(sessionId, enrichedMessage);

            // Emit ci.fix_sent event to track what was sent (Feature 3)
            if (reactionKey === "ci-failed" && eventStore) {
              const session = await sessionManager.get(sessionId);
              if (session?.pr) {
                const project = config.projects[session.projectId];
                const scm = project?.scm
                  ? registry.get<SCM>("scm", project.scm.plugin)
                  : null;
                if (scm) {
                  try {
                    const checks = await scm.getCIChecks(session.pr);
                    const failingCheckNames = checks
                      .filter((c) => c.status === "failed")
                      .map((c) => c.name);

                    eventStore.append(
                      createEvent("ci.fix_sent", {
                        sessionId,
                        projectId,
                        message: `CI fix sent to ${sessionId} (attempt ${tracker.attempts})`,
                        data: {
                          attempt: tracker.attempts,
                          failingChecks: failingCheckNames,
                        },
                      }),
                    );
                  } catch {
                    // ignore
                  }
                }
              }
            }

            // Persist reaction tracker to metadata (Feature 3d)
            {
              const session = await sessionManager.get(sessionId);
              if (session) {
                const project = config.projects[session.projectId];
                if (project) {
                  const sessionsDir = getSessionsDir(config.configPath, project.path);
                  updateMetadata(sessionsDir, sessionId, {
                    [`reaction_${reactionKey}_attempts`]: String(tracker.attempts),
                    [`reaction_${reactionKey}_firstTriggered`]: tracker.firstTriggered.toISOString(),
                  });
                }
              }
            }

            return {
              reactionType: reactionKey,
              success: true,
              action: "send-to-agent",
              message: enrichedMessage,
              escalated: false,
            };
          } catch {
            // Send failed — allow retry on next poll cycle (don't escalate immediately)
            return {
              reactionType: reactionKey,
              success: false,
              action: "send-to-agent",
              escalated: false,
            };
          }
        }
        break;
      }

      case "notify": {
        const event = createEvent("reaction.triggered", {
          sessionId,
          projectId,
          message: `Reaction '${reactionKey}' triggered notification`,
          data: { reactionKey },
        });
        eventStore?.append(event);
        await notifyHuman(event, reactionConfig.priority ?? "info");
        return {
          reactionType: reactionKey,
          success: true,
          action: "notify",
          escalated: false,
        };
      }

      case "auto-merge": {
        // Auto-merge is handled by the SCM plugin
        // For now, just notify
        const event = createEvent("reaction.triggered", {
          sessionId,
          projectId,
          message: `Reaction '${reactionKey}' triggered auto-merge`,
          data: { reactionKey },
        });
        eventStore?.append(event);
        await notifyHuman(event, "action");
        return {
          reactionType: reactionKey,
          success: true,
          action: "auto-merge",
          escalated: false,
        };
      }

      case "spawn-review": {
        // Spawn a review agent to review the PR
        const session = await sessionManager.get(sessionId);
        if (!session?.pr) {
          return {
            reactionType: reactionKey,
            success: false,
            action: "spawn-review",
            escalated: false,
          };
        }

        const project = config.projects[projectId];
        if (!project) {
          return {
            reactionType: reactionKey,
            success: false,
            action: "spawn-review",
            escalated: false,
          };
        }

        try {
          // Look up task context from plan (Feature 6)
          let taskDescription: string | undefined;
          let acceptanceCriteria: string[] | undefined;
          let taskConstraints: string[] | undefined;
          let taskAffectedFiles: string[] | undefined;
          const planIdMeta = session.metadata["planId"];
          if (planIdMeta) {
            try {
              const plan = readPlan(config.configPath, project.path, planIdMeta);
              if (plan) {
                // Find task by matching issueId
                const issueNum = session.issueId
                  ? parseInt(session.issueId.replace(/\D/g, ""), 10)
                  : undefined;
                const task = plan.tasks.find((t) =>
                  t.issueNumber === issueNum || t.sessionId === sessionId,
                );
                if (task) {
                  taskDescription = task.description;
                  acceptanceCriteria = task.acceptanceCriteria;
                  taskConstraints = task.constraints;
                  taskAffectedFiles = task.affectedFiles;
                }
              }
            } catch {
              // Plan lookup failed — continue without task context
            }
          }

          const reviewPrompt = generateReviewPrompt({
            projectId,
            project,
            prNumber: session.pr.number,
            prUrl: session.pr.url,
            prBranch: session.pr.branch,
            baseBranch: session.pr.baseBranch,
            repo: project.repo,
            issueId: session.issueId ?? undefined,
            codingSessionId: sessionId,
            taskDescription,
            acceptanceCriteria,
            taskConstraints,
            taskAffectedFiles,
          });

          await sessionManager.spawn({
            projectId,
            prompt: reviewPrompt,
            branch: project.defaultBranch,
          });

          return {
            reactionType: reactionKey,
            success: true,
            action: "spawn-review",
            escalated: false,
          };
        } catch {
          return {
            reactionType: reactionKey,
            success: false,
            action: "spawn-review",
            escalated: false,
          };
        }
      }

      case "review-gate": {
        // Fetch review comments and send them back to the coding agent
        const session = await sessionManager.get(sessionId);
        if (!session?.pr) {
          return {
            reactionType: reactionKey,
            success: false,
            action: "review-gate",
            escalated: false,
          };
        }

        const project = config.projects[projectId];
        if (!project) {
          return {
            reactionType: reactionKey,
            success: false,
            action: "review-gate",
            escalated: false,
          };
        }

        const scm = project.scm
          ? registry.get<SCM>("scm", project.scm.plugin)
          : null;

        if (!scm) {
          return {
            reactionType: reactionKey,
            success: false,
            action: "review-gate",
            escalated: false,
          };
        }

        try {
          // Fetch review comments
          const reviews = await scm.getReviews(session.pr);
          const pendingComments = await scm.getPendingComments(session.pr);

          // Build feedback message from the latest change-requesting review
          const latestChangesReview = reviews
            .filter((r) => r.state === "changes_requested")
            .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];

          const commentDetails = pendingComments
            .map((c) => {
              const location = c.path ? `\`${c.path}${c.line ? `:${c.line}` : ""}\`` : "";
              return `- ${location} ${c.body}`;
            })
            .join("\n");

          // Check if sibling sessions merged recently
          let siblingNote = "";
          const planIdMeta = session.metadata["planId"];
          if (planIdMeta && project) {
            try {
              const allSessions = await sessionManager.list(session.projectId);
              const recentMerges = allSessions.filter(
                (s) =>
                  s.id !== sessionId &&
                  s.metadata["planId"] === planIdMeta &&
                  s.status === "merged",
              );
              if (recentMerges.length > 0) {
                const mergedPRs = recentMerges
                  .filter((s) => s.pr)
                  .map((s) => `#${s.pr!.number}`)
                  .join(", ");
                if (mergedPRs) {
                  siblingNote = `\n## Note\nPR ${mergedPRs} merged since your branch was created. Consider rebasing first: \`git fetch origin && git rebase origin/${project.defaultBranch}\`\n`;
                }
              }
            } catch {
              // ignore
            }
          }

          const feedbackMessage = `# Review Feedback — Changes Requested

The review agent has requested changes on PR #${session.pr.number}.

${latestChangesReview?.body ? `## Review Summary\n${latestChangesReview.body}\n` : ""}
${commentDetails ? `## Inline Comments\n${commentDetails}\n` : ""}${siblingNote}
## Instructions

Please address all review feedback above, then push your fixes. The review agent will automatically re-review after you push.`;

          await sessionManager.send(sessionId, feedbackMessage);

          // Track review attempts in metadata
          const reviewAttempts = parseInt(session.metadata["reviewAttempts"] ?? "0", 10) + 1;
          const sessionsDir = getSessionsDir(config.configPath, project.path);
          updateMetadata(sessionsDir, sessionId, {
            reviewAttempts: String(reviewAttempts),
          });

          // Emit feedback event
          const feedbackEvent = createEvent("review.feedback_sent", {
            sessionId,
            projectId,
            message: `Review feedback sent to ${sessionId} (attempt ${reviewAttempts})`,
            data: { reviewAttempts, prNumber: session.pr.number },
          });
          eventStore?.append(feedbackEvent);

          return {
            reactionType: reactionKey,
            success: true,
            action: "review-gate",
            message: `Feedback sent (attempt ${reviewAttempts})`,
            escalated: false,
          };
        } catch {
          return {
            reactionType: reactionKey,
            success: false,
            action: "review-gate",
            escalated: false,
          };
        }
      }

      case "spawn-reconciliation": {
        // Spawn a reconciliation agent to check cross-PR consistency
        if (!reconciliationService) {
          return {
            reactionType: reactionKey,
            success: false,
            action: "spawn-reconciliation",
            message: "Reconciliation service not available",
            escalated: false,
          };
        }

        // The sessionId here is the session that triggered plan completion
        const session = await sessionManager.get(sessionId);
        const planIdFromMeta = session?.metadata["planId"];
        if (!planIdFromMeta) {
          return {
            reactionType: reactionKey,
            success: false,
            action: "spawn-reconciliation",
            escalated: false,
          };
        }

        try {
          await reconciliationService.create(projectId, planIdFromMeta);

          const reconEvent = createEvent("reconciliation.started", {
            sessionId,
            projectId,
            message: `Reconciliation started for plan ${planIdFromMeta}`,
            data: { planId: planIdFromMeta },
          });
          eventStore?.append(reconEvent);

          return {
            reactionType: reactionKey,
            success: true,
            action: "spawn-reconciliation",
            escalated: false,
          };
        } catch {
          return {
            reactionType: reactionKey,
            success: false,
            action: "spawn-reconciliation",
            escalated: false,
          };
        }
      }
    }

    return {
      reactionType: reactionKey,
      success: false,
      action,
      escalated: false,
    };
  }

  /** Send a notification to all configured notifiers. */
  async function notifyHuman(event: OrchestratorEvent, priority: EventPriority): Promise<void> {
    const eventWithPriority = { ...event, priority };
    const notifierNames = config.notificationRouting[priority] ?? config.defaults.notifiers;

    for (const name of notifierNames) {
      const notifier = registry.get<Notifier>("notifier", name);
      if (notifier) {
        try {
          await notifier.notify(eventWithPriority);
        } catch {
          // Notifier failed — not much we can do
        }
      }
    }
  }

  /** Poll a single session and handle state transitions. */
  async function checkSession(session: Session): Promise<void> {
    // Use tracked state if available; otherwise use the persisted metadata status
    // (not session.status, which list() may have already overwritten for dead runtimes).
    // This ensures transitions are detected after a lifecycle manager restart.
    const tracked = states.get(session.id);
    const oldStatus =
      tracked ?? ((session.metadata?.["status"] as SessionStatus | undefined) || session.status);
    const newStatus = await determineStatus(session);

    if (newStatus !== oldStatus) {
      // State transition detected
      states.set(session.id, newStatus);

      // Update metadata — session.projectId is the config key (e.g., "my-app")
      const project = config.projects[session.projectId];
      if (project) {
        const sessionsDir = getSessionsDir(config.configPath, project.path);
        updateMetadata(sessionsDir, session.id, { status: newStatus });
      }

      // Reaction success tracking (Feature 7):
      // When transitioning from ci_failed, track whether the fix resolved the issue
      if (oldStatus === "ci_failed" && eventStore) {
        const ciTracker = reactionTrackers.get(`${session.id}:ci-failed`);
        if (ciTracker && ciTracker.attempts > 0) {
          const resolved =
            newStatus === "pr_open" ||
            newStatus === "review_pending" ||
            newStatus === "approved" ||
            newStatus === "mergeable";
          eventStore.append(
            createEvent(resolved ? "ci.passing" : "ci.fix_failed", {
              sessionId: session.id,
              projectId: session.projectId,
              message: `CI fix ${resolved ? "resolved" : "failed"} after ${ciTracker.attempts} attempt(s)`,
              data: {
                resolved,
                attempt: ciTracker.attempts,
                newStatus,
              },
            }),
          );
        }
      }

      // Reset allCompleteEmitted when any session becomes active again
      if (newStatus !== "merged" && newStatus !== "killed") {
        allCompleteEmitted = false;
      }

      // Clear reaction trackers for the old status so retries reset on state changes
      const oldEventType = statusToEventType(undefined, oldStatus);
      if (oldEventType) {
        const oldReactionKey = eventToReactionKey(oldEventType);
        if (oldReactionKey) {
          reactionTrackers.delete(`${session.id}:${oldReactionKey}`);
        }
      }

      // Handle transition: notify humans and/or trigger reactions
      const eventType = statusToEventType(oldStatus, newStatus);
      if (eventType) {
        // Persist event to store
        const transitionEvent = createEvent(eventType, {
          sessionId: session.id,
          projectId: session.projectId,
          message: `${session.id}: ${oldStatus} → ${newStatus}`,
          data: { oldStatus, newStatus },
        });
        eventStore?.append(transitionEvent);

        let reactionHandledNotify = false;
        const reactionKey = eventToReactionKey(eventType);

        if (reactionKey) {
          // Merge project-specific overrides with global defaults
          const project = config.projects[session.projectId];
          const globalReaction = config.reactions[reactionKey];
          const projectReaction = project?.reactions?.[reactionKey];
          const reactionConfig = projectReaction
            ? { ...globalReaction, ...projectReaction }
            : globalReaction;

          if (reactionConfig && reactionConfig.action) {
            // auto: false skips automated agent actions but still allows notifications
            if (reactionConfig.auto !== false || reactionConfig.action === "notify") {
              await executeReaction(
                session.id,
                session.projectId,
                reactionKey,
                reactionConfig as ReactionConfig,
              );
              // Reaction is handling this event — suppress immediate human notification.
              // "send-to-agent" retries + escalates on its own; "notify"/"auto-merge"
              // already call notifyHuman internally. Notifying here would bypass the
              // delayed escalation behaviour configured via retries/escalateAfter.
              reactionHandledNotify = true;
            }
          }
        }

        // For significant transitions not already notified by a reaction, notify humans
        if (!reactionHandledNotify) {
          const priority = inferPriority(eventType);
          if (priority !== "info") {
            const event = createEvent(eventType, {
              sessionId: session.id,
              projectId: session.projectId,
              message: `${session.id}: ${oldStatus} → ${newStatus}`,
              data: { oldStatus, newStatus },
            });
            await notifyHuman(event, priority);
          }
        }
      }

      // Dependency-based spawn ordering + auto-rebase:
      // When a plan session merges, spawn tasks whose dependencies are now met
      // and send rebase messages to sibling sessions.
      if (
        planService &&
        newStatus === "merged" &&
        session.metadata["planId"]
      ) {
        const planIdMeta = session.metadata["planId"];

        // Spawn tasks whose dependencies are now resolved
        if (planService.spawnReadyTasks) {
          try {
            await planService.spawnReadyTasks(session.projectId, planIdMeta);
          } catch {
            // Will retry on next poll
          }
        }

        // Auto-rebase: send rebase command to sibling sessions
        try {
          const project = config.projects[session.projectId];
          if (project) {
            const allSessions = await sessionManager.list(session.projectId);
            const siblings = allSessions.filter(
              (s) =>
                s.id !== session.id &&
                s.metadata["planId"] === planIdMeta &&
                s.activity !== "exited" &&
                !TERMINAL_STATUSES.has(s.status),
            );

            const defaultBranch = project.defaultBranch;
            const rebaseMsg = `A sibling PR (#${session.pr?.number ?? "?"}) just merged. Please rebase your branch on the latest ${defaultBranch}:
git fetch origin && git rebase origin/${defaultBranch}
Then force-push your branch. This ensures CI runs against the latest code.`;

            for (const sibling of siblings) {
              try {
                await sessionManager.send(sibling.id, rebaseMsg);
              } catch {
                // Sibling may be dead — skip
              }
            }
          }
        } catch {
          // Rebase notification failed — non-critical
        }
      }

      // Plan completion detection: if this session belongs to a plan and
      // just transitioned to a terminal state, check if the entire plan is done
      if (
        planService &&
        TERMINAL_STATUSES.has(newStatus) &&
        session.metadata["planId"]
      ) {
        try {
          const planComplete = await planService.checkPlanCompletion(
            session.projectId,
            session.metadata["planId"],
          );
          if (planComplete) {
            // Look up plan-complete reaction config
            const planReactionKey = "plan-complete";
            const project = config.projects[session.projectId];
            const globalReaction = config.reactions[planReactionKey];
            const projectReaction = project?.reactions?.[planReactionKey];
            const reactionConfig = projectReaction
              ? { ...globalReaction, ...projectReaction }
              : globalReaction;

            if (reactionConfig && reactionConfig.action) {
              if (reactionConfig.auto !== false) {
                await executeReaction(
                  session.id,
                  session.projectId,
                  planReactionKey,
                  reactionConfig as ReactionConfig,
                );
              }
            }
          }
        } catch {
          // Plan completion check failed — will retry next poll
        }
      }

      // Outcome capture: record structured metrics when session reaches terminal state
      if (TERMINAL_STATUSES.has(newStatus) && outcomeService) {
        try {
          outcomeService.captureOutcome(session);
        } catch {
          // Non-fatal — don't block lifecycle
        }
      }

      // Retrospective: spawn analysis agent on non-merged terminal sessions
      if (
        retrospectiveService &&
        TERMINAL_STATUSES.has(newStatus) &&
        newStatus !== "merged"
      ) {
        const retroReactionKey = "session-failed";
        const retroProject = config.projects[session.projectId];
        const retroGlobal = config.reactions[retroReactionKey];
        const retroProjectReaction = retroProject?.reactions?.[retroReactionKey];
        const retroConfig = retroProjectReaction
          ? { ...retroGlobal, ...retroProjectReaction }
          : retroGlobal;

        if (retroConfig?.action === "spawn-retrospective" && retroConfig.auto !== false) {
          try {
            await retrospectiveService.analyze(session.id);
          } catch {
            // Non-fatal
          }
        }
      }
    } else {
      // No transition but track current state
      states.set(session.id, newStatus);
    }
  }

  /** Run one polling cycle across all sessions. */
  async function pollAll(): Promise<void> {
    // Re-entrancy guard: skip if previous poll is still running
    if (polling) return;
    polling = true;

    try {
      const sessions = await sessionManager.list();

      // Include sessions that are active OR whose status changed from what we last saw
      // (e.g., list() detected a dead runtime and marked it "killed" — we need to
      // process that transition even though the new status is terminal)
      const sessionsToCheck = sessions.filter((s) => {
        if (s.status !== "merged" && s.status !== "killed") return true;
        const tracked = states.get(s.id);
        return tracked !== undefined && tracked !== s.status;
      });

      // Poll all sessions concurrently
      await Promise.allSettled(sessionsToCheck.map((s) => checkSession(s)));

      // Prune stale entries from states and reactionTrackers for sessions
      // that no longer appear in the session list (e.g., after kill/cleanup)
      const currentSessionIds = new Set(sessions.map((s) => s.id));
      for (const trackedId of states.keys()) {
        if (!currentSessionIds.has(trackedId)) {
          states.delete(trackedId);
        }
      }
      for (const trackerKey of reactionTrackers.keys()) {
        const sessionId = trackerKey.split(":")[0];
        if (sessionId && !currentSessionIds.has(sessionId)) {
          reactionTrackers.delete(trackerKey);
        }
      }

      // Check if all sessions are complete (trigger reaction only once)
      const activeSessions = sessions.filter((s) => s.status !== "merged" && s.status !== "killed");
      if (sessions.length > 0 && activeSessions.length === 0 && !allCompleteEmitted) {
        allCompleteEmitted = true;

        // Execute all-complete reaction if configured
        const reactionKey = eventToReactionKey("summary.all_complete");
        if (reactionKey) {
          const reactionConfig = config.reactions[reactionKey];
          if (reactionConfig && reactionConfig.action) {
            if (reactionConfig.auto !== false || reactionConfig.action === "notify") {
              await executeReaction("system", "all", reactionKey, reactionConfig as ReactionConfig);
            }
          }
        }
      }
    } catch {
      // Poll cycle failed — will retry next interval
    } finally {
      polling = false;
    }
  }

  return {
    start(intervalMs = 30_000): void {
      if (pollTimer) return; // Already running
      pollTimer = setInterval(() => void pollAll(), intervalMs);
      // Run immediately on start
      void pollAll();
    },

    stop(): void {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },

    getStates(): Map<SessionId, SessionStatus> {
      return new Map(states);
    },

    async check(sessionId: SessionId): Promise<void> {
      const session = await sessionManager.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      await checkSession(session);
    },
  };
}
