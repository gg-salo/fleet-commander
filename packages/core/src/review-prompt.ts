/**
 * Review Prompt Generator — generates a task prompt for an agent
 * that reviews a PR against project conventions, requirements, and security.
 */

import type { ProjectConfig } from "./types.js";

export interface ReviewPromptConfig {
  projectId: string;
  project: ProjectConfig;
  prNumber: number;
  prUrl: string;
  prBranch: string;
  baseBranch: string;
  repo: string;
  issueId?: string;
  codingSessionId: string;
  /** Architectural constraints from the planning agent (included in the issue body) */
  taskConstraints?: string[];
  /** Files the planning agent expected to be modified */
  taskAffectedFiles?: string[];
}

/**
 * Generate a prompt that instructs an agent to review a PR,
 * check it against project conventions and requirements,
 * and post a structured GitHub review.
 */
export function generateReviewPrompt(opts: ReviewPromptConfig): string {
  const {
    projectId,
    project,
    prNumber,
    prUrl,
    prBranch,
    baseBranch,
    repo,
    issueId,
    codingSessionId,
    taskConstraints,
    taskAffectedFiles,
  } = opts;

  const issueSection = issueId
    ? `
## Issue Context

This PR is linked to issue **${issueId}**. Fetch the issue details:

\`\`\`bash
gh issue view ${issueId} --repo ${repo}
\`\`\`

Verify that the PR addresses the requirements described in the issue.
`
    : "";

  const agentRulesSection = project.agentRules
    ? `
## Project-Specific Rules

The following project rules must be checked during review:

${project.agentRules}
`
    : "";

  const constraintsSection =
    taskConstraints && taskConstraints.length > 0
      ? `
## Task Constraints

The planning agent defined these constraints for this task. Verify each one:

${taskConstraints.map((c) => `- ${c}`).join("\n")}
`
      : "";

  const affectedFilesSection =
    taskAffectedFiles && taskAffectedFiles.length > 0
      ? `
## Expected Affected Files

The planning agent expected these files to be modified:

${taskAffectedFiles.map((f) => `- \`${f}\``).join("\n")}

Check if the PR modifies unexpected files or misses expected ones.
`
      : "";

  return `# Task: Review PR #${prNumber} for ${project.name}

You are a code review agent for the **${project.name}** project (repo: \`${repo}\`).

Your job is to review PR #${prNumber} and post a structured GitHub review.

- **PR URL**: ${prUrl}
- **PR branch**: \`${prBranch}\`
- **Base branch**: \`${baseBranch}\`
- **Coding session**: \`${codingSessionId}\`
- **Project ID**: \`${projectId}\`

## Steps

1. **Read the PR diff**
   \`\`\`bash
   gh pr diff ${prNumber} --repo ${repo}
   \`\`\`

2. **Read the PR description**
   \`\`\`bash
   gh pr view ${prNumber} --repo ${repo}
   \`\`\`

3. **Check codebase context**
   - Read CLAUDE.md, README, and relevant configuration files
   - Understand the project's conventions, patterns, and architecture
   - Look at surrounding code to understand the context of changes
${issueSection}${agentRulesSection}${constraintsSection}${affectedFilesSection}
4. **Review against checklist**

   For each changed file, evaluate:

   - **Requirements**: Do the changes fulfill the PR description and any linked issue?
   - **Code quality**: Is the code clean, readable, and well-structured?
   - **Security**: Are there any injection risks, hardcoded secrets, unsafe operations, or OWASP top 10 issues?
   - **Testing**: Are new features tested? Are edge cases covered? Do existing tests still pass?
   - **Conventions**: Does the code follow project conventions (naming, formatting, patterns)?
   - **Error handling**: Are errors handled appropriately? Are edge cases considered?
   - **Performance**: Are there obvious performance issues (N+1 queries, unnecessary allocations)?
   - **Code duplication**: Search the codebase for functions similar to those added. If the PR copies existing logic instead of extending it, request changes.
   - **CLAUDE.md adherence**: Read the project's CLAUDE.md (if it exists). Verify all changes follow documented conventions and anti-patterns.
   - **Constraint compliance**: If the PR is linked to a task with constraints (in the issue body or listed above), verify each constraint is satisfied.

5. **Post your review**

   If the PR meets all criteria:
   \`\`\`bash
   gh pr review ${prNumber} --repo ${repo} --approve --body "LGTM. <brief summary of what was reviewed>"
   \`\`\`

   If changes are needed:
   \`\`\`bash
   gh pr review ${prNumber} --repo ${repo} --request-changes --body "<structured feedback>"
   \`\`\`

   When requesting changes, structure your feedback as:
   - **Summary**: One-line overview of the main issue(s)
   - **Issues**: Numbered list of specific problems with file paths and line references
   - **Suggestions**: Concrete suggestions for how to fix each issue

## Rules

- **Do NOT modify any code** — you are a reviewer, not a coder
- **Do NOT push any commits** — review only
- **Do NOT create branches or PRs** — review only
- **Be specific** — reference exact file paths and line numbers
- **Be constructive** — explain why something is an issue, not just that it is
- **Approve if acceptable** — do not block PRs for minor style preferences if the project has no explicit convention
- **Focus on substance** — security issues, bugs, and missing tests are blockers; minor style nits are not
`;
}

