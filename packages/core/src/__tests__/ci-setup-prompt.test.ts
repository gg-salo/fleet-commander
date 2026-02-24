import { describe, it, expect } from "vitest";
import { generateCISetupPrompt } from "../ci-setup-prompt.js";
import type { ProjectConfig } from "../types.js";

const project: ProjectConfig = {
  name: "My App",
  repo: "acme/my-app",
  path: "/tmp/my-app",
  defaultBranch: "main",
  sessionPrefix: "my-app",
};

describe("generateCISetupPrompt", () => {
  it("returns a non-empty string", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(100);
  });

  it("includes the project name", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toContain("My App");
  });

  it("includes the repo", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toContain("acme/my-app");
  });

  it("includes the default branch in CI trigger", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toContain("main");
  });

  it("includes the projectId", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toContain("my-app");
  });

  it("instructs to create ci.yml", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toContain(".github/workflows/ci.yml");
  });

  it("instructs to write baseline tests", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toMatch(/baseline tests/i);
  });

  it("instructs to open a PR on chore/setup-ci", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toContain("chore/setup-ci");
  });

  it("includes guideline not to modify source code", () => {
    const result = generateCISetupPrompt({ projectId: "my-app", project });
    expect(result).toMatch(/do NOT modify existing source code/i);
  });

  it("uses a different default branch when configured", () => {
    const devProject: ProjectConfig = { ...project, defaultBranch: "develop" };
    const result = generateCISetupPrompt({ projectId: "my-app", project: devProject });
    expect(result).toContain("develop");
  });

  it("uses different project name when configured", () => {
    const customProject: ProjectConfig = { ...project, name: "Backend Service" };
    const result = generateCISetupPrompt({ projectId: "backend", project: customProject });
    expect(result).toContain("Backend Service");
    expect(result).toContain("backend");
  });
});
