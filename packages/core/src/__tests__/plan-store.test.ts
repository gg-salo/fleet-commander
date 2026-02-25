import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  getPlansDir,
  generatePlanId,
  readPlan,
  writePlan,
  listPlans,
} from "../plan-store.js";
import type { Plan } from "../types.js";

// We need a "config file" for the hash-based directory structure.
// Create a temp dir with a fake config file so generateConfigHash works.
let tempDir: string;
let configPath: string;
const projectPath = "/tmp/test-project";

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: overrides.id ?? generatePlanId(),
    projectId: "test-project",
    description: "Add user authentication",
    status: "planning",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [],
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-plan-store-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("generatePlanId", () => {
  it("generates IDs with plan- prefix", () => {
    const id = generatePlanId();
    expect(id).toMatch(/^plan-\d+-[a-f0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generatePlanId()));
    expect(ids.size).toBe(100);
  });
});

describe("getPlansDir", () => {
  it("returns a path ending with /plans", () => {
    const dir = getPlansDir(configPath, projectPath);
    expect(dir).toMatch(/\/plans$/);
  });
});

describe("writePlan + readPlan", () => {
  it("writes and reads a plan", () => {
    const plan = makePlan();
    writePlan(configPath, projectPath, plan);

    const read = readPlan(configPath, projectPath, plan.id);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(plan.id);
    expect(read!.description).toBe("Add user authentication");
    expect(read!.status).toBe("planning");
  });

  it("returns null for non-existent plan", () => {
    const read = readPlan(configPath, projectPath, "plan-999-abcdef01");
    expect(read).toBeNull();
  });

  it("preserves tasks in round-trip", () => {
    const plan = makePlan({
      status: "ready",
      tasks: [
        {
          id: "1",
          title: "Add login form",
          description: "Create a login form component",
          acceptanceCriteria: ["Form renders", "Submits credentials"],
          scope: "small",
          dependencies: [],
        },
        {
          id: "2",
          title: "Add auth middleware",
          description: "Protect API routes",
          acceptanceCriteria: ["Unauthorized returns 401"],
          scope: "medium",
          dependencies: ["1"],
        },
      ],
    });

    writePlan(configPath, projectPath, plan);
    const read = readPlan(configPath, projectPath, plan.id);
    expect(read!.tasks).toHaveLength(2);
    expect(read!.tasks[0].title).toBe("Add login form");
    expect(read!.tasks[1].dependencies).toEqual(["1"]);
  });
});

describe("readPlan — path traversal protection", () => {
  it("rejects plan IDs with path traversal", () => {
    expect(() => readPlan(configPath, projectPath, "../etc/passwd")).toThrow("Invalid plan ID");
  });

  it("rejects plan IDs without plan- prefix", () => {
    expect(() => readPlan(configPath, projectPath, "bad-id")).toThrow("Invalid plan ID");
  });
});

describe("listPlans", () => {
  it("returns empty array when no plans exist", () => {
    expect(listPlans(configPath, projectPath)).toEqual([]);
  });

  it("lists plan IDs sorted newest first", () => {
    const plan1 = makePlan({ id: "plan-1000000000-aaaa" });
    const plan2 = makePlan({ id: "plan-2000000000-bbbb" });
    writePlan(configPath, projectPath, plan1);
    writePlan(configPath, projectPath, plan2);

    const ids = listPlans(configPath, projectPath);
    expect(ids).toEqual(["plan-2000000000-bbbb", "plan-1000000000-aaaa"]);
  });

  it("excludes output files from listing", () => {
    const plan = makePlan();
    writePlan(configPath, projectPath, plan);

    // Write an output file
    const plansDir = getPlansDir(configPath, projectPath);
    writeFileSync(join(plansDir, `${plan.id}-output.json`), "{}", "utf-8");

    const ids = listPlans(configPath, projectPath);
    expect(ids).toEqual([plan.id]);
  });
});
