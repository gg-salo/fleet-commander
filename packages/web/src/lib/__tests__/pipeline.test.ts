/**
 * Tests for pipeline stage mapping.
 */

import { describe, it, expect } from "vitest";
import {
  getPipelineStage,
  groupByStage,
  computeStageCounts,
  PIPELINE_STAGES,
} from "../pipeline";
import type { DashboardSession, Plan } from "../types";

function createSession(overrides?: Partial<DashboardSession>): DashboardSession {
  return {
    id: "test-1",
    projectId: "test",
    status: "working",
    activity: "idle",
    branch: "feat/test",
    issueId: null,
    issueUrl: null,
    issueLabel: null,
    issueTitle: null,
    summary: "Test session",
    summaryIsFallback: false,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    pr: null,
    activityDetail: null,
    planId: null,
    metadata: {},
    ...overrides,
  };
}

function createPR(overrides?: Record<string, unknown>) {
  return {
    number: 1,
    url: "https://github.com/test/test/pull/1",
    title: "Test PR",
    owner: "test",
    repo: "test",
    branch: "feat/test",
    baseBranch: "main",
    isDraft: false,
    state: "open" as const,
    additions: 10,
    deletions: 5,
    ciStatus: "passing" as const,
    ciChecks: [],
    reviewDecision: "approved" as const,
    mergeability: { mergeable: true, noConflicts: true, blockers: [] },
    unresolvedThreads: 0,
    unresolvedComments: [],
    ...overrides,
  };
}

function createPlan(overrides?: Partial<Plan>): Plan {
  return {
    id: "plan-1" as Plan["id"],
    projectId: "test",
    description: "Test plan",
    status: "planning",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [],
    ...overrides,
  };
}

describe("PIPELINE_STAGES", () => {
  it("has 5 stages in left-to-right order", () => {
    expect(PIPELINE_STAGES.map((s) => s.id)).toEqual([
      "input",
      "planning",
      "building",
      "review",
      "merge",
    ]);
  });
});

describe("getPipelineStage", () => {
  describe("planning stage", () => {
    it("maps spawning sessions with no branch to planning", () => {
      const session = createSession({ status: "spawning", branch: null });
      expect(getPipelineStage(session)).toBe("planning");
    });

    it("maps spawning sessions WITH a branch to building (not planning)", () => {
      const session = createSession({ status: "spawning", branch: "feat/work" });
      expect(getPipelineStage(session)).toBe("building");
    });
  });

  describe("building stage", () => {
    it("maps working session without PR to building", () => {
      const session = createSession({ status: "working", activity: "active" });
      expect(getPipelineStage(session)).toBe("building");
    });

    it("maps idle session without PR to building", () => {
      const session = createSession({ status: "working", activity: "idle" });
      expect(getPipelineStage(session)).toBe("building");
    });

    it("maps needs_input session without PR to building", () => {
      const session = createSession({ status: "needs_input", activity: "waiting_input" });
      expect(getPipelineStage(session)).toBe("building");
    });
  });

  describe("review stage", () => {
    it("maps session with open PR to review", () => {
      const session = createSession({
        status: "pr_open",
        pr: createPR({ mergeability: { mergeable: false, noConflicts: true, blockers: [] } }),
      });
      expect(getPipelineStage(session)).toBe("review");
    });

    it("maps ci_failed session with PR to review", () => {
      const session = createSession({
        status: "ci_failed",
        pr: createPR({ ciStatus: "failing", mergeability: { mergeable: false, noConflicts: true, blockers: [] } }),
      });
      expect(getPipelineStage(session)).toBe("review");
    });

    it("maps review_pending session with PR to review", () => {
      const session = createSession({
        status: "review_pending",
        pr: createPR({ reviewDecision: "pending", mergeability: { mergeable: false, noConflicts: true, blockers: [] } }),
      });
      expect(getPipelineStage(session)).toBe("review");
    });

    it("maps active coding session with PR to review (active agent override)", () => {
      // Active agent → attention level "working", but PR present → review
      const session = createSession({
        status: "pr_open",
        activity: "active",
        pr: createPR({ mergeability: { mergeable: false, noConflicts: true, blockers: [] } }),
      });
      expect(getPipelineStage(session)).toBe("review");
    });
  });

  describe("merge stage", () => {
    it("maps mergeable session to merge", () => {
      const session = createSession({
        status: "mergeable",
        pr: createPR(),
      });
      expect(getPipelineStage(session)).toBe("merge");
    });

    it("maps approved session to merge", () => {
      const session = createSession({
        status: "approved",
        pr: createPR(),
      });
      expect(getPipelineStage(session)).toBe("merge");
    });

    it("maps merged session to merge", () => {
      const session = createSession({ status: "merged" });
      expect(getPipelineStage(session)).toBe("merge");
    });

    it("maps killed session to merge (done attention)", () => {
      const session = createSession({ status: "killed" });
      expect(getPipelineStage(session)).toBe("merge");
    });

    it("maps done session to merge", () => {
      const session = createSession({ status: "done" });
      expect(getPipelineStage(session)).toBe("merge");
    });
  });

  describe("ad-hoc sessions (no planId)", () => {
    it("ad-hoc session without PR goes to building", () => {
      const session = createSession({ planId: null, status: "working", activity: "active" });
      expect(getPipelineStage(session)).toBe("building");
    });

    it("ad-hoc session with PR goes to review", () => {
      const session = createSession({
        planId: null,
        status: "pr_open",
        pr: createPR({ mergeability: { mergeable: false, noConflicts: true, blockers: [] } }),
      });
      expect(getPipelineStage(session)).toBe("review");
    });
  });
});

