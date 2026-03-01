import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { readClaudeMd, gatherSiblingContext, getProjectLessons } from "../context-enrichment.js";
import { appendOutcome } from "../outcome-store.js";
import type { Session, SessionManager, SessionOutcome } from "../types.js";

let tempDir: string;
let configPath: string;
let projectPath: string;

function makeMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "tp-1",
    projectId: "test-project",
    status: "working",
    activity: "active",
    branch: "feat/test",
    issueId: null,
    pr: null,
    workspacePath: null,
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-enrichment-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
  projectPath = join(tempDir, "project");
  mkdirSync(projectPath, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("readClaudeMd", () => {
  it("returns content when CLAUDE.md exists", () => {
    writeFileSync(join(projectPath, "CLAUDE.md"), "# My Project\nSome rules", "utf-8");
    const result = readClaudeMd(projectPath);
    expect(result).toBe("# My Project\nSome rules");
  });

  it("truncates long files", () => {
    const longContent = "x".repeat(5000);
    writeFileSync(join(projectPath, "CLAUDE.md"), longContent, "utf-8");
    const result = readClaudeMd(projectPath);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThan(5000);
    expect(result).toContain("[...truncated]");
  });

  it("returns undefined for missing file", () => {
    const result = readClaudeMd(projectPath);
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty file", () => {
    writeFileSync(join(projectPath, "CLAUDE.md"), "  \n  ", "utf-8");
    const result = readClaudeMd(projectPath);
    expect(result).toBeUndefined();
  });
});

describe("gatherSiblingContext", () => {
  it("filters by planId and excludes terminal sessions", async () => {
    const sessions: Session[] = [
      makeMockSession({ id: "tp-1", status: "working", metadata: { planId: "plan-1" } }),
      makeMockSession({ id: "tp-2", status: "working", metadata: { planId: "plan-1" } }),
      makeMockSession({ id: "tp-3", status: "merged", metadata: { planId: "plan-1" } }),
      makeMockSession({ id: "tp-4", status: "working", metadata: { planId: "plan-2" } }),
    ];

    const sessionManager: SessionManager = {
      spawn: vi.fn(),
      spawnOrchestrator: vi.fn(),
      restore: vi.fn(),
      list: vi.fn().mockResolvedValue(sessions),
      get: vi.fn(),
      kill: vi.fn(),
      cleanup: vi.fn(),
      send: vi.fn(),
    };

    const result = await gatherSiblingContext(sessionManager, "test-project", "plan-1", "tp-1");
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("tp-2");
  });

  it("returns empty when no planId", async () => {
    const sessionManager: SessionManager = {
      spawn: vi.fn(),
      spawnOrchestrator: vi.fn(),
      restore: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      kill: vi.fn(),
      cleanup: vi.fn(),
      send: vi.fn(),
    };

    const result = await gatherSiblingContext(sessionManager, "test-project", undefined);
    expect(result).toEqual([]);
  });
});

describe("getProjectLessons", () => {
  it("formats top CI failures from outcomes", () => {
    // Append outcomes with failing checks
    for (let i = 0; i < 5; i++) {
      const outcome: SessionOutcome = {
        sessionId: `tp-${i}`,
        projectId: "test",
        outcome: "killed",
        durationMs: 60_000,
        ciRetries: 2,
        reviewRounds: 0,
        failingChecks: ["ESLint", "Build"],
        timestamp: new Date().toISOString(),
      };
      appendOutcome(configPath, projectPath, outcome);
    }

    const result = getProjectLessons(configPath, projectPath);
    expect(result).toBeDefined();
    expect(result).toContain("ESLint");
    expect(result).toContain("Build");
  });

  it("returns undefined with no outcomes", () => {
    const result = getProjectLessons(configPath, projectPath);
    expect(result).toBeUndefined();
  });

  it("reports high failure rate", () => {
    // 4 failures, 1 success → 80% failure rate
    for (let i = 0; i < 4; i++) {
      appendOutcome(configPath, projectPath, {
        sessionId: `tp-${i}`,
        projectId: "test",
        outcome: "killed",
        durationMs: 60_000,
        ciRetries: 0,
        reviewRounds: 0,
        failingChecks: ["Build"],
        timestamp: new Date().toISOString(),
      });
    }
    appendOutcome(configPath, projectPath, {
      sessionId: "tp-4",
      projectId: "test",
      outcome: "merged",
      durationMs: 60_000,
      ciRetries: 0,
      reviewRounds: 0,
      timestamp: new Date().toISOString(),
    });

    const result = getProjectLessons(configPath, projectPath);
    expect(result).toBeDefined();
    expect(result).toContain("80%");
    expect(result).toContain("failed");
  });

  it("reports high CI retry average", () => {
    for (let i = 0; i < 5; i++) {
      appendOutcome(configPath, projectPath, {
        sessionId: `tp-${i}`,
        projectId: "test",
        outcome: "merged",
        durationMs: 60_000,
        ciRetries: 3,
        reviewRounds: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const result = getProjectLessons(configPath, projectPath);
    expect(result).toBeDefined();
    expect(result).toContain("Average CI retries");
  });
});
