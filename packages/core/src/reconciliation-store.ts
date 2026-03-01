/**
 * Reconciliation Store — flat-file JSON CRUD for reconciliation results.
 *
 * Reconciliations are stored as JSON files in ~/.agent-orchestrator/{hash}-{projectId}/reconciliations/
 * alongside the existing sessions/, plans/, and discoveries/ directories.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { getProjectBaseDir } from "./paths.js";
import type { Reconciliation, ReconciliationId } from "./types.js";

/**
 * Get the reconciliations directory for a project.
 * Format: ~/.agent-orchestrator/{hash}-{projectId}/reconciliations
 */
export function getReconciliationsDir(configPath: string, projectPath: string): string {
  return join(getProjectBaseDir(configPath, projectPath), "reconciliations");
}

/**
 * Generate a unique reconciliation ID.
 * Format: reconciliation-{timestamp}-{random}
 */
export function generateReconciliationId(): ReconciliationId {
  const ts = Date.now();
  const rand = randomBytes(4).toString("hex");
  return `reconciliation-${ts}-${rand}`;
}

/** Validate a reconciliation ID to prevent path traversal. */
function isValidReconciliationId(reconciliationId: string): boolean {
  return /^reconciliation-[a-zA-Z0-9_-]+$/.test(reconciliationId);
}

/**
 * Read a reconciliation from disk.
 * Returns null if the reconciliation doesn't exist.
 */
export function readReconciliation(
  configPath: string,
  projectPath: string,
  reconciliationId: ReconciliationId,
): Reconciliation | null {
  if (!isValidReconciliationId(reconciliationId)) {
    throw new Error(`Invalid reconciliation ID: ${reconciliationId}`);
  }

  const reconciliationsDir = getReconciliationsDir(configPath, projectPath);
  const filePath = join(reconciliationsDir, `${reconciliationId}.json`);

  // Validate resolved path is inside reconciliationsDir (path traversal protection)
  const resolved = join(reconciliationsDir, basename(`${reconciliationId}.json`));
  if (resolved !== filePath) {
    throw new Error(`Invalid reconciliation ID: path traversal detected`);
  }

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Reconciliation;
  } catch {
    return null;
  }
}

/**
 * Write a reconciliation to disk.
 * Creates the reconciliations directory if it doesn't exist.
 */
export function writeReconciliation(
  configPath: string,
  projectPath: string,
  reconciliation: Reconciliation,
): void {
  if (!isValidReconciliationId(reconciliation.id)) {
    throw new Error(`Invalid reconciliation ID: ${reconciliation.id}`);
  }

  const reconciliationsDir = getReconciliationsDir(configPath, projectPath);
  mkdirSync(reconciliationsDir, { recursive: true });

  const filePath = join(reconciliationsDir, `${reconciliation.id}.json`);
  writeFileSync(filePath, JSON.stringify(reconciliation, null, 2), "utf-8");
}

/**
 * List all reconciliation IDs for a project.
 * Returns an array of reconciliation IDs sorted by creation time (newest first).
 */
export function listReconciliations(configPath: string, projectPath: string): ReconciliationId[] {
  const reconciliationsDir = getReconciliationsDir(configPath, projectPath);

  if (!existsSync(reconciliationsDir)) {
    return [];
  }

  return readdirSync(reconciliationsDir)
    .filter(
      (f) => f.startsWith("reconciliation-") && f.endsWith(".json") && !f.includes("-output"),
    )
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
}