describe("groupByStage", () => {
  it("distributes sessions into correct stage buckets", () => {
    const sessions = [
      createSession({ id: "s1", status: "spawning", branch: null }),
      createSession({ id: "s2", status: "working", activity: "active" }),
      createSession({ id: "s3", status: "pr_open", pr: createPR({ mergeability: { mergeable: false, noConflicts: true, blockers: [] } }) }),
      createSession({ id: "s4", status: "merged" }),
    ];

    const groups = groupByStage(sessions);
    expect(groups.input).toHaveLength(0);
    expect(groups.planning).toHaveLength(1);
    expect(groups.planning[0].id).toBe("s1");
    expect(groups.building).toHaveLength(1);
    expect(groups.building[0].id).toBe("s2");
    expect(groups.review).toHaveLength(1);
    expect(groups.review[0].id).toBe("s3");
    expect(groups.merge).toHaveLength(1);
    expect(groups.merge[0].id).toBe("s4");
  });

  it("returns empty arrays when no sessions", () => {
    const groups = groupByStage([]);
    expect(groups.input).toHaveLength(0);
    expect(groups.planning).toHaveLength(0);
    expect(groups.building).toHaveLength(0);
    expect(groups.review).toHaveLength(0);
    expect(groups.merge).toHaveLength(0);
  });
});

describe("computeStageCounts", () => {
  it("counts plans in input and sessions in other stages", () => {
    const plans = [
      createPlan({ id: "p1" as Plan["id"], status: "planning" }),
      createPlan({ id: "p2" as Plan["id"], status: "ready" }),
      createPlan({ id: "p3" as Plan["id"], status: "executing" }),
    ];
    const sessions = [
      createSession({ id: "s1", status: "spawning", branch: null }),
      createSession({ id: "s2", status: "working", activity: "active" }),
      createSession({ id: "s3", status: "merged" }),
    ];

    const counts = computeStageCounts(sessions, plans);
    expect(counts.input).toBe(2); // planning + ready plans
    expect(counts.planning).toBe(1);
    expect(counts.building).toBe(1);
    expect(counts.review).toBe(0);
    expect(counts.merge).toBe(1);
  });
});
