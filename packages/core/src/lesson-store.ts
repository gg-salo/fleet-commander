/**
 * JSONL-backed lesson store — one file per project.
 *
 * Append-only, no pruning needed (~400 bytes per lesson).
 * Follows the same pattern as outcome-store.ts.
 */

import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { getProjectBaseDir } from "./paths.js";
import type { Lesson } from "./types.js";

/** Get the path to the lessons JSONL file for a project. */
export function getLessonsFilePath(configPath: string, projectPath: string): string {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  return join(baseDir, "lessons.jsonl");
}

/** Append lesson records to the JSONL file. */
export function appendLessons(
  configPath: string,
  projectPath: string,
  lessons: Lesson[],
): void {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  mkdirSync(baseDir, { recursive: true });
  const filePath = join(baseDir, "lessons.jsonl");
  const lines = lessons.map((l) => JSON.stringify(l)).join("\n") + "\n";
  appendFileSync(filePath, lines, "utf-8");
}

/** Read lesson records from the JSONL file. */
export function readLessons(
  configPath: string,
  projectPath: string,
  limit?: number,
): Lesson[] {
  const filePath = getLessonsFilePath(configPath, projectPath);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return [];

  const lessons: Lesson[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Lesson;
      if (parsed.id && parsed.pattern && parsed.category) {
        lessons.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Return most recent first
  lessons.reverse();

  if (limit !== undefined && limit > 0) {
    return lessons.slice(0, limit);
  }
  return lessons;
}

/** Mark specific lessons as codified (incorporated into CLAUDE.md). */
export function markLessonsCodified(
  configPath: string,
  projectPath: string,
  lessonIds: string[],
): void {
  const filePath = getLessonsFilePath(configPath, projectPath);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return;

  const idSet = new Set(lessonIds);
  const lines = content.split("\n");
  const updated: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Lesson;
      if (parsed.id && idSet.has(parsed.id)) {
        parsed.codified = true;
      }
      updated.push(JSON.stringify(parsed));
    } catch {
      updated.push(line); // Preserve malformed lines
    }
  }

  writeFileSync(filePath, updated.join("\n") + "\n", "utf-8");
}
