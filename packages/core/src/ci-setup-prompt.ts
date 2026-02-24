/**
 * CI Setup Prompt Generator — generates a task prompt for an agent
 * that analyzes a codebase and sets up CI + baseline tests.
 */

import type { ProjectConfig } from "./types.js";

export interface CISetupPromptConfig {
  projectId: string;
  project: ProjectConfig;
}

/**
 * Generate a prompt that instructs an agent to analyze the codebase,
 * create a GitHub Actions CI workflow, write baseline tests, and open a PR.
 */
export function generateCISetupPrompt(opts: CISetupPromptConfig): string {
  const { projectId, project } = opts;

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

## Guidelines

- **Do NOT modify existing source code** — only add CI config and test files
- **Respect existing conventions** — match the project's code style, directory structure, and tooling
- **Keep CI simple** — avoid complex matrix builds, Docker, or multi-stage workflows unless clearly needed
- **Run tests locally** before committing to make sure they pass
- **Use the project's package manager** — don't switch from pnpm to npm, etc.
- **Project ID**: \`${projectId}\`
`;
}
