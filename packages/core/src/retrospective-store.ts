/**
 * JSONL-backed retrospective store — one file per project.
 *
 * Append-only, no pruning needed (~300 bytes per record).
 * Follows the same pattern as outcome-store.ts.
 */

import { appendFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectBaseDir } from "./paths.js";
import type { RetrospectiveRecord } from "./types.js";

/** Get the path to the retrospectives JSONL file for a project. */
export function getRetrospectivesFilePath(configPath: string, projectPath: string): string {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  return join(baseDir, "retrospectives.jsonl");
}

/** Append a retrospective record to the JSONL file. */
export function appendRetrospective(
  configPath: string,
  projectPath: string,
  record: RetrospectiveRecord,
): void {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  mkdirSync(baseDir, { recursive: true });
  const filePath = join(baseDir, "retrospectives.jsonl");
  appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
}

/** Read retrospective records from the JSONL file. */
export function readRetrospectives(
  configPath: string,
  projectPath: string,
  limit?: number,
): RetrospectiveRecord[] {
  const filePath = getRetrospectivesFilePath(configPath, projectPath);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return [];

  const records: RetrospectiveRecord[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as RetrospectiveRecord;
      if (parsed.sessionId && parsed.category) {
        records.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Return most recent first
  records.reverse();

  if (limit !== undefined && limit > 0) {
    return records.slice(0, limit);
  }
  return records;
}
