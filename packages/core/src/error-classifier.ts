/**
 * Error Classifier — categorize CI failures by check name pattern
 * and provide actionable recommendations.
 */

export type ErrorCategory =
  | "lint"
  | "typecheck"
  | "test"
  | "build"
  | "security"
  | "format"
  | "unknown";

export interface ErrorClassification {
  category: ErrorCategory;
  recommendation: string;
  /** Priority order: 1=build, 2=types, 3=lint/format, 4=test, 5=security */
  priority: number;
}

const PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  // Build
  { pattern: /\b(build|compile|webpack|vite|esbuild|rollup|turbopack|next.*build)\b/i, category: "build" },
  // Typecheck
  { pattern: /\b(tsc|typescript|typecheck|type.?check|types)\b/i, category: "typecheck" },
  // Lint
  { pattern: /\b(eslint|biome|oxlint|lint|stylelint|clippy|pylint|flake8|ruff)\b/i, category: "lint" },
  // Format
  { pattern: /\b(prettier|format|fmt|dprint|black|rustfmt)\b/i, category: "format" },
  // Test
  { pattern: /\b(test|jest|vitest|mocha|pytest|spec|coverage|e2e|playwright|cypress)\b/i, category: "test" },
  // Security
  { pattern: /\b(security|snyk|dependabot|codeql|audit|vulnerability|trivy|semgrep|ossf)\b/i, category: "security" },
];

const RECOMMENDATIONS: Record<ErrorCategory, string> = {
  build: "Fix compilation errors first — nothing else can pass until the build succeeds.",
  typecheck: "Fix type errors. Run `pnpm typecheck` locally to see all errors.",
  lint: "Fix linting issues. Run the linter with auto-fix if available.",
  format: "Fix formatting. Run the formatter (e.g. `pnpm format`) to auto-fix.",
  test: "Fix failing tests. Run the test suite locally and check the failure output.",
  security: "Review and address security findings. Update vulnerable dependencies if applicable.",
  unknown: "Investigate the failing check and address the root cause.",
};

const PRIORITIES: Record<ErrorCategory, number> = {
  build: 1,
  typecheck: 2,
  lint: 3,
  format: 3,
  test: 4,
  security: 5,
  unknown: 6,
};

/** Classify a single CI check by name. */
export function classifyError(checkName: string): ErrorClassification {
  for (const { pattern, category } of PATTERNS) {
    if (pattern.test(checkName)) {
      return {
        category,
        recommendation: RECOMMENDATIONS[category],
        priority: PRIORITIES[category],
      };
    }
  }
  return {
    category: "unknown",
    recommendation: RECOMMENDATIONS.unknown,
    priority: PRIORITIES.unknown,
  };
}

/** Group and classify multiple CI checks by category. */
export function classifyAndGroupErrors(
  checks: Array<{ name: string; url?: string }>,
): Map<ErrorCategory, Array<{ name: string; url?: string; recommendation: string }>> {
  const groups = new Map<
    ErrorCategory,
    Array<{ name: string; url?: string; recommendation: string }>
  >();

  for (const check of checks) {
    const classification = classifyError(check.name);
    const group = groups.get(classification.category) ?? [];
    group.push({
      name: check.name,
      url: check.url,
      recommendation: classification.recommendation,
    });
    groups.set(classification.category, group);
  }

  return groups;
}

/** Format classified errors as structured markdown, sorted by priority. */
export function formatClassifiedErrors(
  checks: Array<{ name: string; url?: string }>,
): string {
  const groups = classifyAndGroupErrors(checks);

  // Sort categories by priority
  const sortedCategories = [...groups.entries()].sort((a, b) => {
    return PRIORITIES[a[0]] - PRIORITIES[b[0]];
  });

  const sections: string[] = [];

  for (const [category, items] of sortedCategories) {
    const lines: string[] = [];
    lines.push(`### ${category.toUpperCase()}`);
    for (const item of items) {
      const link = item.url ? ` — [View](${item.url})` : "";
      lines.push(`  - ${item.name} (FAILURE)${link}`);
    }
    lines.push(`**Action**: ${items[0].recommendation}`);
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
