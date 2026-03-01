import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { generateRetrospectivePrompt } from "../retrospective-prompt.js";
import type { Session, OrchestratorEvent } from "../types.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "tp-1",
    projectId: "test-project",
    status: "errored",
    activity: "exited",
    branch: "feat/test",
    issueId: "#42",
    pr: null,
    workspacePath: null,
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(Date.now() - 600_000), // 10 min ago
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
    message: "test event",
    data: {},
    ...overrides,
  };
}

describe("generateRetrospectivePrompt", () => {
  it("includes session info", () => {
    const result = generateRetrospectivePrompt({
      session: makeSession(),
      events: [],
      terminalOutput: "",
    });
    expect(result).toContain("tp-1");
    expect(result).toContain("test-project");
    expect(result).toContain("feat/test");
    expect(result).toContain("errored");
    expect(result).toContain("#42");
  });

  it("includes event timeline", () => {
    const events = [
      makeEvent({ type: "session.working", message: "started working" }),
      makeEvent({ type: "ci.failing", message: "CI failed" }),
    ];
    const result = generateRetrospectivePrompt({
      session: makeSession(),
      events,
      terminalOutput: "",
    });
    expect(result).toContain("session.working");
    expect(result).toContain("ci.failing");
  });

  it("truncates long terminal output", () => {
    const longOutput = "x".repeat(5000);
    const result = generateRetrospectivePrompt({
      session: makeSession(),
      events: [],
      terminalOutput: longOutput,
    });
    // The prompt should not contain the full 5000 chars of output
    expect(result.length).toBeLessThan(longOutput.length + 2000);
  });

  it("includes JSON output structure", () => {
    const result = generateRetrospectivePrompt({
      session: makeSession(),
      events: [],
      terminalOutput: "",
    });
    expect(result).toContain("failureReason");
    expect(result).toContain("category");
    expect(result).toContain("recommendation");
    expect(result).toContain("confidence");
    expect(result).toContain("retrospective-output.json");
  });

  it("includes all category options", () => {
    const result = generateRetrospectivePrompt({
      session: makeSession(),
      events: [],
      terminalOutput: "",
    });
    expect(result).toContain("vague_issue");
    expect(result).toContain("wrong_approach");
    expect(result).toContain("tooling_problem");
    expect(result).toContain("upstream_conflict");
    expect(result).toContain("timeout");
    expect(result).toContain("permission_error");
  });
});
