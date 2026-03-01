/**
 * Plan Service — orchestrates the planning workflow.
 *
 * Flow:
 *   createPlan() → spawns planning agent → agent writes output JSON
 *   getPlan()    → checks if output file exists → transitions status
 *   editPlan()   → user edits tasks in "ready" state
 *   approvePlan() → creates GitHub issues → spawns coding agents
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlansDir, readPlan, writePlan, generatePlanId, listPlans } from "./plan-store.js";
import { generatePlanningPrompt } from "./planning-prompt.js";
import { buildPrompt } from "./prompt-builder.js";
import {
  readClaudeMd,
  gatherSiblingContext,
  gatherDependencyDiffs,
  getProjectLessons,
} from "./context-enrichment.js";
import {
  TERMINAL_STATUSES,
  type OrchestratorConfig,
  type SessionManager,
  type PluginRegistry,
  type Plan,
  type PlanId,
  type PlanTask,
  type Tracker,
  type ProjectConfig,
  type SessionStatus,
} from "./types.js";

export interface PlanServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
}

export interface PlanService {
  createPlan(projectId: string, description: string): Promise<Plan>;
  getPlan(projectId: string, planId: PlanId): Promise<Plan | null>;
  editPlan(projectId: string, planId: PlanId, tasks: PlanTask[]): Promise<Plan>;
  approvePlan(projectId: string, planId: PlanId): Promise<Plan>;
  listPlans(projectId: string): PlanId[];
  /**
   * Check if all sessions in a plan have reached terminal state.
   * Returns the planId if complete, null otherwise.
   */
  checkPlanCompletion(projectId: string, planId: PlanId): Promise<boolean>;
  /**
   * Spawn tasks whose dependencies have all been merged.
   * Called by lifecycle manager when a plan session merges.
   */
  spawnReadyTasks(projectId: string, planId: PlanId): Promise<void>;
}

