import { describe, it, expect } from "vitest";
import { generatePlanRetrospectivePrompt } from "../plan-retrospective-prompt.js";
import type { Plan, SessionOutcome, RetrospectiveRecord, Lesson, ReviewComment } from "../types.js";

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    projectId: "test-project",
    description: "Add authentication feature",
    status: "executing",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    tasks: [],
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<SessionOutcome> = {}): SessionOutcome {
  return {
    sessionId: "tp-1",
    projectId: "test-project",
    outcome: "merged",
    durationMs: 120_000,
    ciRetries: 1,
    reviewRounds: 2,
    timestamp: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeReviewComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id: "rc-1",
    author: "reviewer",
    body: "Use proper types instead of `as any`",
    path: "src/auth.ts",
    line: 42,
    isResolved: false,
    createdAt: new Date("2024-01-01"),
    url: "https://github.com/test/1",
    ...overrides,
  };
}

describe("generatePlanRetrospectivePrompt", () => {
  it("includes plan description and task counts", () => {
    const prompt = generatePlanRetrospectivePrompt({
      plan: makePlan({ description: "Add OAuth login" }),
      prReviewData: [],
      outcomes: [
        makeOutcome({ outcome: "merged" }),
        makeOutcome({ sessionId: "tp-2", outcome: "killed" }),
      ],
      retrospectives: [],
      existingLessons: [],
      outputPath: "/tmp/output.json",
    });

    expect(prompt).toContain("Add OAuth login");
    expect(prompt).toContain("1 merged, 1 failed, 2 total");
  });

  it("includes PR review comments", () => {
    const prompt = generatePlanRetrospectivePrompt({
      plan: makePlan(),
      prReviewData: [
        {
          prNumber: 42,
          title: "Add auth middleware",
          comments: [makeReviewComment()],
        },
      ],
      outcomes: [],
      retrospectives: [],
      existingLessons: [],
      outputPath: "/tmp/output.json",
    });

    expect(prompt).toContain("PR #42");
    expect(prompt).toContain("Add auth middleware");
    expect(prompt).toContain("Use proper types");
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("line: 42");
  });

  it("includes session outcomes", () => {
    const prompt = generatePlanRetrospectivePrompt({
      plan: makePlan(),
      prReviewData: [],
      outcomes: [makeOutcome({ sessionId: "tp-5", ciRetries: 3, reviewRounds: 2 })],
      retrospectives: [],
      existingLessons: [],
      outputPath: "/tmp/output.json",
    });

    expect(prompt).toContain("tp-5");
    expect(prompt).toContain("CI retries: 3");
    expect(prompt).toContain("review rounds: 2");
  });

  it("includes retrospectives for failed sessions", () => {
    const retro: RetrospectiveRecord = {
      sessionId: "tp-3",
      projectId: "test-project",
      failureReason: "Missing dependency",
      category: "tooling_problem",
      recommendation: "Add to package.json",
      confidence: "high",
      timestamp: "2024-01-01T00:00:00Z",
    };

    const prompt = generatePlanRetrospectivePrompt({
      plan: makePlan(),
      prReviewData: [],
      outcomes: [],
      retrospectives: [retro],
      existingLessons: [],
      outputPath: "/tmp/output.json",
    });

    expect(prompt).toContain("Missing dependency");
    expect(prompt).toContain("tooling_problem");
    expect(prompt).toContain("Add to package.json");
  });

  it("lists existing lessons to skip", () => {
    const lesson: Lesson = {
      id: "l-1",
      projectId: "test-project",
      planId: "plan-0",
      pattern: "Agents use `as any`",
      recommendation: "Use proper types",
      category: "convention",
      severity: "medium",
      occurrences: 3,
      codified: false,
      timestamp: "2024-01-01T00:00:00Z",
    };

    const prompt = generatePlanRetrospectivePrompt({
      plan: makePlan(),
      prReviewData: [],
      outcomes: [],
      retrospectives: [],
      existingLessons: [lesson],
      outputPath: "/tmp/output.json",
    });

    expect(prompt).toContain("Agents use `as any`");
    expect(prompt).toContain("skip these");
  });

  it("includes output path", () => {
    const prompt = generatePlanRetrospectivePrompt({
      plan: makePlan(),
      prReviewData: [],
      outcomes: [],
      retrospectives: [],
      existingLessons: [],
      outputPath: "/home/user/.ao/plan-retro-output.json",
    });

    expect(prompt).toContain("/home/user/.ao/plan-retro-output.json");
  });
});
