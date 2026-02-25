/**
 * Planning Prompt Generator — generates a task prompt for an agent
 * that analyzes a codebase and produces a structured task breakdown.
 */

import type { ProjectConfig } from "./types.js";

export interface PlanningPromptConfig {
  projectId: string;
  project: ProjectConfig;
  featureDescription: string;
  outputPath: string;
}

/**
 * Generate a prompt that instructs an agent to analyze the codebase
 * and produce a structured task breakdown for a feature description.
 */
export function generatePlanningPrompt(opts: PlanningPromptConfig): string {
  const { projectId, project, featureDescription, outputPath } = opts;

  return `# Task: Plan Feature Implementation for ${project.name}

You are a planning agent for the **${project.name}** project (repo: \`${project.repo}\`).

Your job is to analyze the codebase and break a feature request into well-scoped, agent-ready tasks.

## Feature Description

${featureDescription}

## Steps

1. **Analyze the codebase** (read-only — do NOT modify any files except the output)
   - Read CLAUDE.md, README, and key configuration files
   - Understand the project structure, tech stack, and conventions
   - Identify existing patterns relevant to this feature
   - Find the specific files and modules that will need changes

2. **Break the feature into 3–6 tasks**
   - Each task should be completable by a single coding agent session
   - Tasks should be small or medium scope — if a task is too large, split it further
   - Map dependencies between tasks (which must finish before others can start)
   - Order tasks so independent ones can run in parallel

3. **Write structured output**
   - Write a JSON file to: \`${outputPath}\`
   - The JSON must match this exact schema:

\`\`\`json
{
  "tasks": [
    {
      "id": "1",
      "title": "Short, action-oriented title",
      "description": "Detailed description of what needs to be done, including specific files to modify and patterns to follow.",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ],
      "scope": "small",
      "dependencies": []
    },
    {
      "id": "2",
      "title": "Another task that depends on task 1",
      "description": "...",
      "acceptanceCriteria": ["..."],
      "scope": "medium",
      "dependencies": ["1"]
    }
  ]
}
\`\`\`

## Rules

- **DO NOT implement any code** — only analyze and plan
- **DO NOT create branches, PRs, or issues** — only write the output JSON file
- **DO NOT modify any existing files** — only create the output JSON
- **Each task title** should be concise and action-oriented (e.g. "Add user authentication middleware")
- **Each task description** should include: what to do, which files to modify, which patterns to follow
- **Acceptance criteria** should be specific and testable
- **Scope** must be "small" (< 100 lines changed) or "medium" (100-300 lines changed)
- **Dependencies** reference task IDs that must complete first (empty array if independent)
- **Project ID**: \`${projectId}\`
- **Default branch**: \`${project.defaultBranch}\`
`;
}