export function createPlanService(deps: PlanServiceDeps): PlanService {
  const { config, sessionManager, registry } = deps;

  function resolveProject(projectId: string): ProjectConfig {
    const project = config.projects[projectId];
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    return project;
  }

  async function createPlan(projectId: string, description: string): Promise<Plan> {
    const project = resolveProject(projectId);
    const planId = generatePlanId();
    const plansDir = getPlansDir(config.configPath, project.path);
    const outputPath = join(plansDir, `${planId}-output.json`);

    // Create initial plan record
    const now = new Date().toISOString();
    const plan: Plan = {
      id: planId,
      projectId,
      description,
      status: "planning",
      createdAt: now,
      updatedAt: now,
      tasks: [],
    };

    writePlan(config.configPath, project.path, plan);

    // Generate the planning prompt
    const prompt = generatePlanningPrompt({
      projectId,
      project,
      featureDescription: description,
      outputPath,
    });

    // Spawn planning agent on a disposable branch (not defaultBranch, which
    // may already be checked out in another worktree).
    const session = await sessionManager.spawn({
      projectId,
      prompt,
      branch: `plan/${planId}`,
    });

    // Update plan with session ID
    plan.planningSessionId = session.id;
    plan.updatedAt = new Date().toISOString();
    writePlan(config.configPath, project.path, plan);

    return plan;
  }

  async function getPlan(projectId: string, planId: PlanId): Promise<Plan | null> {
    const project = resolveProject(projectId);
    const plan = readPlan(config.configPath, project.path, planId);
    if (!plan) return null;

    // If still planning, check if output file exists
    if (plan.status === "planning") {
      const plansDir = getPlansDir(config.configPath, project.path);
      const outputPath = join(plansDir, `${planId}-output.json`);

      if (existsSync(outputPath)) {
        // Agent finished — parse the output
        try {
          const raw = readFileSync(outputPath, "utf-8");
          const output = JSON.parse(raw) as { tasks?: unknown[] };

          if (Array.isArray(output.tasks) && output.tasks.length > 0) {
            plan.tasks = output.tasks.map((raw: unknown, i: number) => {
              const t = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
                string,
                unknown
              >;
              return {
                id: String(t.id ?? i + 1),
                title: String(t.title ?? ""),
                description: String(t.description ?? ""),
                acceptanceCriteria: Array.isArray(t.acceptanceCriteria)
                  ? (t.acceptanceCriteria as unknown[]).map(String)
                  : [],
                scope: t.scope === "medium" ? ("medium" as const) : ("small" as const),
                dependencies: Array.isArray(t.dependencies)
                  ? (t.dependencies as unknown[]).map(String)
                  : [],
                affectedFiles: Array.isArray(t.affectedFiles)
                  ? (t.affectedFiles as unknown[]).map(String)
                  : undefined,
                constraints: Array.isArray(t.constraints)
                  ? (t.constraints as unknown[]).map(String)
                  : undefined,
                sharedContext:
                  typeof t.sharedContext === "string" ? t.sharedContext : undefined,
              };
            });
            plan.status = "ready";
            plan.updatedAt = new Date().toISOString();
            writePlan(config.configPath, project.path, plan);
          }
        } catch {
          plan.status = "failed";
          plan.error = "Failed to parse planning agent output";
          plan.updatedAt = new Date().toISOString();
          writePlan(config.configPath, project.path, plan);
        }
      } else if (plan.planningSessionId) {
        // Check if the planning session has exited without producing output
        try {
          const session = await sessionManager.get(plan.planningSessionId);
          if (session && session.activity === "exited") {
            plan.status = "failed";
            plan.error = "Planning agent exited without producing a plan";
            plan.updatedAt = new Date().toISOString();
            writePlan(config.configPath, project.path, plan);
          }
        } catch {
          // Session lookup failed — leave as planning
        }
      }
    }

    return plan;
  }

  async function editPlan(
    projectId: string,
    planId: PlanId,
    tasks: PlanTask[],
  ): Promise<Plan> {
    const project = resolveProject(projectId);
    const plan = readPlan(config.configPath, project.path, planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    if (plan.status !== "ready") {
      throw new Error(`Plan can only be edited in "ready" status, current: ${plan.status}`);
    }

    plan.tasks = tasks;
    plan.updatedAt = new Date().toISOString();
    writePlan(config.configPath, project.path, plan);
    return plan;
  }

  async function approvePlan(projectId: string, planId: PlanId): Promise<Plan> {
    const project = resolveProject(projectId);
    const plan = readPlan(config.configPath, project.path, planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    if (plan.status !== "ready") {
      throw new Error(`Plan can only be approved in "ready" status, current: ${plan.status}`);
    }

    plan.status = "approved";
    plan.updatedAt = new Date().toISOString();

    // Resolve tracker plugin
    const trackerPlugin = project.tracker
      ? registry.get<Tracker>("tracker", project.tracker.plugin)
      : null;

    // Create GitHub issues for all tasks
    if (trackerPlugin?.createIssue) {
      for (const task of plan.tasks) {
        // Build dependency references
        const depRefs = task.dependencies
          .map((depId) => {
            const depTask = plan.tasks.find((t) => t.id === depId);
            return depTask?.issueNumber ? `#${depTask.issueNumber}` : null;
          })
          .filter(Boolean);

        const depSection =
          depRefs.length > 0
            ? `\n\n## Dependencies\nDepends on: ${depRefs.join(", ")}\n`
            : "";

        const acSection =
          task.acceptanceCriteria.length > 0
            ? `\n\n## Acceptance Criteria\n${task.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}\n`
            : "";

        const constraintsSection =
          task.constraints && task.constraints.length > 0
            ? `\n\n## Constraints\n${task.constraints.map((c) => `- ${c}`).join("\n")}\n`
            : "";

        const affectedFilesSection =
          task.affectedFiles && task.affectedFiles.length > 0
            ? `\n\n## Affected Files\n${task.affectedFiles.map((f) => `- \`${f}\``).join("\n")}\n`
            : "";

        const sharedContextSection =
          task.sharedContext
            ? `\n\n## Shared Context\n${task.sharedContext}\n`
            : "";

        const body = `${task.description}${acSection}${depSection}${constraintsSection}${affectedFilesSection}${sharedContextSection}\n\n**Scope:** ${task.scope}\n\n---\n*Created by Fleet Commander planning agent*`;

        try {
          const issue = await trackerPlugin.createIssue(
            {
              title: task.title,
              description: body,
              labels: ["fleet-commander"],
            },
            project,
          );
          task.issueNumber = parseInt(issue.id, 10) || undefined;
          task.issueUrl = issue.url;
        } catch (err) {
          // Continue creating remaining issues even if one fails
          console.error(`Failed to create issue for task "${task.title}":`, err);
        }
      }
    }

    plan.status = "executing";
    plan.updatedAt = new Date().toISOString();
    writePlan(config.configPath, project.path, plan);

    // Gather enrichment data once before spawning
    const claudeMdContent = readClaudeMd(project.path);
    const projectLessons = getProjectLessons(config.configPath, project.path);

    // Spawn coding agents for tasks with no unresolved dependencies.
    // Tasks with dependencies remain pending (no sessionId) until
    // their dependencies merge, at which point spawnReadyTasks() spawns them.
    for (const task of plan.tasks) {
      const hasUnresolvedDeps = task.dependencies.length > 0;
      if (hasUnresolvedDeps) {
        // Skip — will be spawned by spawnReadyTasks() after deps merge
        continue;
      }

      const issueId = task.issueUrl ?? undefined;

      try {
        // Build enriched prompt via prompt builder
        const enrichedPrompt = buildPrompt({
          project,
          projectId,
          issueId,
          userPrompt: issueId ? undefined : task.description,
          claudeMdContent,
          projectLessons,
        });

        const session = await sessionManager.spawn({
          projectId,
          issueId,
          prompt: enrichedPrompt ?? (issueId ? undefined : task.description),
        });
        task.sessionId = session.id;

        // Store planId in session metadata so lifecycle can detect plan completion
        const projectObj = config.projects[projectId];
        if (projectObj) {
          const { getSessionsDir } = await import("./paths.js");
          const { updateMetadata } = await import("./metadata.js");
          const sessionsDir = getSessionsDir(config.configPath, projectObj.path);
          updateMetadata(sessionsDir, session.id, { planId });
        }
      } catch (err) {
        console.error(`Failed to spawn agent for task "${task.title}":`, err);
      }
    }

    plan.updatedAt = new Date().toISOString();
    writePlan(config.configPath, project.path, plan);
    return plan;
  }

  function listPlanIds(projectId: string): PlanId[] {
    const project = resolveProject(projectId);
    return listPlans(config.configPath, project.path);
  }

  async function checkPlanCompletion(
    projectId: string,
    planId: PlanId,
  ): Promise<boolean> {
    const project = resolveProject(projectId);
    const plan = readPlan(config.configPath, project.path, planId);
    if (!plan) return false;
    if (plan.status !== "executing") return false;

    // Check if all tasks with sessions have reached terminal state
    const tasksWithSessions = plan.tasks.filter((t) => t.sessionId);
    if (tasksWithSessions.length === 0) return false;

    for (const task of tasksWithSessions) {
      const session = await sessionManager.get(task.sessionId!);
      if (!session) continue;
      if (!TERMINAL_STATUSES.has(session.status as SessionStatus)) {
        return false; // At least one session still active
      }
    }

    return true;
  }

  async function spawnReadyTasks(projectId: string, planId: PlanId): Promise<void> {
    const project = resolveProject(projectId);
    const plan = readPlan(config.configPath, project.path, planId);
    if (!plan || plan.status !== "executing") return;

    // Find tasks that are waiting (have dependencies, no sessionId yet)
    const waitingTasks = plan.tasks.filter(
      (t) => t.dependencies.length > 0 && !t.sessionId,
    );
    if (waitingTasks.length === 0) return;

    // Build a map of taskId → sessionId for resolved tasks
    const taskSessionMap = new Map<string, string>();
    for (const t of plan.tasks) {
      if (t.sessionId) {
        taskSessionMap.set(t.id, t.sessionId);
      }
    }

    let changed = false;

    for (const task of waitingTasks) {
      // Check if all dependency tasks have merged sessions
      const allDepsMerged = await Promise.all(
        task.dependencies.map(async (depId) => {
          const depSessionId = taskSessionMap.get(depId);
          if (!depSessionId) return false;
          const session = await sessionManager.get(depSessionId);
          return session?.status === "merged";
        }),
      );

      if (allDepsMerged.every(Boolean)) {
        // All dependencies merged — spawn this task
        const issueId = task.issueUrl ?? undefined;
        try {
          // Gather enrichment data
          const claudeMdContent = readClaudeMd(project.path);
          const projectLessons = getProjectLessons(config.configPath, project.path);
          const siblingContext = await gatherSiblingContext(
            sessionManager,
            projectId,
            planId,
          );
          const dependencyDiffs = await gatherDependencyDiffs(
            project.repo,
            plan,
            task,
          );

          const enrichedPrompt = buildPrompt({
            project,
            projectId,
            issueId,
            userPrompt: issueId ? undefined : task.description,
            claudeMdContent,
            projectLessons,
            siblingContext,
            dependencyDiffs,
          });

          const session = await sessionManager.spawn({
            projectId,
            issueId,
            prompt: enrichedPrompt ?? (issueId ? undefined : task.description),
          });
          task.sessionId = session.id;
          changed = true;

          // Store planId in session metadata
          const { getSessionsDir } = await import("./paths.js");
          const { updateMetadata } = await import("./metadata.js");
          const sessionsDir = getSessionsDir(config.configPath, project.path);
          updateMetadata(sessionsDir, session.id, { planId });
        } catch (err) {
          console.error(`Failed to spawn agent for task "${task.title}":`, err);
        }
      }
    }

    if (changed) {
      plan.updatedAt = new Date().toISOString();
      writePlan(config.configPath, project.path, plan);
    }
  }

  return {
    createPlan,
    getPlan,
    editPlan,
    approvePlan,
    listPlans: listPlanIds,
    checkPlanCompletion,
    spawnReadyTasks,
  };
}
