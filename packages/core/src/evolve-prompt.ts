/**
 * Evolve Prompt — generates prompt for CLAUDE.md evolution agent.
 *
 * Feeds the agent:
 * - Current CLAUDE.md content
 * - Learned lessons (by severity)
 * - Recent failure patterns from retrospectives
 */

import type { Lesson, RetrospectiveRecord } from "./types.js";

export interface EvolvePromptConfig {
  projectId: string;
  claudeMdContent: string | undefined;
  lessons: Lesson[];
  retrospectives: RetrospectiveRecord[];
  branch: string;
}

export function generateEvolvePrompt(config: EvolvePromptConfig): string {
  const { projectId, claudeMdContent, lessons, retrospectives, branch } = config;

  // Group lessons by severity
  const high = lessons.filter((l) => l.severity === "high");
  const medium = lessons.filter((l) => l.severity === "medium");
  const low = lessons.filter((l) => l.severity === "low");

  const formatLesson = (l: Lesson): string =>
    `- ${l.pattern} → ${l.recommendation} (seen ${l.occurrences}x) [${l.category}]`;

  const highSection = high.length > 0
    ? `HIGH:\n${high.map(formatLesson).join("\n")}`
    : "HIGH: none";
  const mediumSection = medium.length > 0
    ? `MEDIUM:\n${medium.map(formatLesson).join("\n")}`
    : "MEDIUM: none";
  const lowSection = low.length > 0
    ? `LOW:\n${low.map(formatLesson).join("\n")}`
    : "LOW: none";

  // Group retrospectives by category
  const retroCounts = new Map<string, { count: number; sample: string }>();
  for (const r of retrospectives) {
    const existing = retroCounts.get(r.category);
    if (existing) {
      existing.count++;
    } else {
      retroCounts.set(r.category, { count: 1, sample: r.recommendation });
    }
  }

  const retroSection = retroCounts.size > 0
    ? [...retroCounts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([cat, { count, sample }]) => `- ${cat}: ${count} sessions — ${sample}`)
        .join("\n")
    : "No recent failure patterns.";

  return `# Evolve Project Conventions

Update CLAUDE.md based on patterns learned from ${lessons.length} agent sessions for project "${projectId}".

## Current CLAUDE.md
${claudeMdContent ?? "No CLAUDE.md exists yet — create one from scratch."}

## Learned Lessons (by severity)
${highSection}

${mediumSection}

${lowSection}

## Recent Failure Patterns
${retroSection}

## Rules
1. ONLY add/modify sections backed by lessons with 2+ occurrences
2. Keep ALL existing content unless a lesson directly contradicts it
3. Anti-patterns → add to "Common Mistakes to Avoid" section
4. Conventions → add to conventions section
5. Tooling → suggest CI config changes (lint rules, pre-commit hooks)
6. PR description must cite which lessons motivated each change

## Output
1. Write updated CLAUDE.md
2. Commit on branch \`${branch}\`
3. Open a PR with description listing each change with its evidence (lesson pattern + occurrence count)`;
}
