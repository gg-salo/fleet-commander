import { describe, it, expect, vi, afterEach } from "vitest";
import { isZombie, isRestorable, isTerminalSession } from "../types.js";

describe("isZombie", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for terminal statuses", () => {
    expect(isZombie({ status: "killed", activity: "exited", lastActivityAt: new Date() })).toBe(false);
    expect(isZombie({ status: "done", activity: null, lastActivityAt: new Date() })).toBe(false);
    expect(isZombie({ status: "merged", activity: null, lastActivityAt: new Date() })).toBe(false);
  });

  it("returns true for exited activity with non-terminal status", () => {
    expect(isZombie({ status: "working", activity: "exited", lastActivityAt: new Date() })).toBe(true);
    expect(isZombie({ status: "pr_open", activity: "exited", lastActivityAt: new Date() })).toBe(true);
  });

  it("returns true for idle activity older than 10 min with non-terminal status", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
    expect(isZombie({ status: "working", activity: "idle", lastActivityAt: thirtyMinAgo })).toBe(true);
  });

  it("returns false for idle activity within 10 min", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    expect(isZombie({ status: "working", activity: "idle", lastActivityAt: fiveMinAgo })).toBe(false);
  });

  it("returns false for active sessions", () => {
    expect(isZombie({ status: "working", activity: "active", lastActivityAt: new Date() })).toBe(false);
  });

  it("returns false for ready sessions", () => {
    expect(isZombie({ status: "working", activity: "ready", lastActivityAt: new Date() })).toBe(false);
  });

  it("returns false for waiting_input sessions", () => {
    expect(isZombie({ status: "working", activity: "waiting_input", lastActivityAt: new Date() })).toBe(false);
  });
});

describe("isRestorable", () => {
  it("returns true for killed sessions", () => {
    expect(isRestorable({ status: "killed", activity: "exited", lastActivityAt: new Date() })).toBe(true);
  });

  it("returns false for merged sessions", () => {
    expect(isRestorable({ status: "merged", activity: null, lastActivityAt: new Date() })).toBe(false);
  });

  it("returns true for zombie sessions (non-terminal)", () => {
    expect(isRestorable({ status: "working", activity: "exited", lastActivityAt: new Date() })).toBe(true);
  });

  it("returns true for stale idle zombie", () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60_000);
    expect(isRestorable({ status: "pr_open", activity: "idle", lastActivityAt: twentyMinAgo })).toBe(true);
  });

  it("returns false for active working session", () => {
    expect(isRestorable({ status: "working", activity: "active", lastActivityAt: new Date() })).toBe(false);
  });

  it("returns true for errored terminal session", () => {
    expect(isRestorable({ status: "errored", activity: null, lastActivityAt: new Date() })).toBe(true);
  });

  it("returns true for done session", () => {
    expect(isRestorable({ status: "done", activity: null, lastActivityAt: new Date() })).toBe(true);
  });
});

describe("isTerminalSession", () => {
  it("returns true for terminal statuses", () => {
    expect(isTerminalSession({ status: "killed", activity: null })).toBe(true);
    expect(isTerminalSession({ status: "merged", activity: null })).toBe(true);
    expect(isTerminalSession({ status: "done", activity: null })).toBe(true);
  });

  it("returns true for exited activity", () => {
    expect(isTerminalSession({ status: "working", activity: "exited" })).toBe(true);
  });

  it("returns false for non-terminal", () => {
    expect(isTerminalSession({ status: "working", activity: "active" })).toBe(false);
    expect(isTerminalSession({ status: "pr_open", activity: null })).toBe(false);
  });
});
