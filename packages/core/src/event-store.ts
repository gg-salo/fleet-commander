/**
 * JSONL-backed event store — one file per project.
 *
 * Append-only with lazy pruning: when line count exceeds maxEvents, the file
 * is rewritten on the next append to keep only the most recent events.
 */

import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectBaseDir } from "./paths.js";
import type { OrchestratorEvent, EventQuery, EventStore } from "./types.js";

const DEFAULT_MAX_EVENTS = 500;

/** Serialized event in JSONL (dates as ISO strings). */
interface SerializedEvent {
  id: string;
  type: string;
  priority: string;
  sessionId: string;
  projectId: string;
  timestamp: string;
  message: string;
  data: Record<string, unknown>;
}

function serializeEvent(event: OrchestratorEvent): string {
  const serialized: SerializedEvent = {
    id: event.id,
    type: event.type,
    priority: event.priority,
    sessionId: event.sessionId,
    projectId: event.projectId,
    timestamp: event.timestamp.toISOString(),
    message: event.message,
    data: event.data,
  };
  return JSON.stringify(serialized);
}

function deserializeEvent(line: string): OrchestratorEvent | null {
  try {
    const raw = JSON.parse(line) as SerializedEvent;
    if (!raw.id || !raw.type || !raw.timestamp) return null;
    return {
      id: raw.id,
      type: raw.type as OrchestratorEvent["type"],
      priority: raw.priority as OrchestratorEvent["priority"],
      sessionId: raw.sessionId,
      projectId: raw.projectId,
      timestamp: new Date(raw.timestamp),
      message: raw.message,
      data: raw.data ?? {},
    };
  } catch {
    return null;
  }
}

function readAllEvents(filePath: string): OrchestratorEvent[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return [];

  const events: OrchestratorEvent[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const event = deserializeEvent(line);
    if (event) events.push(event);
  }
  return events;
}

function matchesQuery(
  event: OrchestratorEvent,
  options: Omit<EventQuery, "limit" | "offset">,
): boolean {
  if (options.projectId && event.projectId !== options.projectId) return false;
  if (options.types && !options.types.includes(event.type)) return false;
  if (options.priorities && !options.priorities.includes(event.priority)) return false;
  if (options.sessionId && event.sessionId !== options.sessionId) return false;
  if (options.since && event.timestamp < options.since) return false;
  return true;
}

/**
 * Create a JSONL-backed event store for a project.
 *
 * @param configPath - Path to the orchestrator config file
 * @param projectPath - Path to the project directory
 * @param maxEvents - Maximum events to retain (default 500)
 */
export function createEventStore(
  configPath: string,
  projectPath: string,
  maxEvents: number = DEFAULT_MAX_EVENTS,
): EventStore {
  const baseDir = getProjectBaseDir(configPath, projectPath);
  mkdirSync(baseDir, { recursive: true });
  const filePath = join(baseDir, "events.jsonl");

  let lineCount = 0;
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8");
    lineCount = content.split("\n").filter((l) => l.trim()).length;
  }

  return {
    append(event: OrchestratorEvent): void {
      // Lazy pruning: if over limit, rewrite file keeping recent events
      if (lineCount >= maxEvents) {
        const allEvents = readAllEvents(filePath);
        const kept = allEvents.slice(-maxEvents + 1); // Keep maxEvents-1 to make room
        const lines = kept.map(serializeEvent).join("\n") + "\n";
        writeFileSync(filePath, lines, "utf-8");
        lineCount = kept.length;
      }

      appendFileSync(filePath, serializeEvent(event) + "\n", "utf-8");
      lineCount++;
    },

    query(options: EventQuery): OrchestratorEvent[] {
      const allEvents = readAllEvents(filePath);
      const filtered = allEvents.filter((e) => matchesQuery(e, options));

      // Sort newest first
      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      const offset = options.offset ?? 0;
      const limit = options.limit ?? filtered.length;
      return filtered.slice(offset, offset + limit);
    },

    count(options: Omit<EventQuery, "limit" | "offset">): number {
      const allEvents = readAllEvents(filePath);
      return allEvents.filter((e) => matchesQuery(e, options)).length;
    },
  };
}
