import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createPlanService } from "../plan-service.js";
import { getPlansDir } from "../plan-store.js";
import type {
  OrchestratorConfig,
  SessionManager,
  PluginRegistry,
  Session,
  PlanTask,
} from "../types.js";

let tempDir: string;
let configPath: string;
const projectPath = "/tmp/test-project";

function makeConfig(): OrchestratorConfig {
  return {
    configPath,
    port: 3000,
    readyThresholdMs: 300_000,
    defaults: {
      runtime: "tmux",
      agent: "claude-code",
      workspace: "worktree",
      notifiers: [],
    },
    projects: {
      "test-project": {
        name: "Test Project",
        repo: "acme/test",
        path: projectPath,
        defaultBranch: "main",
        sessionPrefix: "tp",
      },
    },
    notifiers: {},
    notificationRouting: {
      urgent: [],
      action: [],
      warning: [],
      info: [],
    },
    reactions: {},
  };
}

function makeMockSession(id: string): Session {
  return {
    id,
    projectId: "test-project",
    status: "working",
    activity: "active",
    branch: "main",
    issueId: null,
    pr: null,
    workspacePath: null,
    runtimeHandle: null,
    agentInfo: null,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
  };
}

function makeMockSessionManager(): SessionManager {
  return {
    spawn: vi.fn().mockResolvedValue(makeMockSession("tp-1")),
    spawnOrchestrator: vi.fn().mockResolvedValue(makeMockSession("tp-orch")),
    restore: vi.fn().mockResolvedValue(makeMockSession("tp-1")),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    kill: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue({ killed: [], skipped: [], errors: [] }),
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockRegistry(): PluginRegistry {
  return {
    register: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    list: vi.fn().mockReturnValue([]),
    loadBuiltins: vi.fn().mockResolvedValue(undefined),
    loadFromConfig: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-plan-service-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("createPlan", () => {
  it("creates a plan with planning status", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.createPlan("test-project", "Add dark mode support");

    expect(plan.id).toMatch(/^plan-/);
    expect(plan.projectId).toBe("test-project");
    expect(plan.description).toBe("Add dark mode support");
    expect(plan.status).toBe("planning");
    expect(plan.planningSessionId).toBe("tp-1");
    expect(plan.tasks).toEqual([]);
  });

  it("spawns a session via sessionManager", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    await service.createPlan("test-project", "Add dark mode");

    expect(sessionManager.spawn).toHaveBeenCalledOnce();
    const spawnCall = vi.mocked(sessionManager.spawn).mock.calls[0][0];
    expect(spawnCall.projectId).toBe("test-project");
    expect(spawnCall.prompt).toContain("Add dark mode");
    expect(spawnCall.branch).toBe("main");
  });

  it("throws for unknown project", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    await expect(service.createPlan("unknown", "desc")).rejects.toThrow("Unknown project");
  });
});

describe("getPlan", () => {
  it("returns null for non-existent plan", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.getPlan("test-project", "plan-999-abcdef01");
    expect(plan).toBeNull();
  });

  it("transitions to ready when output file exists", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.createPlan("test-project", "Add notifications");

    // Write output file
    const plansDir = getPlansDir(configPath, projectPath);
    const outputPath = join(plansDir, `${plan.id}-output.json`);
    writeFileSync(
      outputPath,
      JSON.stringify({
        tasks: [
          {
            id: "1",
            title: "Add notification service",
            description: "Create a service for push notifications",
            acceptanceCriteria: ["Service sends notifications"],
            scope: "medium",
            dependencies: [],
          },
        ],
      }),
      "utf-8",
    );

    const updated = await service.getPlan("test-project", plan.id);
    expect(updated!.status).toBe("ready");
    expect(updated!.tasks).toHaveLength(1);
    expect(updated!.tasks[0].title).toBe("Add notification service");
  });

  it("transitions to failed when session exits without output", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    vi.mocked(sessionManager.get).mockResolvedValue({
      ...makeMockSession("tp-1"),
      activity: "exited",
    });
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.createPlan("test-project", "Some feature");
    const updated = await service.getPlan("test-project", plan.id);

    expect(updated!.status).toBe("failed");
    expect(updated!.error).toContain("exited without producing");
  });
});

describe("editPlan", () => {
  it("updates tasks when plan is ready", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.createPlan("test-project", "Add auth");

    // Simulate planning complete
    const plansDir = getPlansDir(configPath, projectPath);
    writeFileSync(
      join(plansDir, `${plan.id}-output.json`),
      JSON.stringify({ tasks: [{ id: "1", title: "T1", description: "D1", acceptanceCriteria: [], scope: "small", dependencies: [] }] }),
      "utf-8",
    );
    await service.getPlan("test-project", plan.id); // triggers transition to ready

    const newTasks: PlanTask[] = [
      { id: "1", title: "Updated T1", description: "Updated D1", acceptanceCriteria: ["AC1"], scope: "medium", dependencies: [] },
      { id: "2", title: "New T2", description: "D2", acceptanceCriteria: [], scope: "small", dependencies: ["1"] },
    ];

    const updated = await service.editPlan("test-project", plan.id, newTasks);
    expect(updated.tasks).toHaveLength(2);
    expect(updated.tasks[0].title).toBe("Updated T1");
    expect(updated.tasks[1].title).toBe("New T2");
  });

  it("throws when plan is not in ready status", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.createPlan("test-project", "Feature");

    await expect(service.editPlan("test-project", plan.id, [])).rejects.toThrow(
      /can only be edited in "ready" status/,
    );
  });
});

describe("approvePlan", () => {
  it("transitions plan to executing and spawns agents", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    let spawnCount = 0;
    vi.mocked(sessionManager.spawn).mockImplementation(async () => {
      spawnCount++;
      return makeMockSession(`tp-${spawnCount}`);
    });
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.createPlan("test-project", "Add auth");
    spawnCount = 1; // Reset since createPlan calls spawn once

    // Simulate planning complete
    const plansDir = getPlansDir(configPath, projectPath);
    writeFileSync(
      join(plansDir, `${plan.id}-output.json`),
      JSON.stringify({
        tasks: [
          { id: "1", title: "T1", description: "D1", acceptanceCriteria: [], scope: "small", dependencies: [] },
          { id: "2", title: "T2", description: "D2", acceptanceCriteria: [], scope: "small", dependencies: ["1"] },
        ],
      }),
      "utf-8",
    );
    await service.getPlan("test-project", plan.id);

    const approved = await service.approvePlan("test-project", plan.id);

    expect(approved.status).toBe("executing");
    // spawn called: 1 for planning + 2 for coding agents = 3
    expect(sessionManager.spawn).toHaveBeenCalledTimes(3);
  });

  it("throws when plan is not in ready status", async () => {
    const config = makeConfig();
    const sessionManager = makeMockSessionManager();
    const registry = makeMockRegistry();
    const service = createPlanService({ config, sessionManager, registry });

    const plan = await service.createPlan("test-project", "Feature");

    await expect(service.approvePlan("test-project", plan.id)).rejects.toThrow(
      /can only be approved in "ready" status/,
    );
  });
});