// =============================================================================
// Batch Review Prompt — richer context for reviewing PRs in a batch
// =============================================================================

export interface BatchReviewPromptConfig {
  projectId: string;
  project: ProjectConfig;
  prNumber: number;
  prUrl: string;
  prBranch: string;
  baseBranch: string;
  repo: string;
  /** Full CLAUDE.md content inlined at prompt generation time */
  claudeMdContent?: string | null;
  /** Summaries of sibling PRs in the same batch */
  siblingPRs?: Array<{ number: number; title: string; branch: string; diffStat: string }>;
  /** Task constraints from planning agent */
  taskConstraints?: string[];
  /** Expected affected files from planning agent */
  taskAffectedFiles?: string[];
}

/**
 * Generate an enhanced review prompt for batch PR reviews.
 * Adds 4 layers of context on top of the base review:
 * 1. Inlined CLAUDE.md content
 * 2. Sibling PR summaries (cross-PR duplication detection)
 * 3. Quality rubric
 * 4. Constraint compliance
 */
export function generateBatchReviewPrompt(opts: BatchReviewPromptConfig): string {
  const {
    project,
    prNumber,
    prUrl,
    prBranch,
    baseBranch,
    repo,
    claudeMdContent,
    siblingPRs,
    taskConstraints,
    taskAffectedFiles,
  } = opts;

  const claudeMdSection = claudeMdContent
    ? `
## Project Conventions (from CLAUDE.md)

The reviewer MUST check all changes against these conventions:

${claudeMdContent}
`
    : "";

  const siblingSection =
    siblingPRs && siblingPRs.length > 0
      ? `
## Other PRs in this batch (check for duplication/conflicts)

${siblingPRs.map((s) => `- PR #${s.number} "${s.title}" (branch: \`${s.branch}\`) — modifies: ${s.diffStat}`).join("\n")}

If any code in this PR duplicates functionality from another PR, flag it.
`
      : "";

  const constraintsSection =
    taskConstraints && taskConstraints.length > 0
      ? `
## Task Constraints

The planning agent defined these constraints. Verify each one:

${taskConstraints.map((c) => `- ${c}`).join("\n")}
`
      : "";

  const affectedFilesSection =
    taskAffectedFiles && taskAffectedFiles.length > 0
      ? `
## Expected Affected Files

${taskAffectedFiles.map((f) => `- \`${f}\``).join("\n")}

Check if the PR modifies unexpected files or misses expected ones.
`
      : "";

  return `# Task: Review PR #${prNumber} for ${project.name}

You are a code review agent for the **${project.name}** project (repo: \`${repo}\`).

Your job is to review PR #${prNumber} and post a structured GitHub review.

- **PR URL**: ${prUrl}
- **PR branch**: \`${prBranch}\`
- **Base branch**: \`${baseBranch}\`
${claudeMdSection}${siblingSection}
## Steps

1. **Read the PR diff**
   \`\`\`bash
   gh pr diff ${prNumber} --repo ${repo}
   \`\`\`

2. **Read the PR description**
   \`\`\`bash
   gh pr view ${prNumber} --repo ${repo}
   \`\`\`

3. **Check codebase context**
   - Read relevant configuration files and surrounding code
   - Understand the context of changes
${constraintsSection}${affectedFilesSection}
## Quality Rubric (evaluate each)

1. **Duplication** — Does this PR copy existing functions/utilities instead of importing them? Check shared helpers.
2. **Convention adherence** — Does every file follow the project conventions${claudeMdContent ? " listed above" : " (check CLAUDE.md if it exists)"}? Check naming, imports, error handling.
3. **Scope discipline** — Does this PR only modify files relevant to its task? Flag unexpected files.
4. **Test coverage** — Are new code paths tested? Are edge cases covered?
5. **Integration safety** — Could this PR break other PRs in the batch? Check shared files.

Post APPROVE only if all 5 criteria pass. Post REQUEST_CHANGES with specific items referencing the rubric.

4. **Post your review**

   If the PR meets all criteria:
   \`\`\`bash
   gh pr review ${prNumber} --repo ${repo} --approve --body "LGTM. <brief summary of what was reviewed>"
   \`\`\`

   If changes are needed:
   \`\`\`bash
   gh pr review ${prNumber} --repo ${repo} --request-changes --body "<structured feedback>"
   \`\`\`

   When requesting changes, structure your feedback as:
   - **Summary**: One-line overview of the main issue(s)
   - **Rubric Failures**: Which rubric criteria failed and why
   - **Issues**: Numbered list of specific problems with file paths and line references
   - **Suggestions**: Concrete suggestions for how to fix each issue

## Rules

- **Do NOT modify any code** — you are a reviewer, not a coder
- **Do NOT push any commits** — review only
- **Do NOT create branches or PRs** — review only
- **Be specific** — reference exact file paths and line numbers
- **Be constructive** — explain why something is an issue, not just that it is
- **Approve if acceptable** — do not block PRs for minor style preferences if the project has no explicit convention
- **Focus on substance** — security issues, bugs, and missing tests are blockers; minor style nits are not
`;
}
