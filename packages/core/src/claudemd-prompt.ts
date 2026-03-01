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

3. **Identify modification patterns**
   - How are existing functions extended? (e.g., adding optional params vs creating new functions)
   - Where do shared utilities live? (e.g., utils/, lib/, helpers/)
   - Are there barrel/index exports? How are new modules registered?
   - How are new API routes, components, or pages added following existing patterns?
   - What is the pattern for adding new features end-to-end (type → service → route → UI)?

4. **Identify anti-patterns**
   - Scan for existing code duplication — note it as tech debt, do NOT replicate it
   - Find guard clause and validation patterns — new code must follow the same style
   - Identify singleton/shared state patterns — where global state lives and how it's accessed
   - Look for known "traps": deprecated APIs still in use, fragile patterns, implicit ordering dependencies

5. **Identify the tech stack**
   - Database, ORM, migrations
   - Authentication/authorization approach
   - API patterns (REST, GraphQL, tRPC)
   - State management
   - Styling (Tailwind, CSS Modules, styled-components)
   - Build tools and bundlers

6. **Generate CLAUDE.md** covering:
   - **What this is**: Brief project description (what it does, who it's for)
   - **Tech stack**: Framework, language, runtime, key dependencies
   - **Directory structure**: Overview of the source layout
   - **Key files to read first**: The 3-5 most important files for understanding the codebase
   - **Code conventions**: Naming, imports, file organization, patterns to follow
   - **Commands**: Build, test, lint, dev server, format — the exact commands from package.json/Makefile
   - **How to extend this codebase**: Concrete patterns for adding features. For each major extension point (e.g., new API route, new component, new service), show which existing file to use as a template and what steps to follow. Example: "To add a new API route, follow the pattern in \`app/api/bar/route.ts\`."
   - **Anti-patterns (do NOT do these)**: Explicit don'ts with examples from the codebase. If a function already exists for something, say "do NOT copy \`functionName\`, extend it with optional params." List any patterns that look tempting but are wrong.
   - **Shared utilities and helpers**: List reusable modules, functions, and hooks that agents should use instead of reinventing. Include the import path and a one-line description for each.
   - **Common mistakes to avoid**: Based on the conventions (e.g., missing .js extensions in ESM)
   - **Architecture decisions**: Key design choices and their rationale

7. **Write the file and open a PR**
   - Write \`CLAUDE.md\` to the project root
   - Commit with message: "chore: add CLAUDE.md for AI agent guidance"
   - Open a PR on branch \`chore/add-claude-md\` targeting \`${project.defaultBranch}\`

## Rules

- **DO NOT modify any existing files** — only create CLAUDE.md
- Keep it concise but comprehensive — aim for 100-250 lines
- Use concrete examples from the actual codebase, not generic advice
- Include the actual commands from package.json scripts
- Do not include information you're unsure about — only document what you can verify
`;
}
