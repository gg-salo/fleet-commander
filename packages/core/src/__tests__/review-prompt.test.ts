import { describe, it, expect } from "vitest";
import { generateReviewPrompt, type ReviewPromptConfig } from "../review-prompt.js";
import type { ProjectConfig } from "../types.js";

function makeProject(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: "My App",
    repo: "org/my-app",
    path: "/repos/my-app",
    defaultBranch: "main",
    sessionPrefix: "app",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ReviewPromptConfig> = {}): ReviewPromptConfig {
  return {
    projectId: "my-app",
    project: makeProject(),
    prNumber: 42,
    prUrl: "https://github.com/org/my-app/pull/42",
    prBranch: "feat/new-feature",
    baseBranch: "main",
    repo: "org/my-app",
    codingSessionId: "app-1",
    ...overrides,
  };
}

describe("generateReviewPrompt", () => {
  it("includes project name and repo", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("My App");
    expect(prompt).toContain("org/my-app");
  });

  it("includes PR number and URL", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("#42");
    expect(prompt).toContain("https://github.com/org/my-app/pull/42");
  });

  it("includes branch info", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("feat/new-feature");
    expect(prompt).toContain("`main`");
  });

  it("includes gh pr diff command", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("gh pr diff 42 --repo org/my-app");
  });

  it("includes gh pr view command", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("gh pr view 42 --repo org/my-app");
  });

  it("includes gh pr review --approve option", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("gh pr review 42 --repo org/my-app --approve");
  });

  it("includes gh pr review --request-changes option", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("gh pr review 42 --repo org/my-app --request-changes");
  });

  it("includes security and testing checklist", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("Security");
    expect(prompt).toContain("Testing");
    expect(prompt).toContain("Code quality");
    expect(prompt).toContain("Conventions");
  });

  it("instructs NOT to modify code", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).toContain("Do NOT modify any code");
    expect(prompt).toContain("Do NOT push any commits");
  });

  it("includes issue section when issueId is provided", () => {
    const prompt = generateReviewPrompt(makeConfig({ issueId: "123" }));
    expect(prompt).toContain("Issue Context");
    expect(prompt).toContain("gh issue view 123 --repo org/my-app");
  });

  it("omits issue section when issueId is not provided", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).not.toContain("Issue Context");
    expect(prompt).not.toContain("gh issue view");
  });

  it("includes agent rules when project.agentRules is configured", () => {
    const project = makeProject({ agentRules: "Always use strict TypeScript." });
    const prompt = generateReviewPrompt(makeConfig({ project }));
    expect(prompt).toContain("Project-Specific Rules");
    expect(prompt).toContain("Always use strict TypeScript.");
  });

  it("omits agent rules section when project.agentRules is not configured", () => {
    const prompt = generateReviewPrompt(makeConfig());
    expect(prompt).not.toContain("Project-Specific Rules");
  });

  it("includes coding session ID", () => {
    const prompt = generateReviewPrompt(makeConfig({ codingSessionId: "app-7" }));
    expect(prompt).toContain("app-7");
  });

  it("includes project ID", () => {
    const prompt = generateReviewPrompt(makeConfig({ projectId: "backend" }));
    expect(prompt).toContain("backend");
  });
});
