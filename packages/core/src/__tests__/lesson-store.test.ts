import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  appendLessons,
  readLessons,
  markLessonsCodified,
  getLessonsFilePath,
} from "../lesson-store.js";
import type { Lesson } from "../types.js";

let tempDir: string;
let configPath: string;
let projectPath: string;

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: randomUUID().slice(0, 8),
    projectId: "test-project",
    planId: "plan-1",
    pattern: "Agents use `as any` instead of proper types",
    recommendation: "Regenerate types with `supabase gen types`",
    category: "convention",
    severity: "medium",
    occurrences: 3,
    examples: ["PR #23: line 182"],
    codified: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-lesson-store-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
  projectPath = join(tempDir, "project");
  mkdirSync(projectPath, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("lesson-store", () => {
  it("returns empty array when no file exists", () => {
    const result = readLessons(configPath, projectPath);
    expect(result).toEqual([]);
  });

  it("appends and reads lessons", () => {
    const l1 = makeLesson({ id: "l-1", pattern: "Pattern A" });
    const l2 = makeLesson({ id: "l-2", pattern: "Pattern B" });

    appendLessons(configPath, projectPath, [l1, l2]);

    const result = readLessons(configPath, projectPath);
    expect(result).toHaveLength(2);
    // Most recent first
    expect(result[0].id).toBe("l-2");
    expect(result[1].id).toBe("l-1");
  });

  it("respects limit parameter", () => {
    const lessons = Array.from({ length: 5 }, (_, i) =>
      makeLesson({ id: `l-${i}` }),
    );
    appendLessons(configPath, projectPath, lessons);

    const result = readLessons(configPath, projectPath, 3);
    expect(result).toHaveLength(3);
  });

  it("skips malformed lines", () => {
    const filePath = getLessonsFilePath(configPath, projectPath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(
      filePath,
      '{"id":"l-1","pattern":"x","category":"convention","projectId":"t","planId":"p","recommendation":"y","severity":"low","occurrences":1,"codified":false,"timestamp":"2024-01-01T00:00:00Z"}\nnot json\n{"bad": true}\n',
      "utf-8",
    );

    const result = readLessons(configPath, projectPath);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l-1");
  });

  it("marks lessons as codified", () => {
    const l1 = makeLesson({ id: "l-1" });
    const l2 = makeLesson({ id: "l-2" });
    const l3 = makeLesson({ id: "l-3" });

    appendLessons(configPath, projectPath, [l1, l2, l3]);
    markLessonsCodified(configPath, projectPath, ["l-1", "l-3"]);

    const result = readLessons(configPath, projectPath);
    const codifiedIds = result.filter((l) => l.codified).map((l) => l.id);
    expect(codifiedIds).toContain("l-1");
    expect(codifiedIds).toContain("l-3");

    const l2Result = result.find((l) => l.id === "l-2");
    expect(l2Result?.codified).toBe(false);
  });

  it("returns correct file path", () => {
    const path = getLessonsFilePath(configPath, projectPath);
    expect(path).toContain("lessons.jsonl");
  });
});
