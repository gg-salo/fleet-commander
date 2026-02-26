import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createEventStore } from "../event-store.js";
import { getProjectBaseDir } from "../paths.js";
import type { OrchestratorEvent } from "../types.js";

let tempDir: string;
let configPath: string;
const projectPath = "/tmp/test-project";

function makeEvent(overrides: Partial<OrchestratorEvent> = {}): OrchestratorEvent {
  return {
    id: randomUUID(),
    type: "session.working",
    priority: "info",
    sessionId: "test-1",
    projectId: "test-project",
    timestamp: new Date(),
    message: "test event",
    data: {},
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-event-store-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("createEventStore", () => {
  it("appends and reads back events", () => {
    const store = createEventStore(configPath, projectPath);
    const event = makeEvent();
    store.append(event);

    const results = store.query({});
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(event.id);
    expect(results[0].message).toBe("test event");
  });

  it("returns empty array when no events", () => {
    const store = createEventStore(configPath, projectPath);
    expect(store.query({})).toEqual([]);
  });

  it("queries by type", () => {
    const store = createEventStore(configPath, projectPath);
    store.append(makeEvent({ type: "session.working" }));
    store.append(makeEvent({ type: "pr.created" }));
    store.append(makeEvent({ type: "ci.failing" }));

    const results = store.query({ types: ["pr.created", "ci.failing"] });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.type === "pr.created" || e.type === "ci.failing")).toBe(true);
  });

  it("queries by priority", () => {
    const store = createEventStore(configPath, projectPath);
    store.append(makeEvent({ priority: "info" }));
    store.append(makeEvent({ priority: "urgent" }));
    store.append(makeEvent({ priority: "action" }));

    const results = store.query({ priorities: ["urgent"] });
    expect(results).toHaveLength(1);
    expect(results[0].priority).toBe("urgent");
  });

  it("queries by sessionId", () => {
    const store = createEventStore(configPath, projectPath);
    store.append(makeEvent({ sessionId: "app-1" }));
    store.append(makeEvent({ sessionId: "app-2" }));
    store.append(makeEvent({ sessionId: "app-1" }));

    const results = store.query({ sessionId: "app-1" });
    expect(results).toHaveLength(2);
  });

  it("queries by since", () => {
    const store = createEventStore(configPath, projectPath);
    const old = makeEvent({ timestamp: new Date("2024-01-01") });
    const recent = makeEvent({ timestamp: new Date("2025-06-01") });
    store.append(old);
    store.append(recent);

    const results = store.query({ since: new Date("2025-01-01") });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(recent.id);
  });

  it("supports limit and offset", () => {
    const store = createEventStore(configPath, projectPath);
    for (let i = 0; i < 10; i++) {
      store.append(makeEvent({ timestamp: new Date(Date.now() + i * 1000) }));
    }

    const page1 = store.query({ limit: 3 });
    expect(page1).toHaveLength(3);

    const page2 = store.query({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);

    // No overlap
    const ids1 = new Set(page1.map((e) => e.id));
    expect(page2.every((e) => !ids1.has(e.id))).toBe(true);
  });

  it("returns newest first", () => {
    const store = createEventStore(configPath, projectPath);
    const e1 = makeEvent({ timestamp: new Date("2024-01-01") });
    const e2 = makeEvent({ timestamp: new Date("2025-01-01") });
    store.append(e1);
    store.append(e2);

    const results = store.query({});
    expect(results[0].id).toBe(e2.id);
    expect(results[1].id).toBe(e1.id);
  });

  it("counts matching events", () => {
    const store = createEventStore(configPath, projectPath);
    store.append(makeEvent({ type: "pr.created" }));
    store.append(makeEvent({ type: "pr.created" }));
    store.append(makeEvent({ type: "ci.failing" }));

    expect(store.count({ types: ["pr.created"] })).toBe(2);
    expect(store.count({})).toBe(3);
  });

  it("prunes when exceeding maxEvents", () => {
    const maxEvents = 10;
    const store = createEventStore(configPath, projectPath, maxEvents);

    // Write more than maxEvents
    for (let i = 0; i < 15; i++) {
      store.append(makeEvent({ message: `event-${i}` }));
    }

    const results = store.query({});
    // After pruning, should have at most maxEvents
    expect(results.length).toBeLessThanOrEqual(maxEvents);
    expect(results.length).toBeGreaterThan(0);
  });

  it("skips malformed JSONL lines", () => {
    const store = createEventStore(configPath, projectPath);
    store.append(makeEvent({ message: "good event" }));

    // Manually append malformed lines to the JSONL file
    const filePath = join(getProjectBaseDir(configPath, projectPath), "events.jsonl");
    appendFileSync(filePath, "not valid json\n", "utf-8");
    appendFileSync(filePath, "{}\n", "utf-8"); // missing required fields

    // Re-create store to read from file
    const store2 = createEventStore(configPath, projectPath);
    const results = store2.query({});
    expect(results).toHaveLength(1);
    expect(results[0].message).toBe("good event");
  });
});
