/**
 * Tests for session title heuristic, branch humanization, and utility functions.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { humanizeBranch, getSessionTitle, relativeTime, activityLabel, activityTextColor } from "../format";
import type { DashboardSession } from "../types";

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function makeSession(overrides?: Partial<DashboardSession>): DashboardSession {
  return {
    id: "ao-42",
    projectId: "test",
    status: "working",
    activity: "active",
    branch: null,
    issueId: null,
    issueUrl: null,
    issueLabel: null,
    issueTitle: null,
    summary: null,
    summaryIsFallback: false,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    pr: null,
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// humanizeBranch
// ---------------------------------------------------------------------------

describe("humanizeBranch", () => {
  it("strips common prefixes and title-cases", () => {
    expect(humanizeBranch("feat/infer-project-id")).toBe("Infer Project Id");
    expect(humanizeBranch("fix/broken-auth-flow")).toBe("Broken Auth Flow");
    expect(humanizeBranch("chore/update-deps")).toBe("Update Deps");
    expect(humanizeBranch("refactor/session-manager")).toBe("Session Manager");
    expect(humanizeBranch("docs/add-readme")).toBe("Add Readme");
    expect(humanizeBranch("test/add-coverage")).toBe("Add Coverage");
    expect(humanizeBranch("ci/fix-pipeline")).toBe("Fix Pipeline");
  });

  it("strips additional prefixes added for completeness", () => {
    expect(humanizeBranch("release/1.0.0")).toBe("1.0.0");
    expect(humanizeBranch("hotfix/urgent-patch")).toBe("Urgent Patch");
    expect(humanizeBranch("feature/new-dashboard")).toBe("New Dashboard");
    expect(humanizeBranch("bugfix/null-pointer")).toBe("Null Pointer");
    expect(humanizeBranch("build/docker-image")).toBe("Docker Image");
    expect(humanizeBranch("wip/experimental")).toBe("Experimental");
    expect(humanizeBranch("improvement/faster-queries")).toBe("Faster Queries");
  });

  it("handles session/ prefix", () => {
    expect(humanizeBranch("session/ao-52")).toBe("Ao 52");
  });

  it("handles underscores", () => {
    expect(humanizeBranch("feat/add_new_feature")).toBe("Add New Feature");
  });

  it("handles branch with no prefix", () => {
    expect(humanizeBranch("main")).toBe("Main");
    expect(humanizeBranch("some-branch-name")).toBe("Some Branch Name");
  });

  it("handles branch with dots", () => {
    expect(humanizeBranch("release/v2.1.0")).toBe("V2.1.0");
  });

  it("handles empty string", () => {
    expect(humanizeBranch("")).toBe("");
  });

  it("does not strip unknown prefixes", () => {
    expect(humanizeBranch("custom/my-branch")).toBe("Custom/My Branch");
  });
});

// ---------------------------------------------------------------------------
// getSessionTitle — full fallback chain
// ---------------------------------------------------------------------------

describe("getSessionTitle", () => {
  it("returns PR title when available (highest priority)", () => {
    const session = makeSession({
      summary: "Agent summary",
      issueTitle: "Issue title",
      branch: "feat/branch",
      pr: {
        number: 1,
        url: "https://github.com/test/repo/pull/1",
        title: "feat: add auth",
        owner: "test",
        repo: "repo",
        branch: "feat/branch",
        baseBranch: "main",
        isDraft: false,
        state: "open",
        additions: 10,
        deletions: 5,
        ciStatus: "passing",
        ciChecks: [],
        reviewDecision: "approved",
        mergeability: {
          mergeable: true,
          ciPassing: true,
          approved: true,
          noConflicts: true,
          blockers: [],
        },
        unresolvedThreads: 0,
        unresolvedComments: [],
      },
    });
    expect(getSessionTitle(session)).toBe("feat: add auth");
  });

  it("returns agent summary over issue title", () => {
    const session = makeSession({
      summary: "Implementing OAuth2 authentication with JWT tokens",
      summaryIsFallback: false,
      issueTitle: "Add user authentication",
      branch: "feat/auth",
    });
    expect(getSessionTitle(session)).toBe(
      "Implementing OAuth2 authentication with JWT tokens",
    );
  });

  it("skips fallback summaries in favor of issue title", () => {
    const session = makeSession({
      summary: "You are working on GitHub issue #42: Add authentication to API...",
      summaryIsFallback: true,
      issueTitle: "Add authentication to API",
      branch: "feat/issue-42",
    });
    expect(getSessionTitle(session)).toBe("Add authentication to API");
  });

  it("uses fallback summary when no issue title is available", () => {
    const session = makeSession({
      summary: "You are working on GitHub issue #42: Add authentication to API...",
      summaryIsFallback: true,
      issueTitle: null,
      branch: "feat/issue-42",
    });
    expect(getSessionTitle(session)).toBe(
      "You are working on GitHub issue #42: Add authentication to API...",
    );
  });

  it("returns issue title when no summary exists", () => {
    const session = makeSession({
      summary: null,
      issueTitle: "Add user authentication",
      branch: "feat/auth",
    });
    expect(getSessionTitle(session)).toBe("Add user authentication");
  });

  it("returns humanized branch when no summary or issue title", () => {
    const session = makeSession({
      summary: null,
      issueTitle: null,
      branch: "feat/infer-project-id",
    });
    expect(getSessionTitle(session)).toBe("Infer Project Id");
  });

  it("returns status as absolute last resort", () => {
    const session = makeSession({
      summary: null,
      issueTitle: null,
      branch: null,
    });
    expect(getSessionTitle(session)).toBe("working");
  });

  it("prefers fallback summary over branch when no issue title", () => {
    const session = makeSession({
      summary: "You are working on Linear ticket INT-1327: Refactor session manager",
      summaryIsFallback: true,
      issueTitle: null,
      branch: "feat/INT-1327",
    });
    expect(getSessionTitle(session)).toBe(
      "You are working on Linear ticket INT-1327: Refactor session manager",
    );
  });
});

// ---------------------------------------------------------------------------
// relativeTime
// ---------------------------------------------------------------------------

describe("relativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps < 10s ago", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe("just now");
  });

  it("returns seconds for timestamps < 60s ago", () => {
    vi.useFakeTimers();
    const past = new Date(Date.now() - 30_000).toISOString();
    expect(relativeTime(past)).toBe("30s ago");
    vi.useRealTimers();
  });

  it("returns minutes for timestamps < 60m ago", () => {
    vi.useFakeTimers();
    const past = new Date(Date.now() - 3 * 60_000).toISOString();
    expect(relativeTime(past)).toBe("3m ago");
    vi.useRealTimers();
  });

  it("returns hours for timestamps < 24h ago", () => {
    vi.useFakeTimers();
    const past = new Date(Date.now() - 2 * 3600_000).toISOString();
    expect(relativeTime(past)).toBe("2h ago");
    vi.useRealTimers();
  });

  it("returns days for timestamps >= 24h ago", () => {
    vi.useFakeTimers();
    const past = new Date(Date.now() - 3 * 86400_000).toISOString();
    expect(relativeTime(past)).toBe("3d ago");
    vi.useRealTimers();
  });

  it("returns 'just now' for future timestamps", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(relativeTime(future)).toBe("just now");
  });

  it("returns 'just now' for invalid input", () => {
    expect(relativeTime("not-a-date")).toBe("just now");
  });
});

// ---------------------------------------------------------------------------
// activityLabel
// ---------------------------------------------------------------------------

describe("activityLabel", () => {
  it("returns 'Agent starting…' when status is spawning", () => {
    expect(activityLabel("idle", "spawning")).toBe("Agent starting…");
    expect(activityLabel(null, "spawning")).toBe("Agent starting…");
  });

  it("returns correct label for each activity state", () => {
    expect(activityLabel("active", "working")).toBe("Agent working…");
    expect(activityLabel("ready", "working")).toBe("Agent ready");
    expect(activityLabel("idle", "working")).toBe("Agent idle");
    expect(activityLabel("waiting_input", "working")).toBe("Waiting for input");
    expect(activityLabel("blocked", "working")).toBe("Agent blocked");
    expect(activityLabel("exited", "done")).toBe("Agent exited");
  });

  it("returns 'Agent idle' for null or unknown activity", () => {
    expect(activityLabel(null, "working")).toBe("Agent idle");
    expect(activityLabel("unknown_state", "working")).toBe("Agent idle");
  });
});

// ---------------------------------------------------------------------------
// activityTextColor
// ---------------------------------------------------------------------------

describe("activityTextColor", () => {
  it("returns working color for active", () => {
    expect(activityTextColor("active")).toBe("var(--color-status-working)");
  });

  it("returns ready color for ready", () => {
    expect(activityTextColor("ready")).toBe("var(--color-status-ready)");
  });

  it("returns attention color for waiting_input", () => {
    expect(activityTextColor("waiting_input")).toBe("var(--color-status-attention)");
  });

  it("returns error color for blocked", () => {
    expect(activityTextColor("blocked")).toBe("var(--color-status-error)");
  });

  it("returns muted color for exited", () => {
    expect(activityTextColor("exited")).toBe("var(--color-text-muted)");
  });

  it("returns secondary color for idle and unknown", () => {
    expect(activityTextColor("idle")).toBe("var(--color-text-secondary)");
    expect(activityTextColor(null)).toBe("var(--color-text-secondary)");
  });
});
