import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getReactionEffectiveness } from "../reaction-analytics.js";
import { createEventStore } from "../event-store.js";
import type { OrchestratorEvent } from "../types.js";

let tempDir: string;
let configPath: string;
const projectPath = "/tmp/test-project";

function makeEvent(overrides: Partial<OrchestratorEvent> = {}): OrchestratorEvent {
  return {
    id: randomUUID(),
    type: "session.working",
    priority: "info",
    sessionId: "tp-1",
    projectId: "test-project",
    timestamp: new Date(),
    message: "test",
    data: {},
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-analytics-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("getReactionEffectiveness", () => {
  it("computes success rate from CI events", () => {
    const store = createEventStore(configPath, projectPath);

    // Session tp-1: 2 fix attempts, resolved
    store.append(makeEvent({ type: "ci.fix_sent", sessionId: "tp-1", data: { attempt: 1 } }));
    store.append(makeEvent({ type: "ci.fix_sent", sessionId: "tp-1", data: { attempt: 2 } }));
    store.append(makeEvent({ type: "ci.passing", sessionId: "tp-1", data: { resolved: true, attempt: 2 } }));

    // Session tp-2: 1 fix attempt, not resolved
    store.append(makeEvent({ type: "ci.fix_sent", sessionId: "tp-2", data: { attempt: 1 } }));
    store.append(makeEvent({ type: "ci.fix_failed", sessionId: "tp-2", data: { resolved: false, attempt: 1 } }));

    const results = getReactionEffectiveness(store, "test-project");
    expect(results).toHaveLength(1);
    expect(results[0].reactionKey).toBe("ci-failed");
    expect(results[0].totalAttempts).toBe(3);
    expect(results[0].successCount).toBe(1);
    expect(results[0].successRate).toBe(0.5); // 1 of 2 sessions resolved
    expect(results[0].avgAttemptsToResolve).toBe(2); // tp-1 took 2 attempts
  });

  it("returns zero rates with no events", () => {
    const store = createEventStore(configPath, projectPath);
    const results = getReactionEffectiveness(store, "test-project");
    expect(results).toHaveLength(1);
    expect(results[0].totalAttempts).toBe(0);
    expect(results[0].successCount).toBe(0);
    expect(results[0].successRate).toBe(0);
  });

  it("handles all-successful sessions", () => {
    const store = createEventStore(configPath, projectPath);

    store.append(makeEvent({ type: "ci.fix_sent", sessionId: "tp-1", data: { attempt: 1 } }));
    store.append(makeEvent({ type: "ci.passing", sessionId: "tp-1", data: { resolved: true } }));

    store.append(makeEvent({ type: "ci.fix_sent", sessionId: "tp-2", data: { attempt: 1 } }));
    store.append(makeEvent({ type: "ci.passing", sessionId: "tp-2", data: { resolved: true } }));

    const results = getReactionEffectiveness(store, "test-project");
    expect(results[0].successRate).toBe(1);
    expect(results[0].avgAttemptsToResolve).toBe(1);
  });
});
