/**
 * Plan Store — flat-file JSON CRUD for feature plans.
 *
 * Plans are stored as JSON files in ~/.agent-orchestrator/{hash}-{projectId}/plans/
 * alongside the existing sessions/ directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { getProjectBaseDir } from "./paths.js";
import type { Plan, PlanId } from "./types.js";

/**
 * Get the plans directory for a project.
 * Format: ~/.agent-orchestrator/{hash}-{projectId}/plans
 */
export function getPlansDir(configPath: string, projectPath: string): string {
  return join(getProjectBaseDir(configPath, projectPath), "plans");
}

/**
 * Generate a unique plan ID.
 * Format: plan-{timestamp}-{random}
 */
export function generatePlanId(): PlanId {
  const ts = Date.now();
  const rand = randomBytes(4).toString("hex");
  return `plan-${ts}-${rand}`;
}

/** Validate a plan ID to prevent path traversal. */
function isValidPlanId(planId: string): boolean {
  return /^plan-[a-zA-Z0-9_-]+$/.test(planId);
}

/**
 * Read a plan from disk.
 * Returns null if the plan doesn't exist.
 */
export function readPlan(configPath: string, projectPath: string, planId: PlanId): Plan | null {
  if (!isValidPlanId(planId)) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }

  const plansDir = getPlansDir(configPath, projectPath);
  const filePath = join(plansDir, `${planId}.json`);

  // Validate resolved path is inside plansDir (path traversal protection)
  const resolved = join(plansDir, basename(`${planId}.json`));
  if (resolved !== filePath) {
    throw new Error(`Invalid plan ID: path traversal detected`);
  }

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Plan;
  } catch {
    return null;
  }
}

/**
 * Write a plan to disk.
 * Creates the plans directory if it doesn't exist.
 */
export function writePlan(configPath: string, projectPath: string, plan: Plan): void {
  if (!isValidPlanId(plan.id)) {
    throw new Error(`Invalid plan ID: ${plan.id}`);
  }

  const plansDir = getPlansDir(configPath, projectPath);
  mkdirSync(plansDir, { recursive: true });

  const filePath = join(plansDir, `${plan.id}.json`);
  writeFileSync(filePath, JSON.stringify(plan, null, 2), "utf-8");
}

/**
 * List all plan IDs for a project.
 * Returns an array of plan IDs sorted by creation time (newest first).
 */
export function listPlans(configPath: string, projectPath: string): PlanId[] {
  const plansDir = getPlansDir(configPath, projectPath);

  if (!existsSync(plansDir)) {
    return [];
  }

  return readdirSync(plansDir)
    .filter((f) => f.startsWith("plan-") && f.endsWith(".json") && !f.includes("-output"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
}
