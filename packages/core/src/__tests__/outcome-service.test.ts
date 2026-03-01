import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createOutcomeService } from "../outcome-service.js";
import { readOutcomes } from "../outcome-store.js";
import { createEventStore } from "../event-store.js";
import type { Session, OrchestratorEvent } from "../types.js";

let tempDir: string;
let configPath: string;
const projectPath = "/tmp/test-project";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "tp-1",
    projectId: "test-project",
    status: "merged",
    activity: "exited",
    branch: "feat/test",
    issueId: null,
    pr: null,
    workspacePath: null,
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(Date.now() - 60_000), // 1 min ago
    lastActivityAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

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
  tempDir = join(tmpdir(), `ao-test-outcome-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("OutcomeService", () => {
  it("captures merged session with correct outcome", () => {
    const eventStore = createEventStore(configPath, projectPath);
    const service = createOutcomeService({ configPath, projectPath, eventStore });

    const session = makeSession({ status: "merged" });
    service.captureOutcome(session);

    const outcomes = readOutcomes(configPath, projectPath);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe("merged");
    expect(outcomes[0].sessionId).toBe("tp-1");
    expect(outcomes[0].durationMs).toBeGreaterThan(0);
    expect(outcomes[0].ciRetries).toBe(0);
    expect(outcomes[0].reviewRounds).toBe(0);
  });

  it("counts CI retries from event store", () => {
    const eventStore = createEventStore(configPath, projectPath);
    eventStore.append(makeEvent({ type: "ci.failing", sessionId: "tp-1" }));
    eventStore.append(makeEvent({ type: "ci.failing", sessionId: "tp-1" }));
    eventStore.append(makeEvent({ type: "ci.failing", sessionId: "tp-1" }));

    const service = createOutcomeService({ configPath, projectPath, eventStore });
    const session = makeSession({ status: "killed" });
    service.captureOutcome(session);

    const outcomes = readOutcomes(configPath, projectPath);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe("killed");
    expect(outcomes[0].ciRetries).toBe(3);
  });

  it("counts review rounds from event store", () => {
    const eventStore = createEventStore(configPath, projectPath);
    eventStore.append(makeEvent({ type: "review.changes_requested", sessionId: "tp-1" }));
    eventStore.append(makeEvent({ type: "review.changes_requested", sessionId: "tp-1" }));

    const service = createOutcomeService({ configPath, projectPath, eventStore });
    const session = makeSession({ status: "merged" });
    service.captureOutcome(session);

    const outcomes = readOutcomes(configPath, projectPath);
    expect(outcomes[0].reviewRounds).toBe(2);
  });

  it("produces graceful record with no event store", () => {
    const service = createOutcomeService({ configPath, projectPath });

    const session = makeSession({ status: "errored" });
    service.captureOutcome(session);

    const outcomes = readOutcomes(configPath, projectPath);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe("errored");
    expect(outcomes[0].ciRetries).toBe(0);
    expect(outcomes[0].reviewRounds).toBe(0);
  });

  it("captures planId from session metadata", () => {
    const eventStore = createEventStore(configPath, projectPath);
    const service = createOutcomeService({ configPath, projectPath, eventStore });

    const session = makeSession({
      metadata: { planId: "plan-123" },
    });
    service.captureOutcome(session);

    const outcomes = readOutcomes(configPath, projectPath);
    expect(outcomes[0].planId).toBe("plan-123");
  });

  it("captures cost from agentInfo", () => {
    const eventStore = createEventStore(configPath, projectPath);
    const service = createOutcomeService({ configPath, projectPath, eventStore });

    const session = makeSession({
      agentInfo: {
        summary: "test",
        agentSessionId: "s1",
        cost: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.05 },
      },
    });
    service.captureOutcome(session);

    const outcomes = readOutcomes(configPath, projectPath);
    expect(outcomes[0].cost).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCostUsd: 0.05,
    });
  });
});
