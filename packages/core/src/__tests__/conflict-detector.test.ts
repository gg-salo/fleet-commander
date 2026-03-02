import { describe, it, expect } from "vitest";
import { predictConflicts } from "../conflict-detector.js";
import type { PlanTask } from "../types.js";

function makeTask(overrides: Partial<PlanTask> & Pick<PlanTask, "id">): PlanTask {
  return {
    title: `Task ${overrides.id}`,
    description: "",
    acceptanceCriteria: [],
    scope: "small",
    dependencies: [],
    ...overrides,
  };
}

describe("predictConflicts", () => {
  it("returns no conflicts when tasks have different files", () => {
    const tasks = [
      makeTask({ id: "1", affectedFiles: ["src/a.ts"] }),
      makeTask({ id: "2", affectedFiles: ["src/b.ts"] }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts).toHaveLength(0);
    expect(report.hasBlockingConflicts).toBe(false);
  });

  it("detects conflict when concurrent tasks share files", () => {
    const tasks = [
      makeTask({ id: "1", affectedFiles: ["src/types.ts", "src/a.ts"] }),
      makeTask({ id: "2", affectedFiles: ["src/types.ts", "src/b.ts"] }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].file).toBe("src/types.ts");
    expect(report.conflicts[0].taskIds).toEqual(["1", "2"]);
  });

  it("reports no conflict when tasks are sequenced via dependencies", () => {
    const tasks = [
      makeTask({ id: "1", affectedFiles: ["src/types.ts"] }),
      makeTask({ id: "2", affectedFiles: ["src/types.ts"], dependencies: ["1"] }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts).toHaveLength(0);
  });

  it("handles transitive dependencies (no conflict)", () => {
    const tasks = [
      makeTask({ id: "1", affectedFiles: ["src/types.ts"] }),
      makeTask({ id: "2", dependencies: ["1"] }),
      makeTask({ id: "3", affectedFiles: ["src/types.ts"], dependencies: ["2"] }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts).toHaveLength(0);
  });

  it("ignores tasks without affectedFiles", () => {
    const tasks = [
      makeTask({ id: "1" }),
      makeTask({ id: "2" }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts).toHaveLength(0);
  });

  it("normalizes leading ./ in file paths", () => {
    const tasks = [
      makeTask({ id: "1", affectedFiles: ["./src/types.ts"] }),
      makeTask({ id: "2", affectedFiles: ["src/types.ts"] }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].file).toBe("src/types.ts");
  });

  it("marks blocking severity when 3+ tasks conflict on same file", () => {
    const tasks = [
      makeTask({ id: "1", affectedFiles: ["src/types.ts"] }),
      makeTask({ id: "2", affectedFiles: ["src/types.ts"] }),
      makeTask({ id: "3", affectedFiles: ["src/types.ts"] }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].severity).toBe("blocking");
    expect(report.hasBlockingConflicts).toBe(true);
  });

  it("detects conflict only between concurrent pairs, not sequenced ones", () => {
    const tasks = [
      makeTask({ id: "1", affectedFiles: ["src/types.ts"] }),
      makeTask({ id: "2", affectedFiles: ["src/types.ts"], dependencies: ["1"] }),
      makeTask({ id: "3", affectedFiles: ["src/types.ts"] }), // Concurrent with both 1 and 2
    ];
    const report = predictConflicts(tasks);
    // Task 3 is concurrent with task 1 (no dependency) → conflict
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].taskIds).toContain("1");
    expect(report.conflicts[0].taskIds).toContain("3");
  });

  it("handles empty task list", () => {
    const report = predictConflicts([]);
    expect(report.conflicts).toHaveLength(0);
    expect(report.hasBlockingConflicts).toBe(false);
  });

  it("includes correct task titles in conflict report", () => {
    const tasks = [
      makeTask({ id: "1", title: "Add types", affectedFiles: ["src/types.ts"] }),
      makeTask({ id: "2", title: "Update types", affectedFiles: ["src/types.ts"] }),
    ];
    const report = predictConflicts(tasks);
    expect(report.conflicts[0].taskTitles).toEqual(["Add types", "Update types"]);
  });
});
