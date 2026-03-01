/**
 * Review Batch Service — orchestrates batch PR review workflow.
 *
 * Flow:
 *   listOpenPRs()  → fetches open PRs via SCM
 *   create()       → spawns review agent per PR, stores batch
 *   get()          → polls batch status, auto-spawns fixers if needed
 *   list()         → returns all batch IDs for a project
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readReviewBatch,
  writeReviewBatch,
  generateReviewBatchId,
  listReviewBatches,
} from "./review-batch-store.js";
import { generateBatchReviewPrompt } from "./review-prompt.js";
import type {
  OrchestratorConfig,
  SessionManager,
  PluginRegistry,
  SCM,
  PRInfo,
  ReviewBatch,
  ReviewBatchId,
  ReviewBatchItem,
  ProjectConfig,
} from "./types.js";

const execFileAsync = promisify(execFile);

export interface ReviewBatchServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
}

export interface ReviewBatchService {
  listOpenPRs(projectId: string): Promise<PRInfo[]>;
  create(projectId: string, prNumbers: number[], autoFix?: boolean): Promise<ReviewBatch>;
  get(projectId: string, batchId: ReviewBatchId): Promise<ReviewBatch | null>;
  list(projectId: string): ReviewBatchId[];
}

export function createReviewBatchService(deps: ReviewBatchServiceDeps): ReviewBatchService {
  const { config, sessionManager, registry } = deps;

  function resolveProject(projectId: string): ProjectConfig {
    const project = config.projects[projectId];
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    return project;
  }

  function getSCM(project: ProjectConfig): SCM | null {
    if (!project.scm) return null;
    return registry.get<SCM>("scm", project.scm.plugin);
  }

  /** Fetch diff stat for a PR branch using gh CLI */
  async function getDiffStat(repo: string, prNumber: number): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        "gh",
        ["pr", "diff", String(prNumber), "--repo", repo, "--stat"],
        { timeout: 30_000 },
      );
      // Extract just the file names from diff stat output
      const lines = stdout.trim().split("\n");
      const files = lines
        .slice(0, -1) // Remove summary line
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean);
      return files.join(", ") || "unknown";
    } catch {
      return "unknown";
    }
  }

  async function listOpenPRs(projectId: string): Promise<PRInfo[]> {
    const project = resolveProject(projectId);
    const scm = getSCM(project);
    if (!scm?.listOpenPRs) {
      throw new Error("SCM plugin does not support listOpenPRs");
    }
    return scm.listOpenPRs(project);
  }

  async function create(
    projectId: string,
    prNumbers: number[],
    autoFix = true,
  ): Promise<ReviewBatch> {
    const project = resolveProject(projectId);
    const scm = getSCM(project);
    if (!scm?.listOpenPRs) {
      throw new Error("SCM plugin does not support listOpenPRs");
    }

    // Fetch all open PRs and filter to selected numbers
    const allPRs = await scm.listOpenPRs(project);
    const selectedPRs = allPRs.filter((pr) => prNumbers.includes(pr.number));

    if (selectedPRs.length === 0) {
      throw new Error("No matching open PRs found for the selected numbers");
    }

    const batchId = generateReviewBatchId();
    const now = new Date().toISOString();

    // Read CLAUDE.md content for enriched prompts
    const claudeMdPath = join(project.path, "CLAUDE.md");
    const claudeMdContent = existsSync(claudeMdPath)
      ? readFileSync(claudeMdPath, "utf-8")
      : null;

    // Build sibling PR summaries with diff stats
    const siblingData = await Promise.all(
      selectedPRs.map(async (pr) => ({
        number: pr.number,
        title: pr.title,
        branch: pr.branch,
        diffStat: await getDiffStat(project.repo, pr.number),
      })),
    );

    // Create batch items and spawn review agents
    const items: ReviewBatchItem[] = [];

    for (const pr of selectedPRs) {
      const siblings = siblingData.filter((s) => s.number !== pr.number);

      const prompt = generateBatchReviewPrompt({
        projectId,
        project,
        prNumber: pr.number,
        prUrl: pr.url,
        prBranch: pr.branch,
        baseBranch: pr.baseBranch,
        repo: project.repo,
        claudeMdContent,
        siblingPRs: siblings,
      });

      const item: ReviewBatchItem = {
        prNumber: pr.number,
        prUrl: pr.url,
        prBranch: pr.branch,
        prTitle: pr.title,
        status: "pending",
      };

      try {
        // Use a disposable branch for the review agent (same pattern as planning agent)
        // because defaultBranch may already be checked out in another worktree
        const reviewBranch = `review/${batchId}-pr${pr.number}`;
        const session = await sessionManager.spawn({
          projectId,
          prompt,
          branch: reviewBranch,
        });
        item.reviewSessionId = session.id;
        item.status = "reviewing";
      } catch (err) {
        item.status = "rejected";
        item.error = err instanceof Error ? err.message : "Failed to spawn review agent";
      }

      items.push(item);
    }

    const batch: ReviewBatch = {
      id: batchId,
      projectId,
      status: "reviewing",
      items,
      autoFix,
      createdAt: now,
      updatedAt: now,
    };

    writeReviewBatch(config.configPath, project.path, batch);
    return batch;
  }

  async function get(
    projectId: string,
    batchId: ReviewBatchId,
  ): Promise<ReviewBatch | null> {
    const project = resolveProject(projectId);
    const batch = readReviewBatch(config.configPath, project.path, batchId);
    if (!batch) return null;

    if (batch.status === "done" || batch.status === "failed") {
      return batch;
    }

    const scm = getSCM(project);
    let changed = false;

    for (const item of batch.items) {
      // Check reviewing items: has the review session finished?
      if (item.status === "reviewing" && item.reviewSessionId) {
        try {
          const session = await sessionManager.get(item.reviewSessionId);
          if (session && session.activity === "exited") {
            // Review agent finished — check the review decision on the TARGET PR
            // (not session.pr — review agents don't create PRs, they review existing ones)
            if (scm) {
              // Build a PRInfo for the target PR from the batch item
              const parts = project.repo.split("/");
              const targetPR: PRInfo = {
                number: item.prNumber,
                url: item.prUrl,
                title: item.prTitle,
                owner: parts[0] ?? "",
                repo: parts[1] ?? "",
                branch: item.prBranch,
                baseBranch: project.defaultBranch,
                isDraft: false,
              };

              let decision = await scm.getReviewDecision(targetPR);

              // Fallback: when reviewDecision is "none" or "pending" (e.g. GitHub
              // self-review restriction prevents formal approve/request_changes),
              // parse the latest review comment body to infer the decision.
              if (decision === "none" || decision === "pending") {
                const reviews = await scm.getReviews(targetPR);
                const latestReview = reviews
                  .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];

                if (latestReview?.body) {
                  const bodyUpper = latestReview.body.toUpperCase();
                  if (
                    bodyUpper.includes("REQUEST_CHANGES") ||
                    bodyUpper.includes("REQUEST CHANGES") ||
                    bodyUpper.includes("CHANGES REQUESTED")
                  ) {
                    decision = "changes_requested";
                  } else if (
                    bodyUpper.includes("LGTM") ||
                    bodyUpper.includes("APPROVE")
                  ) {
                    decision = "approved";
                  }
                }
              }

              item.reviewDecision = decision;

              if (decision === "approved") {
                item.status = "approved";
                changed = true;
              } else if (decision === "changes_requested") {
                if (batch.autoFix) {
                  // Spawn a fixer agent on the PR branch
                  try {
                    const reviews = await scm.getReviews(targetPR);
                    const pendingComments = await scm.getPendingComments(targetPR);

                    const latestReview = reviews
                      .filter((r) =>
                        r.state === "changes_requested" ||
                        (r.state === "commented" && r.body &&
                          /REQUEST.?CHANGES|CHANGES.?REQUESTED/i.test(r.body)),
                      )
                      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];

                    const commentDetails = pendingComments
                      .map((c) => {
                        const location = c.path
                          ? `\`${c.path}${c.line ? `:${c.line}` : ""}\``
                          : "";
                        return `- ${location} ${c.body}`;
                      })
                      .join("\n");

                    // Use a fix/ branch to avoid worktree conflicts with the
                    // original coding session that may still have prBranch checked out.
                    // The agent is instructed to push to the original PR branch.
                    const fixBranch = `fix/${batch.id}-pr${item.prNumber}`;

                    const fixPrompt = `# Fix Review Feedback — PR #${item.prNumber}

The review agent requested changes on this PR.

${latestReview?.body ? `## Review Summary\n${latestReview.body}\n` : ""}
${commentDetails ? `## Inline Comments\n${commentDetails}\n` : ""}
## Instructions

1. You are on a temporary branch. First, switch to the PR branch:
   \`\`\`bash
   git checkout ${item.prBranch}
   \`\`\`
2. Address all review feedback above.
3. Commit and push your fixes to \`${item.prBranch}\`:
   \`\`\`bash
   git push origin ${item.prBranch}
   \`\`\``;

                    const fixSession = await sessionManager.spawn({
                      projectId,
                      prompt: fixPrompt,
                      branch: fixBranch,
                    });
                    item.fixSessionId = fixSession.id;
                    item.status = "fixing";
                  } catch {
                    item.status = "rejected";
                    item.error = "Failed to spawn fix agent";
                  }
                } else {
                  item.status = "rejected";
                }
                changed = true;
              } else {
                // Still "none"/"pending" after body parsing — no clear signal.
                // Treat as approved (agent posted but didn't use keywords).
                item.status = "approved";
                changed = true;
              }
            } else {
              // No SCM available — can't check review decision
              item.status = "rejected";
              item.error = "SCM plugin not available";
              changed = true;
            }
          }
        } catch {
          // Session lookup failed — leave as reviewing
        }
      }

      // Check fixing items: has the fix session finished?
      if (item.status === "fixing" && item.fixSessionId) {
        try {
          const session = await sessionManager.get(item.fixSessionId);
          if (session && session.activity === "exited") {
            item.status = "fix_done";
            changed = true;
          }
        } catch {
          // Session lookup failed — leave as fixing
        }
      }
    }

    // Update batch status when all items are terminal
    const allTerminal = batch.items.every(
      (i) =>
        i.status === "approved" ||
        i.status === "rejected" ||
        i.status === "fix_done",
    );

    if (allTerminal && batch.items.length > 0) {
      batch.status = "done";
      changed = true;
    } else if (batch.items.some((i) => i.status === "fixing")) {
      if (batch.status !== "fixing") {
        batch.status = "fixing";
        changed = true;
      }
    }

    if (changed) {
      batch.updatedAt = new Date().toISOString();
      writeReviewBatch(config.configPath, project.path, batch);
    }

    return batch;
  }

  function listIds(projectId: string): ReviewBatchId[] {
    const project = resolveProject(projectId);
    return listReviewBatches(config.configPath, project.path);
  }

  return {
    listOpenPRs,
    create,
    get,
    list: listIds,
  };
}
