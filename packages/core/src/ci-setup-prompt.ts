/**
 * CI Setup Prompt Generator — generates a task prompt for an agent
 * that analyzes a codebase and sets up CI + baseline tests.
 *
 * When historical lessons and retrospectives are available, they are
 * injected so the CI setup targets the specific failure patterns
 * observed in this project.
 */

import type { Lesson, ProjectConfig, RetrospectiveRecord } from "./types.js";

export interface CISetupPromptConfig {
  projectId: string;
  project: ProjectConfig;
  /** Learned lessons from plan retrospectives (optional — may not exist yet). */
  lessons?: Lesson[];
  /** Retrospective records from failed sessions (optional). */
  retrospectives?: RetrospectiveRecord[];
}

/**
 * Generate a prompt that instructs an agent to analyze the codebase,
 * create a GitHub Actions CI workflow, write baseline tests, and open a PR.
 */
export function generateCISetupPrompt(opts: CISetupPromptConfig): string {
  const { projectId, project, lessons, retrospectives } = opts;

  // Build a CI-focused section from learned patterns
  let learnedSection = "";
  const ciInsights: string[] = [];

  if (lessons && lessons.length > 0) {
    const tooling = lessons.filter((l) => l.category === "tooling" || l.category === "testing");
    const antiPatterns = lessons.filter((l) => l.category === "anti_pattern" || l.category === "convention");

    if (tooling.length > 0) {
      ciInsights.push("**Tooling/testing patterns to address in CI:**");
      for (const l of tooling) {
        ciInsights.push(`- ${l.pattern} → ${l.recommendation} (seen ${l.occurrences}x, ${l.severity})`);
      }
    }

    if (antiPatterns.length > 0) {
      ciInsights.push("**Code quality patterns to catch in CI:**");
      for (const l of antiPatterns.slice(0, 5)) {
        ciInsights.push(`- ${l.pattern} (${l.severity}) — consider a lint rule or CI check to prevent this`);
      }
    }
  }

  if (retrospectives && retrospectives.length > 0) {
    // Group by category, surface tooling-related failures
    const counts = new Map<string, { count: number; sample: string }>();
    for (const r of retrospectives) {
      const existing = counts.get(r.category);
      if (existing) {
        existing.count++;
      } else {
        counts.set(r.category, { count: 1, sample: r.recommendation });
      }
    }

    const toolingFailures = counts.get("tooling_problem");
    if (toolingFailures && toolingFailures.count >= 2) {
      ciInsights.push(
        `**Recurring tooling failures (${toolingFailures.count}x):** ${toolingFailures.sample}`,
      );
    }

    const wrongApproach = counts.get("wrong_approach");
    if (wrongApproach && wrongApproach.count >= 2) {
      ciInsights.push(
        `**Recurring wrong-approach failures (${wrongApproach.count}x):** ${wrongApproach.sample} — consider adding a CI check to catch this early`,
      );
    }
  }

  if (ciInsights.length > 0) {
    learnedSection = `
## Learned Patterns from Agent History

The following patterns were identified from real agent sessions on this project.
Use them to inform which CI checks and lint rules to prioritize.

${ciInsights.join("\n")}

When designing CI steps, ensure the workflow catches these specific patterns.
For example, if agents repeatedly fail a lint check, make sure that check runs
early in the pipeline. If a tooling problem keeps recurring, add a setup step
that explicitly addresses it.
`;
  }

  return `# Task: Set Up CI for ${project.name}

You are setting up Continuous Integration for the **${project.name}** project (repo: \`${project.repo}\`).

## Steps

1. **Analyze the codebase**
   - Detect the tech stack (language, framework, package manager, build system)
   - Check for existing tests, linters, formatters, and CI configuration
   - Identify the key modules and entry points

2. **Create \`.github/workflows/ci.yml\`**
   - Trigger on \`push\` and \`pull_request\` to \`${project.defaultBranch}\`
   - Include steps for: install dependencies, lint, typecheck (if applicable), build, test
   - Use caching for dependencies (npm/pnpm/yarn cache, pip cache, etc.)
   - Keep it simple — one job is fine unless the project clearly needs matrix builds

3. **Write baseline tests**
   - Add tests for 3–5 core modules (pick the most important/stable ones)
   - Use the project's existing test framework if one is configured
   - If no test framework exists, choose the standard one for the stack (e.g. vitest for TS/JS, pytest for Python, go test for Go)
   - Tests should verify basic functionality — imports work, key functions return expected types, critical paths don't throw
   - Install any needed test dependencies

4. **Open a PR**
   - Branch: \`chore/setup-ci\`
   - Title: "ci: add CI workflow and baseline tests"
   - Description: summarize what CI checks were added and which modules have tests
${learnedSection}
## Guidelines

- **Do NOT modify existing source code** — only add CI config and test files
- **Respect existing conventions** — match the project's code style, directory structure, and tooling
- **Keep CI simple** — avoid complex matrix builds, Docker, or multi-stage workflows unless clearly needed
- **Run tests locally** before committing to make sure they pass
- **Use the project's package manager** — don't switch from pnpm to npm, etc.
- **Project ID**: \`${projectId}\`
`;
}
