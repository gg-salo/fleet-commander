/**
 * File Conflict Prediction for parallel plan tasks.
 *
 * Detects when concurrent tasks in a plan will modify the same files,
 * which would cause merge conflicts. Suggests adding task dependencies
 * to serialize the conflicting work.
 */

import type { PlanTask } from "./types.js";

export interface FileConflict {
  file: string;
  taskIds: string[];
  taskTitles: string[];
  severity: "warning" | "blocking";
}

export interface ConflictReport {
  conflicts: FileConflict[];
  hasBlockingConflicts: boolean;
}

/**
 * Check if two tasks are concurrent (neither transitively depends on the other).
 * Two tasks are concurrent when:
 * - a does not transitively depend on b
 * - b does not transitively depend on a
 */
function areConcurrent(aId: string, bId: string, tasks: PlanTask[]): boolean {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function dependsOn(sourceId: string, targetId: string, visited: Set<string>): boolean {
    if (visited.has(sourceId)) return false;
    visited.add(sourceId);
    const task = taskMap.get(sourceId);
    if (!task) return false;
    for (const depId of task.dependencies) {
      if (depId === targetId) return true;
      if (dependsOn(depId, targetId, visited)) return true;
    }
    return false;
  }

  return !dependsOn(aId, bId, new Set()) && !dependsOn(bId, aId, new Set());
}

/** Normalize file paths for comparison (strip leading ./) */
function normalizePath(path: string): string {
  return path.replace(/^\.\//, "");
}

/**
 * Predict file conflicts between concurrent plan tasks.
 *
 * 1. Build a file → taskIds map from task.affectedFiles
 * 2. Filter to files touched by 2+ tasks
 * 3. Check if those tasks are concurrent (not sequenced by dependencies)
 * 4. Concurrent + same files → conflict
 */
export function predictConflicts(tasks: PlanTask[]): ConflictReport {
  // Build file → set of task IDs
  const fileToTasks = new Map<string, Set<string>>();
  for (const task of tasks) {
    if (!task.affectedFiles || task.affectedFiles.length === 0) continue;
    for (const file of task.affectedFiles) {
      const normalized = normalizePath(file);
      const existing = fileToTasks.get(normalized);
      if (existing) {
        existing.add(task.id);
      } else {
        fileToTasks.set(normalized, new Set([task.id]));
      }
    }
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const conflicts: FileConflict[] = [];

  for (const [file, taskIds] of fileToTasks) {
    if (taskIds.size < 2) continue;

    // Find all pairs of concurrent tasks that share this file
    const ids = [...taskIds];
    const concurrentIds = new Set<string>();

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (areConcurrent(ids[i], ids[j], tasks)) {
          concurrentIds.add(ids[i]);
          concurrentIds.add(ids[j]);
        }
      }
    }

    if (concurrentIds.size >= 2) {
      const sortedIds = [...concurrentIds].sort();
      conflicts.push({
        file,
        taskIds: sortedIds,
        taskTitles: sortedIds.map((id) => taskMap.get(id)?.title ?? id),
        severity: concurrentIds.size > 2 ? "blocking" : "warning",
      });
    }
  }

  // Sort by severity (blocking first) then by file name
  conflicts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1;
    return a.file.localeCompare(b.file);
  });

  return {
    conflicts,
    hasBlockingConflicts: conflicts.some((c) => c.severity === "blocking"),
  };
}
