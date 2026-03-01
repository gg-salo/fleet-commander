/**
 * JSONL-backed outcome store — one file per project.
 *
 * Append-only, no pruning needed (~200 bytes per session).
 * Follows the same pattern as event-store.ts.
 */

import { appendFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectBaseDir } from "./paths.js";
import type { SessionOutcome } from "./types.js";

/** Get the path to the outcomes JSONL file for a project. */
export function getOutcomesFilePath(configPath: string, projectPath: string): string {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  return join(baseDir, "outcomes.jsonl");
}

/** Append an outcome record to the outcomes JSONL file. */
export function appendOutcome(
  configPath: string,
  projectPath: string,
  outcome: SessionOutcome,
): void {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  mkdirSync(baseDir, { recursive: true });
  const filePath = join(baseDir, "outcomes.jsonl");
  appendFileSync(filePath, JSON.stringify(outcome) + "\n", "utf-8");
}

/** Read outcome records from the outcomes JSONL file. */
export function readOutcomes(
  configPath: string,
  projectPath: string,
  limit?: number,
): SessionOutcome[] {
  const filePath = getOutcomesFilePath(configPath, projectPath);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return [];

  const outcomes: SessionOutcome[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as SessionOutcome;
      if (parsed.sessionId && parsed.outcome) {
        outcomes.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Return most recent first
  outcomes.reverse();

  if (limit !== undefined && limit > 0) {
    return outcomes.slice(0, limit);
  }
  return outcomes;
}
