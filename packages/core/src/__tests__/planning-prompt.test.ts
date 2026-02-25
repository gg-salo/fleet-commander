import { describe, it, expect } from "vitest";
import { generatePlanningPrompt } from "../planning-prompt.js";
import type { ProjectConfig } from "../types.js";

const project: ProjectConfig = {
  name: "My App",
  repo: "acme/my-app",
  path: "/tmp/my-app",
  defaultBranch: "main",
  sessionPrefix: "my-app",
};

describe("generatePlanningPrompt", () => {
  const baseOpts = {
    projectId: "my-app",
    project,
    featureDescription: "Add user authentication with OAuth",
    outputPath: "/tmp/plans/plan-123-output.json",
  };

  it("returns a non-empty string", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(100);
  });

  it("includes the project name", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toContain("My App");
  });

  it("includes the repo", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toContain("acme/my-app");
  });

  it("includes the feature description", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toContain("Add user authentication with OAuth");
  });

  it("includes the output path", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toContain("/tmp/plans/plan-123-output.json");
  });

  it("includes the projectId", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toContain("my-app");
  });

  it("includes the default branch", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toContain("main");
  });

  it("instructs NOT to implement code", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toMatch(/DO NOT implement/i);
  });

  it("instructs to write JSON output", () => {
    const result = generatePlanningPrompt(baseOpts);
    expect(result).toContain("JSON");
  });

  it("uses a different default branch when configured", () => {
    const devProject: ProjectConfig = { ...project, defaultBranch: "develop" };
    const result = generatePlanningPrompt({ ...baseOpts, project: devProject });
    expect(result).toContain("develop");
  });

  it("uses different project name when configured", () => {
    const customProject: ProjectConfig = { ...project, name: "Backend Service" };
    const result = generatePlanningPrompt({
      ...baseOpts,
      projectId: "backend",
      project: customProject,
    });
    expect(result).toContain("Backend Service");
    expect(result).toContain("backend");
  });
});
