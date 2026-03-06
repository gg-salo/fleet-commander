/**
 * Plan Retrospective Prompt — generates analysis prompt for completed plans.
 *
 * Feeds the analysis agent:
 * - PR review comments (the richest quality signal)
 * - Session outcomes (CI retries, review rounds)
 * - Individual retrospectives (for failed sessions)
 * - Existing lessons (to avoid duplicates)
 */

import type {
  Plan,
  SessionOutcome,
  RetrospectiveRecord,
  Lesson,
  ReviewComment,
} from "./types.js";

export interface PlanRetrospectivePromptConfig {
  plan: Plan;
  prReviewData: Array<{
    prNumber: number;
    title: string;
    comments: ReviewComment[];
  }>;
  outcomes: SessionOutcome[];
  retrospectives: RetrospectiveRecord[];
  existingLessons: Lesson[];
  outputPath: string;
}

const MAX_COMMENTS_PER_PR = 20;

export function generatePlanRetrospectivePrompt(
  config: PlanRetrospectivePromptConfig,
): string {
  const { plan, prReviewData, outcomes, retrospectives, existingLessons, outputPath } =
    config;

  const mergedCount = outcomes.filter((o) => o.outcome === "merged").length;
  const failedCount = outcomes.filter((o) => o.outcome !== "merged").length;

  // Format PR review data
  const prSections = prReviewData
    .filter((pr) => pr.comments.length > 0)
    .map((pr) => {
      const comments = pr.comments
        .slice(0, MAX_COMMENTS_PER_PR)
        .map((c) => {
          const location = c.path ? ` (file: ${c.path}${c.line ? `, line: ${c.line}` : ""})` : "";
          return `  ${c.author}: ${c.body}${location}`;
        })
        .join("\n");
      return `### PR #${pr.prNumber} "${pr.title}"\n${comments}`;
    })
    .join("\n\n");

  // Format outcomes
  const outcomeSections = outcomes
    .map(
      (o) =>
        `- ${o.sessionId}: ${o.outcome}, CI retries: ${o.ciRetries}, review rounds: ${o.reviewRounds}`,
    )
    .join("\n");

  // Format retrospectives
  const retroSections = retrospectives
    .map(
      (r) =>
        `- ${r.failureReason} [${r.category}] → ${r.recommendation}`,
    )
    .join("\n");

  // Format existing lessons (to skip)
  const existingSection = existingLessons
    .map((l) => `- ${l.pattern} → ${l.recommendation}`)
    .join("\n");

  return `# Plan Retrospective Analysis

Analyze completed plan results to identify cross-PR quality patterns.

## Plan: ${plan.description}
- ${mergedCount} merged, ${failedCount} failed, ${outcomes.length} total tasks

## PR Review Data
${prSections || "No review comments found."}

## Session Outcomes
${outcomeSections || "No outcomes recorded."}

## Individual Retrospectives (failed sessions only)
${retroSections || "No retrospectives recorded."}

## Existing Lessons (skip these — already captured)
${existingSection || "None yet."}

## Task
Identify NEW patterns not in existing lessons. Look for:
1. Review themes repeated across 2+ PRs
2. Convention violations agents keep making
3. Recurring CI failure root causes
4. Architecture anti-patterns

Write JSON to \`${outputPath}\`:
\`\`\`json
{
  "lessons": [{
    "pattern": "what agents do wrong",
    "recommendation": "what to do instead",
    "category": "convention|architecture|tooling|anti_pattern|testing|security",
    "severity": "high|medium|low",
    "occurrences": <count>,
    "examples": ["PR #X: description"]
  }]
}
\`\`\`

Rules:
- Only patterns seen 2+ times across different PRs/sessions
- Be specific: include file paths, function names, config keys
- high = causes failures; medium = causes review rejections; low = style
- If no new patterns found, write \`{"lessons": []}\``;
}
