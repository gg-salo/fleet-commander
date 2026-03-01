/**
 * Reconciliation Service — orchestrates the cross-PR reconciliation workflow.
 *
 * Flow:
 *   create()  → spawns reconciliation agent → agent writes output JSON
 *   get()     → checks if output file exists → transitions status
 *   list()    → returns all reconciliation IDs for a project
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getReconciliationsDir,
  readReconciliation,
  writeReconciliation,
  generateReconciliationId,
  listReconciliations,
} from "./reconciliation-store.js";
import { generateReconciliationPrompt } from "./reconciliation-prompt.js";
import { readPlan } from "./plan-store.js";
import type {
  OrchestratorConfig,
  SessionManager,
  PluginRegistry,
  Reconciliation,
  ReconciliationId,
  ReconciliationFinding,
  PlanId,
  ProjectConfig,
} from "./types.js";

export interface ReconciliationServiceDeps {
  config: OrchestratorConfig;
  sessionManager: SessionManager;
  registry: PluginRegistry;
}

export interface ReconciliationService {
  create(projectId: string, planId: PlanId): Promise<Reconciliation>;
  get(projectId: string, reconciliationId: ReconciliationId): Promise<Reconciliation | null>;
  list(projectId: string): ReconciliationId[];
}

export function createReconciliationService(
  deps: ReconciliationServiceDeps,
): ReconciliationService {
  const { config, sessionManager } = deps;

  function resolveProject(projectId: string): ProjectConfig {
    const project = config.projects[projectId];
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    return project;
  }

  async function create(projectId: string, planId: PlanId): Promise<Reconciliation> {
    const project = resolveProject(projectId);
    const reconciliationId = generateReconciliationId();
    const reconciliationsDir = getReconciliationsDir(config.configPath, project.path);
    const outputPath = join(reconciliationsDir, `${reconciliationId}-output.json`);

    // Read the plan to get task details
    const plan = readPlan(config.configPath, project.path, planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Create initial reconciliation record
    const now = new Date().toISOString();
    const reconciliation: Reconciliation = {
      id: reconciliationId,
      projectId,
      planId,
      status: "analyzing",
      createdAt: now,
      updatedAt: now,
      findings: [],
    };

    writeReconciliation(config.configPath, project.path, reconciliation);

    // Generate the reconciliation prompt
    const prompt = generateReconciliationPrompt({
      projectId,
      project,
      planDescription: plan.description,
      tasks: plan.tasks,
      outputPath,
    });

    // Spawn reconciliation agent on the default branch (read-only analysis)
    const session = await sessionManager.spawn({
      projectId,
      prompt,
      branch: project.defaultBranch,
    });

    // Update reconciliation with session ID
    reconciliation.sessionId = session.id;
    reconciliation.updatedAt = new Date().toISOString();
    writeReconciliation(config.configPath, project.path, reconciliation);

    return reconciliation;
  }

  async function get(
    projectId: string,
    reconciliationId: ReconciliationId,
  ): Promise<Reconciliation | null> {
    const project = resolveProject(projectId);
    const reconciliation = readReconciliation(config.configPath, project.path, reconciliationId);
    if (!reconciliation) return null;

    // If still analyzing, check if output file exists
    if (reconciliation.status === "analyzing") {
      const reconciliationsDir = getReconciliationsDir(config.configPath, project.path);
      const outputPath = join(reconciliationsDir, `${reconciliationId}-output.json`);

      if (existsSync(outputPath)) {
        // Agent finished — parse the output
        try {
          const raw = readFileSync(outputPath, "utf-8");
          const output = JSON.parse(raw) as {
            findings?: unknown[];
            suggestedMergeOrder?: unknown[];
          };

          if (Array.isArray(output.findings)) {
            reconciliation.findings = output.findings.map((raw: unknown, i: number) => {
              const f = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
                string,
                unknown
              >;
              return {
                id: String(f.id ?? i + 1),
                type: validateFindingType(f.type),
                title: String(f.title ?? ""),
                description: String(f.description ?? ""),
                affectedPRs: Array.isArray(f.affectedPRs)
                  ? (f.affectedPRs as unknown[]).map(Number).filter((n) => !isNaN(n))
                  : [],
                severity: validateSeverity(f.severity),
                suggestedAction: String(f.suggestedAction ?? ""),
              } satisfies ReconciliationFinding;
            });
          }

          if (Array.isArray(output.suggestedMergeOrder)) {
            reconciliation.suggestedMergeOrder = (output.suggestedMergeOrder as unknown[])
              .map(Number)
              .filter((n) => !isNaN(n));
          }

          reconciliation.status = "ready";
          reconciliation.updatedAt = new Date().toISOString();
          writeReconciliation(config.configPath, project.path, reconciliation);
        } catch {
          reconciliation.status = "failed";
          reconciliation.error = "Failed to parse reconciliation agent output";
          reconciliation.updatedAt = new Date().toISOString();
          writeReconciliation(config.configPath, project.path, reconciliation);
        }
      } else if (reconciliation.sessionId) {
        // Check if session exited without producing output
        try {
          const session = await sessionManager.get(reconciliation.sessionId);
          if (session && session.activity === "exited") {
            reconciliation.status = "failed";
            reconciliation.error = "Reconciliation agent exited without producing findings";
            reconciliation.updatedAt = new Date().toISOString();
            writeReconciliation(config.configPath, project.path, reconciliation);
          }
        } catch {
          // Session lookup failed — leave as analyzing
        }
      }
    }

    return reconciliation;
  }

  function listIds(projectId: string): ReconciliationId[] {
    const project = resolveProject(projectId);
    return listReconciliations(config.configPath, project.path);
  }

  return {
    create,
    get,
    list: listIds,
  };
}

function validateFindingType(
  value: unknown,
): "duplication" | "conflict" | "inconsistency" | "merge-order" {
  if (
    value === "duplication" ||
    value === "conflict" ||
    value === "inconsistency" ||
    value === "merge-order"
  ) {
    return value;
  }
  return "inconsistency";
}

function validateSeverity(value: unknown): "blocking" | "warning" | "info" {
  if (value === "blocking" || value === "warning" || value === "info") return value;
  return "warning";
}
