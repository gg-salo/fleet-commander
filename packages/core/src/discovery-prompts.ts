/**
 * Discovery Prompt Generators — generate task prompts for discovery agents
 * that analyze a codebase and produce structured findings.
 */

import type { ProjectConfig } from "./types.js";

export interface DiscoveryPromptConfig {
  projectId: string;
  project: ProjectConfig;
  outputPath: string;
  context?: string;
}

/**
 * Generate a prompt that instructs an agent to audit the UI/UX of a project
 * and produce structured findings.
 */
export function generateUXAuditPrompt(opts: DiscoveryPromptConfig): string {
  const { project, outputPath, context } = opts;
  const contextSection = context
    ? `\n## Focus Area\n\n${context}\n`
    : "";

  return `# Task: UI/UX Audit for ${project.name}

You are a UI/UX audit agent for the **${project.name}** project (repo: \`${project.repo}\`).

Your job is to analyze the codebase's user interface and experience, then produce structured findings.
${contextSection}
## Steps

1. **Understand the project**
   - Read CLAUDE.md, README, and project structure
   - Identify the framework, component library, and styling approach

2. **UX Analysis**
   - Examine page/route components, layouts, and navigation flows
   - Evaluate information architecture and content hierarchy
   - Check form patterns, validation, and feedback
   - Assess error states, loading states, and empty states
   - Review onboarding flow and first-time user experience

3. **UI Analysis**
   - Evaluate visual consistency: spacing, alignment, color usage
   - Check typography hierarchy and readability
   - Review component library usage and consistency
   - Assess responsive breakpoints and mobile experience
   - Check animation/transitions and visual feedback on interactions
   - Evaluate dark mode support (if applicable)

4. **Accessibility**
   - Check for aria labels on interactive elements
   - Evaluate color contrast ratios
   - Assess keyboard navigation and focus management
   - Check screen reader support

5. **Write structured output**
   - Write a JSON file to: \`${outputPath}\`
   - The JSON must match this exact schema:

\`\`\`json
{
  "findings": [
    {
      "id": "1",
      "title": "Short, descriptive title",
      "description": "Detailed description of the issue and suggested fix, including specific files/components.",
      "category": "navigation|forms|error-handling|visual-consistency|typography|responsive|accessibility|loading-states|empty-states|onboarding",
      "priority": "high|medium|low",
      "effort": "small|medium|large"
    }
  ]
}
\`\`\`

## Rules

- **DO NOT modify any code** — only analyze and write the output JSON file
- **DO NOT create branches, PRs, or issues**
- Each finding should be specific and actionable
- Include file paths and component names where relevant
- Prioritize findings by user impact
- Aim for 5–15 findings
`;
}

/**
 * Generate a prompt that instructs an agent to research competitors
 * and identify feature gaps.
 */
export function generateCompetitorResearchPrompt(opts: DiscoveryPromptConfig): string {
  const { project, outputPath, context } = opts;
  const contextSection = context
    ? `\n## Focus Area\n\n${context}\n`
    : "";

  return `# Task: Competitor Research for ${project.name}

You are a competitor research agent for the **${project.name}** project (repo: \`${project.repo}\`).

Your job is to understand the product, research competitors, and identify feature gaps.
${contextSection}
## Steps

1. **Understand the product**
   - Read the project's README, landing page content, and core features
   - Identify what the product does, who it's for, and its key differentiators

2. **Research competitors**
   - Use web search to find 3–5 competitors in the same space
   - For each competitor, identify:
     - Key features and capabilities
     - UX patterns and design approach
     - Pricing model (if visible)
     - Target audience

3. **Identify feature gaps**
   - Compare competitor features against this project
   - Identify what competitors have that this project doesn't
   - Note unique features this project has that competitors lack

4. **Suggest improvements**
   - Propose 5–10 feature ideas ranked by impact and effort
   - Focus on gaps that would provide the most user value

5. **Write structured output**
   - Write a JSON file to: \`${outputPath}\`
   - The JSON must match this exact schema:

\`\`\`json
{
  "findings": [
    {
      "id": "1",
      "title": "Short, descriptive title of the feature gap or suggestion",
      "description": "Detailed description: what competitors do, what's missing, and how to implement it.",
      "category": "feature-gap|ux-pattern|integration|pricing|onboarding|documentation",
      "priority": "high|medium|low",
      "effort": "small|medium|large"
    }
  ]
}
\`\`\`

## Rules

- **DO NOT modify any code** — only research and write the output JSON file
- **DO NOT create branches, PRs, or issues**
- Each finding should be specific and actionable
- Include competitor names and URLs where relevant
- Prioritize by user impact and competitive advantage
- Aim for 5–10 findings
`;
}

/**
 * Generate a prompt that instructs an agent to audit code health:
 * tech debt, security, performance, and quality issues.
 */
export function generateCodeHealthPrompt(opts: DiscoveryPromptConfig): string {
  const { project, outputPath, context } = opts;
  const contextSection = context
    ? `\n## Focus Area\n\n${context}\n`
    : "";

  return `# Task: Code Health Audit for ${project.name}

You are a code health audit agent for the **${project.name}** project (repo: \`${project.repo}\`).

Your job is to analyze the codebase for tech debt, security issues, and quality problems.
${contextSection}
## Steps

1. **Understand the project**
   - Read CLAUDE.md, README, and project structure
   - Identify the tech stack, conventions, and architecture

2. **Security scan**
   - Check for missing error handling around external calls
   - Look for unvalidated inputs (API endpoints, CLI args, file reads)
   - Scan for hardcoded secrets, API keys, or credentials
   - Check for SQL injection, XSS, or command injection risks
   - Review authentication and authorization patterns

3. **Performance check**
   - Identify N+1 queries or unnecessary database calls
   - Look for unnecessary re-renders in React components
   - Check for missing loading/error states that cause poor UX
   - Scan for large bundle imports that could be tree-shaken or lazy-loaded

4. **Code quality**
   - Find dead code, unused exports, or duplicated logic
   - Identify inconsistent patterns across the codebase
   - Check TypeScript strictness (any types, unsafe casts)
   - Look for missing or incomplete error boundaries

5. **Testing & CI**
   - Identify test coverage gaps (untested critical paths)
   - Check for missing CI checks (linting, type checking, formatting)
   - Review dependency freshness (outdated or vulnerable packages)

6. **Write structured output**
   - Write a JSON file to: \`${outputPath}\`
   - The JSON must match this exact schema:

\`\`\`json
{
  "findings": [
    {
      "id": "1",
      "title": "Short, descriptive title",
      "description": "Detailed description of the issue, where it is, why it matters, and how to fix it.",
      "category": "security|performance|error-handling|tech-debt|testing|dependencies|type-safety",
      "priority": "high|medium|low",
      "effort": "small|medium|large"
    }
  ]
}
\`\`\`

## Rules

- **DO NOT modify any code** — only audit and write the output JSON file
- **DO NOT create branches, PRs, or issues**
- Each finding should be specific with file paths and line numbers where possible
- Prioritize security issues highest, then correctness, then performance
- Aim for 5–15 findings
`;
}
