/**
 * Pure formatting utilities safe for both server and client components.
 * No side effects, no external dependencies.
 */

import type { DashboardSession } from "./types.js";

/**
 * Convert an ISO timestamp to a compact relative time string.
 * Guards: future timestamps → "just now", invalid → "just now".
 */
export function relativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Human-readable label for an agent's current activity state.
 * Status "spawning" overrides any activity value.
 */
export function activityLabel(activity: string | null, status: string): string {
  if (status === "spawning") return "Agent starting…";
  switch (activity) {
    case "active":
      return "Agent working…";
    case "ready":
      return "Agent ready";
    case "idle":
      return "Agent idle";
    case "waiting_input":
      return "Waiting for input";
    case "blocked":
      return "Agent blocked";
    case "exited":
      return "Agent exited";
    default:
      return "Agent idle";
  }
}

/**
 * CSS color variable for an activity state, mirroring ActivityDot's config.
 */
export function activityTextColor(activity: string | null): string {
  switch (activity) {
    case "active":
      return "var(--color-status-working)";
    case "ready":
      return "var(--color-status-ready)";
    case "waiting_input":
      return "var(--color-status-attention)";
    case "blocked":
      return "var(--color-status-error)";
    case "exited":
      return "var(--color-text-muted)";
    case "idle":
    default:
      return "var(--color-text-secondary)";
  }
}

/**
 * Humanize a git branch name into a readable title.
 * e.g., "feat/infer-project-id" → "Infer Project ID"
 *       "fix/broken-auth-flow"  → "Broken Auth Flow"
 *       "session/ao-52"         → "ao-52"
 */
export function humanizeBranch(branch: string): string {
  // Remove common prefixes
  const withoutPrefix = branch.replace(
    /^(?:feat|fix|chore|refactor|docs|test|ci|session|release|hotfix|feature|bugfix|build|wip|improvement)\//,
    "",
  );
  // Replace hyphens and underscores with spaces, then title-case each word
  return withoutPrefix
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Compute the best display title for a session card.
 *
 * Fallback chain (ordered by signal quality):
 *   1. PR title         — human-visible deliverable name
 *   2. Quality summary   — real agent-generated summary (not a fallback)
 *   3. Issue title       — human-written task description
 *   4. Any summary       — even a fallback excerpt is better than nothing
 *   5. Humanized branch  — last resort with semantic content
 *   6. Status text       — absolute fallback
 */
export function getSessionTitle(session: DashboardSession): string {
  // 1. PR title — always best
  if (session.pr?.title) return session.pr.title;

  // 2. Quality summary — skip fallback summaries (truncated spawn prompts)
  if (session.summary && !session.summaryIsFallback) {
    return session.summary;
  }

  // 3. Issue title — human-written task description
  if (session.issueTitle) return session.issueTitle;

  // 4. Any summary — even fallback excerpts beat branch names
  if (session.summary) return session.summary;

  // 5. Humanized branch
  if (session.branch) return humanizeBranch(session.branch);

  // 6. Status
  return session.status;
}
