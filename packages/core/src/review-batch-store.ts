/**
 * Review Batch Store — flat-file JSON CRUD for review batch results.
 *
 * Review batches are stored as JSON files in
 * ~/.agent-orchestrator/{hash}-{projectId}/review-batches/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { getProjectBaseDir } from "./paths.js";
import type { ReviewBatch, ReviewBatchId } from "./types.js";

/**
 * Get the review-batches directory for a project.
 * Format: ~/.agent-orchestrator/{hash}-{projectId}/review-batches
 */
export function getReviewBatchesDir(configPath: string, projectPath: string): string {
  return join(getProjectBaseDir(configPath, projectPath), "review-batches");
}

/**
 * Generate a unique review batch ID.
 * Format: review-batch-{timestamp}-{random}
 */
export function generateReviewBatchId(): ReviewBatchId {
  const ts = Date.now();
  const rand = randomBytes(4).toString("hex");
  return `review-batch-${ts}-${rand}`;
}

/** Validate a review batch ID to prevent path traversal. */
function isValidReviewBatchId(id: string): boolean {
  return /^review-batch-[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Read a review batch from disk.
 * Returns null if the batch doesn't exist.
 */
export function readReviewBatch(
  configPath: string,
  projectPath: string,
  batchId: ReviewBatchId,
): ReviewBatch | null {
  if (!isValidReviewBatchId(batchId)) {
    throw new Error(`Invalid review batch ID: ${batchId}`);
  }

  const dir = getReviewBatchesDir(configPath, projectPath);
  const filePath = join(dir, `${batchId}.json`);

  // Validate resolved path is inside dir (path traversal protection)
  const resolved = join(dir, basename(`${batchId}.json`));
  if (resolved !== filePath) {
    throw new Error(`Invalid review batch ID: path traversal detected`);
  }

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ReviewBatch;
  } catch {
    return null;
  }
}

/**
 * Write a review batch to disk.
 * Creates the directory if it doesn't exist.
 */
export function writeReviewBatch(
  configPath: string,
  projectPath: string,
  batch: ReviewBatch,
): void {
  if (!isValidReviewBatchId(batch.id)) {
    throw new Error(`Invalid review batch ID: ${batch.id}`);
  }

  const dir = getReviewBatchesDir(configPath, projectPath);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${batch.id}.json`);
  writeFileSync(filePath, JSON.stringify(batch, null, 2), "utf-8");
}

/**
 * List all review batch IDs for a project.
 * Returns an array of IDs sorted by creation time (newest first).
 */
export function listReviewBatches(configPath: string, projectPath: string): ReviewBatchId[] {
  const dir = getReviewBatchesDir(configPath, projectPath);

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((f) => f.startsWith("review-batch-") && f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
}
