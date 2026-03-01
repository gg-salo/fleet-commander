import { describe, it, expect } from "vitest";
import {
  classifyError,
  classifyAndGroupErrors,
  formatClassifiedErrors,
} from "../error-classifier.js";

describe("classifyError", () => {
  it("classifies build checks", () => {
    expect(classifyError("Build").category).toBe("build");
    expect(classifyError("next-build").category).toBe("build");
    expect(classifyError("webpack-compile").category).toBe("build");
    expect(classifyError("vite build").category).toBe("build");
  });

  it("classifies typecheck checks", () => {
    expect(classifyError("tsc").category).toBe("typecheck");
    expect(classifyError("TypeScript").category).toBe("typecheck");
    expect(classifyError("typecheck").category).toBe("typecheck");
    expect(classifyError("type-check").category).toBe("typecheck");
  });

  it("classifies lint checks", () => {
    expect(classifyError("ESLint").category).toBe("lint");
    expect(classifyError("biome lint").category).toBe("lint");
    expect(classifyError("lint").category).toBe("lint");
    expect(classifyError("stylelint").category).toBe("lint");
  });

  it("classifies format checks", () => {
    expect(classifyError("Prettier").category).toBe("format");
    expect(classifyError("format-check").category).toBe("format");
    expect(classifyError("fmt").category).toBe("format");
  });

  it("classifies test checks", () => {
    expect(classifyError("vitest").category).toBe("test");
    expect(classifyError("Jest").category).toBe("test");
    expect(classifyError("unit-test").category).toBe("test");
    expect(classifyError("e2e").category).toBe("test");
    expect(classifyError("playwright").category).toBe("test");
  });

  it("classifies security checks", () => {
    expect(classifyError("CodeQL").category).toBe("security");
    expect(classifyError("snyk").category).toBe("security");
    expect(classifyError("security-scan").category).toBe("security");
    expect(classifyError("dependabot").category).toBe("security");
  });

  it("classifies unknown checks", () => {
    expect(classifyError("deploy-preview").category).toBe("unknown");
    expect(classifyError("custom-action-xyz").category).toBe("unknown");
  });

  it("returns recommendations", () => {
    const result = classifyError("ESLint");
    expect(result.recommendation).toContain("linting");
  });

  it("returns priority", () => {
    const build = classifyError("Build");
    const test = classifyError("vitest");
    expect(build.priority).toBeLessThan(test.priority);
  });
});

describe("classifyAndGroupErrors", () => {
  it("groups checks by category", () => {
    const checks = [
      { name: "ESLint", url: "https://ci/1" },
      { name: "Build", url: "https://ci/2" },
      { name: "Prettier" },
      { name: "vitest" },
    ];

    const groups = classifyAndGroupErrors(checks);
    expect(groups.get("lint")).toHaveLength(1);
    expect(groups.get("build")).toHaveLength(1);
    expect(groups.get("format")).toHaveLength(1);
    expect(groups.get("test")).toHaveLength(1);
  });

  it("groups multiple checks in same category", () => {
    const checks = [
      { name: "ESLint" },
      { name: "biome lint" },
    ];

    const groups = classifyAndGroupErrors(checks);
    expect(groups.get("lint")).toHaveLength(2);
  });
});

describe("formatClassifiedErrors", () => {
  it("produces structured markdown with priority ordering", () => {
    const checks = [
      { name: "vitest", url: "https://ci/test" },
      { name: "Build", url: "https://ci/build" },
      { name: "ESLint" },
    ];

    const result = formatClassifiedErrors(checks);

    // Build should appear before lint/test (priority 1 vs 3 vs 4)
    const buildIdx = result.indexOf("### BUILD");
    const lintIdx = result.indexOf("### LINT");
    const testIdx = result.indexOf("### TEST");
    expect(buildIdx).toBeLessThan(lintIdx);
    expect(lintIdx).toBeLessThan(testIdx);
    expect(result).toContain("FAILURE");
    expect(result).toContain("**Action**:");
  });

  it("includes URLs when available", () => {
    const checks = [{ name: "Build", url: "https://ci/build" }];
    const result = formatClassifiedErrors(checks);
    expect(result).toContain("[View](https://ci/build)");
  });

  it("handles empty input", () => {
    const result = formatClassifiedErrors([]);
    expect(result).toBe("");
  });
});
