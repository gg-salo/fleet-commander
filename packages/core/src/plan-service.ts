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
import type {
  OrchestratorConfig,
  SessionManager,
  PluginRegistry,
  Plan,
  PlanId,
  PlanTask,
  Tracker,
  ProjectConfig,
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

    // Spawn planning agent session on the default branch
    const session = await sessionManager.spawn({
      projectId,
      prompt,
      branch: project.defaultBranch,
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

        const body = `${task.description}${acSection}${depSection}\n\n**Scope:** ${task.scope}\n\n---\n*Created by Fleet Commander planning agent*`;

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

    // Spawn coding agents for all tasks
    for (const task of plan.tasks) {
      const issueId = task.issueUrl ?? undefined;

      try {
        const session = await sessionManager.spawn({
          projectId,
          issueId,
          prompt: issueId ? undefined : task.description,
        });
        task.sessionId = session.id;
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

  return {
    createPlan,
    getPlan,
    editPlan,
    approvePlan,
    listPlans: listPlanIds,
  };
}
