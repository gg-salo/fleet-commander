/**
 * Retrospective Prompt — generates analysis prompt for failed sessions.
 *
 * Asks a lightweight agent to analyze:
 * - Session event timeline
 * - Last terminal output
 * - Root cause and category
 */

import type { OrchestratorEvent, Session } from "./types.js";

export interface RetrospectivePromptConfig {
  session: Session;
  events: OrchestratorEvent[];
  terminalOutput: string;
}

const MAX_TERMINAL_CHARS = 3000;

/**
 * Generate a retrospective analysis prompt for a failed session.
 */
export function generateRetrospectivePrompt(
  config: RetrospectivePromptConfig,
): string {
  const { session, events, terminalOutput } = config;

  const truncatedOutput =
    terminalOutput.length > MAX_TERMINAL_CHARS
      ? terminalOutput.slice(-MAX_TERMINAL_CHARS)
      : terminalOutput;

  const eventTimeline = events
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map(
      (e) =>
        `- [${e.timestamp.toISOString()}] ${e.type}: ${e.message}`,
    )
    .join("\n");

  const durationMin = Math.round(
    (Date.now() - session.createdAt.getTime()) / 60_000,
  );

  return `# Session Retrospective Analysis

You are analyzing a failed agent session to identify the root cause.

## Session Info
- **Session ID**: ${session.id}
- **Project**: ${session.projectId}
- **Branch**: ${session.branch ?? "unknown"}
- **Status**: ${session.status}
- **Duration**: ${durationMin} minutes
- **Issue**: ${session.issueId ?? "none"}

## Event Timeline
${eventTimeline || "No events recorded."}

## Last Terminal Output
\`\`\`
${truncatedOutput || "No output captured."}
\`\`\`

## Task

Analyze this session and write a JSON file with the following structure:

\`\`\`json
{
  "failureReason": "One-sentence description of what went wrong",
  "category": "one of: vague_issue | wrong_approach | tooling_problem | upstream_conflict | timeout | permission_error | unknown",
  "recommendation": "What should be done differently next time",
  "confidence": "high | medium | low"
}
\`\`\`

Write this JSON to \`retrospective-output.json\` in the current directory.

Categories explained:
- **vague_issue**: The issue description was too ambiguous for the agent to implement
- **wrong_approach**: The agent took a fundamentally wrong approach to the problem
- **tooling_problem**: Build tools, dependencies, or environment issues blocked progress
- **upstream_conflict**: Merge conflicts or incompatible changes from other branches
- **timeout**: The agent ran out of time or got stuck in a loop
- **permission_error**: Permission or authentication issues prevented progress
- **unknown**: Cannot determine the root cause

Be concise. Focus on the root cause, not symptoms.`;
}
