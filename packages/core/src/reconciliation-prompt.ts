/**
 * Reconciliation Prompt Generator — generates a prompt for an agent
 * that analyzes all PRs from a plan and checks for cross-PR consistency.
 */

import type { ProjectConfig, PlanTask } from "./types.js";

export interface ReconciliationPromptConfig {
  projectId: string;
  project: ProjectConfig;
  planDescription: string;
  tasks: PlanTask[];
  outputPath: string;
}

/**
 * Generate a prompt that instructs an agent to analyze all PRs from a plan,
 * check for cross-PR consistency issues, and suggest a merge order.
 */
export function generateReconciliationPrompt(opts: ReconciliationPromptConfig): string {
  const { project, tasks, planDescription, outputPath } = opts;

  const prList = tasks
    .filter((t) => t.issueNumber)
    .map((t) => `- Task "${t.title}" → PR linked to issue #${t.issueNumber}${t.sessionId ? ` (session: ${t.sessionId})` : ""}`)
    .join("\n");

  const constraintsSummary = tasks
    .filter((t) => t.constraints && t.constraints.length > 0)
    .map(
      (t) =>
        `### Task "${t.title}"\n${t.constraints!.map((c) => `- ${c}`).join("\n")}`,
    )
    .join("\n\n");

  return `# Task: Cross-PR Reconciliation for ${project.name}

You are a reconciliation agent for the **${project.name}** project (repo: \`${project.repo}\`).

Your job is to analyze all PRs created by a parallel plan execution, check for consistency issues, and suggest an optimal merge order.

## Plan Context

${planDescription}

## PRs to Analyze

${prList}

${constraintsSummary ? `## Task Constraints (from planning agent)\n\n${constraintsSummary}\n` : ""}

## Steps

1. **Fetch all PR diffs**
   For each PR linked to the plan, run:
   \`\`\`bash
   gh pr diff <PR_NUMBER> --repo ${project.repo}
   \`\`\`
   Also read each PR description:
   \`\`\`bash
   gh pr view <PR_NUMBER> --repo ${project.repo}
   \`\`\`

2. **Check for duplicated code**
   - Compare functions, utilities, and types added across PRs
   - Flag if two PRs introduce similar helper functions or utilities that should be shared
   - Check if any PR copies code that another PR already added

3. **Check for conflicts**
   - Identify files modified by multiple PRs
   - For overlapping files, analyze whether changes conflict or are compatible
   - Check for import conflicts (same name, different implementation)
   - Check for type definition conflicts

4. **Check for inconsistencies**
   - Verify all PRs follow the same patterns (naming, error handling, etc.)
   - Check if PRs make contradictory architectural choices
   - Verify constraint compliance across PRs (from the planning agent)

5. **Determine merge order**
   - Based on dependencies between tasks
   - Based on conflict analysis (merge the base changes first)
   - Based on risk (merge low-risk PRs first)

6. **Write structured output**
   Write a JSON file to: \`${outputPath}\`

\`\`\`json
{
  "findings": [
    {
      "id": "1",
      "type": "duplication",
      "title": "Duplicate utility function",
      "description": "PR #10 and PR #12 both add a formatDate() function...",
      "affectedPRs": [10, 12],
      "severity": "warning",
      "suggestedAction": "Keep PR #10's version and update PR #12 to import from it"
    }
  ],
  "suggestedMergeOrder": [10, 11, 12, 13]
}
\`\`\`

## Rules

- **DO NOT modify any code** — this is a read-only analysis
- **DO NOT merge any PRs** — only analyze and recommend
- **DO NOT create branches or PRs** — only write the output JSON
- **Be specific** — reference exact file paths, function names, and PR numbers
- **Focus on actionable findings** — skip trivial style differences
- **Finding types**: "duplication" (same code in multiple PRs), "conflict" (incompatible changes), "inconsistency" (different patterns/approaches), "merge-order" (dependency or ordering concern)
- **Severity levels**: "blocking" (must fix before merge), "warning" (should fix but not blocking), "info" (nice to know)
`;
}
