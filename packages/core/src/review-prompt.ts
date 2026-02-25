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
${issueSection}${agentRulesSection}
4. **Review against checklist**

   For each changed file, evaluate:

   - **Requirements**: Do the changes fulfill the PR description and any linked issue?
   - **Code quality**: Is the code clean, readable, and well-structured?
   - **Security**: Are there any injection risks, hardcoded secrets, unsafe operations, or OWASP top 10 issues?
   - **Testing**: Are new features tested? Are edge cases covered? Do existing tests still pass?
   - **Conventions**: Does the code follow project conventions (naming, formatting, patterns)?
   - **Error handling**: Are errors handled appropriately? Are edge cases considered?
   - **Performance**: Are there obvious performance issues (N+1 queries, unnecessary allocations)?

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
