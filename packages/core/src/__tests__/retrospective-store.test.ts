import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  appendRetrospective,
  readRetrospectives,
  getRetrospectivesFilePath,
} from "../retrospective-store.js";
import type { RetrospectiveRecord } from "../types.js";

let tempDir: string;
let configPath: string;
let projectPath: string;

function makeRecord(overrides: Partial<RetrospectiveRecord> = {}): RetrospectiveRecord {
  return {
    sessionId: `tp-${randomUUID().slice(0, 8)}`,
    projectId: "test-project",
    failureReason: "Build failed due to missing dependency",
    category: "tooling_problem",
    recommendation: "Add missing dependency to package.json",
    confidence: "high",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-retro-store-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
  projectPath = join(tempDir, "project");
  mkdirSync(projectPath, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("retrospective-store", () => {
  it("returns empty array when no file exists", () => {
    const result = readRetrospectives(configPath, projectPath);
    expect(result).toEqual([]);
  });

  it("appends and reads records", () => {
    const r1 = makeRecord({ sessionId: "tp-1" });
    const r2 = makeRecord({ sessionId: "tp-2", category: "wrong_approach" });

    appendRetrospective(configPath, projectPath, r1);
    appendRetrospective(configPath, projectPath, r2);

    const result = readRetrospectives(configPath, projectPath);
    expect(result).toHaveLength(2);
    // Most recent first
    expect(result[0].sessionId).toBe("tp-2");
    expect(result[1].sessionId).toBe("tp-1");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      appendRetrospective(configPath, projectPath, makeRecord({ sessionId: `tp-${i}` }));
    }

    const result = readRetrospectives(configPath, projectPath, 3);
    expect(result).toHaveLength(3);
  });

  it("skips malformed lines", () => {
    const filePath = getRetrospectivesFilePath(configPath, projectPath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(
      filePath,
      '{"sessionId":"tp-1","category":"timeout","failureReason":"x","recommendation":"y","confidence":"high","projectId":"test","timestamp":"2024-01-01T00:00:00Z"}\nnot json\n{"bad": true}\n',
      "utf-8",
    );

    const result = readRetrospectives(configPath, projectPath);
    // Only the first line is valid (has sessionId + category)
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("tp-1");
  });

  it("returns correct file path", () => {
    const path = getRetrospectivesFilePath(configPath, projectPath);
    expect(path).toContain("retrospectives.jsonl");
  });
});
