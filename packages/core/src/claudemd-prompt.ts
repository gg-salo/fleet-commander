/**
 * CLAUDE.md Generator Prompt — generates a prompt for an agent
 * that reads the codebase and creates a comprehensive CLAUDE.md file.
 */

import type { ProjectConfig } from "./types.js";

export interface ClaudeMdPromptConfig {
  projectId: string;
  project: ProjectConfig;
}

/**
 * Generate a prompt that instructs an agent to analyze the codebase
 * and produce a high-quality CLAUDE.md file, then open a PR.
 */
export function generateClaudeMdPrompt(opts: ClaudeMdPromptConfig): string {
  const { project } = opts;

  return `# Task: Generate CLAUDE.md for ${project.name}

You are a setup agent for the **${project.name}** project (repo: \`${project.repo}\`).

Your job is to deeply analyze the codebase and generate a comprehensive \`CLAUDE.md\` file that helps AI coding agents work effectively in this project.

## Steps

1. **Analyze the codebase**
   - Read all configuration files: tsconfig, eslint, prettier, package.json, Makefile, etc.
   - Understand the directory structure and file organization patterns
   - Identify the framework, language version, and package manager
   - Read key source files to understand conventions

2. **Identify conventions**
   - Naming patterns: files, functions, variables, types, components
   - Import style: relative vs absolute, extensions, node: prefix
   - Code organization: module structure, barrel exports, co-located tests
   - Component patterns: hooks, state management, styling approach
   - Error handling patterns
   - Test patterns: framework, file naming, setup patterns

3. **Identify the tech stack**
   - Database, ORM, migrations
   - Authentication/authorization approach
   - API patterns (REST, GraphQL, tRPC)
   - State management
   - Styling (Tailwind, CSS Modules, styled-components)
   - Build tools and bundlers

4. **Generate CLAUDE.md** covering:
   - **What this is**: Brief project description (what it does, who it's for)
   - **Tech stack**: Framework, language, runtime, key dependencies
   - **Directory structure**: Overview of the source layout
   - **Key files to read first**: The 3-5 most important files for understanding the codebase
   - **Code conventions**: Naming, imports, file organization, patterns to follow
   - **Commands**: Build, test, lint, dev server, format — the exact commands from package.json/Makefile
   - **Common mistakes to avoid**: Based on the conventions (e.g., missing .js extensions in ESM)
   - **Architecture decisions**: Key design choices and their rationale

5. **Write the file and open a PR**
   - Write \`CLAUDE.md\` to the project root
   - Commit with message: "chore: add CLAUDE.md for AI agent guidance"
   - Open a PR on branch \`chore/add-claude-md\` targeting \`${project.defaultBranch}\`

## Rules

- **DO NOT modify any existing files** — only create CLAUDE.md
- Keep it concise but comprehensive — aim for 80-200 lines
- Use concrete examples from the actual codebase, not generic advice
- Include the actual commands from package.json scripts
- Do not include information you're unsure about — only document what you can verify
`;
}
