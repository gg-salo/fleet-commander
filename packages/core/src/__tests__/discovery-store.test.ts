import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  getDiscoveriesDir,
  generateDiscoveryId,
  readDiscovery,
  writeDiscovery,
  listDiscoveries,
} from "../discovery-store.js";
import type { Discovery } from "../types.js";

let tempDir: string;
let configPath: string;
const projectPath = "/tmp/test-project";

function makeDiscovery(overrides: Partial<Discovery> = {}): Discovery {
  return {
    id: overrides.id ?? generateDiscoveryId(),
    projectId: "test-project",
    type: "ux-audit",
    status: "discovering",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    findings: [],
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = join(tmpdir(), `ao-test-discovery-store-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  configPath = join(tempDir, "agent-orchestrator.yaml");
  writeFileSync(configPath, "# test config", "utf-8");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("generateDiscoveryId", () => {
  it("generates IDs with discovery- prefix", () => {
    const id = generateDiscoveryId();
    expect(id).toMatch(/^discovery-\d+-[a-f0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDiscoveryId()));
    expect(ids.size).toBe(100);
  });
});

describe("getDiscoveriesDir", () => {
  it("returns a path ending with /discoveries", () => {
    const dir = getDiscoveriesDir(configPath, projectPath);
    expect(dir).toMatch(/\/discoveries$/);
  });
});

describe("writeDiscovery + readDiscovery", () => {
  it("writes and reads a discovery", () => {
    const discovery = makeDiscovery();
    writeDiscovery(configPath, projectPath, discovery);

    const read = readDiscovery(configPath, projectPath, discovery.id);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(discovery.id);
    expect(read!.type).toBe("ux-audit");
    expect(read!.status).toBe("discovering");
  });

  it("returns null for non-existent discovery", () => {
    const read = readDiscovery(configPath, projectPath, "discovery-999-abcdef01");
    expect(read).toBeNull();
  });

  it("preserves findings in round-trip", () => {
    const discovery = makeDiscovery({
      status: "ready",
      findings: [
        {
          id: "1",
          title: "Missing error boundary",
          description: "Dashboard routes lack error boundaries",
          category: "error-handling",
          priority: "high",
          effort: "small",
        },
        {
          id: "2",
          title: "Inconsistent spacing",
          description: "Button padding varies across components",
          category: "visual-consistency",
          priority: "medium",
          effort: "small",
        },
      ],
    });

    writeDiscovery(configPath, projectPath, discovery);
    const read = readDiscovery(configPath, projectPath, discovery.id);
    expect(read!.findings).toHaveLength(2);
    expect(read!.findings[0].title).toBe("Missing error boundary");
    expect(read!.findings[1].priority).toBe("medium");
  });
});

describe("readDiscovery — path traversal protection", () => {
  it("rejects discovery IDs with path traversal", () => {
    expect(() => readDiscovery(configPath, projectPath, "../etc/passwd")).toThrow(
      "Invalid discovery ID",
    );
  });

  it("rejects discovery IDs without discovery- prefix", () => {
    expect(() => readDiscovery(configPath, projectPath, "bad-id")).toThrow("Invalid discovery ID");
  });
});

describe("listDiscoveries", () => {
  it("returns empty array when no discoveries exist", () => {
    expect(listDiscoveries(configPath, projectPath)).toEqual([]);
  });

  it("lists discovery IDs sorted newest first", () => {
    const d1 = makeDiscovery({ id: "discovery-1000000000-aaaa" });
    const d2 = makeDiscovery({ id: "discovery-2000000000-bbbb" });
    writeDiscovery(configPath, projectPath, d1);
    writeDiscovery(configPath, projectPath, d2);

    const ids = listDiscoveries(configPath, projectPath);
    expect(ids).toEqual(["discovery-2000000000-bbbb", "discovery-1000000000-aaaa"]);
  });

  it("excludes output files from listing", () => {
    const discovery = makeDiscovery();
    writeDiscovery(configPath, projectPath, discovery);

    // Write an output file
    const discoveriesDir = getDiscoveriesDir(configPath, projectPath);
    writeFileSync(join(discoveriesDir, `${discovery.id}-output.json`), "{}", "utf-8");

    const ids = listDiscoveries(configPath, projectPath);
    expect(ids).toEqual([discovery.id]);
  });
});
