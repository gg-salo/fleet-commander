import { describe, it, expect } from "vitest";
import { extractLastToolActivity } from "../index.js";

describe("extractLastToolActivity", () => {
  it("returns null for empty lines", () => {
    expect(extractLastToolActivity([])).toBeNull();
  });

  it("returns null when no tool_use entries exist", () => {
    const lines = [
      { type: "user", message: { content: "hello", role: "user" } },
      { type: "assistant", message: { content: "hi", role: "assistant" } },
    ];
    expect(extractLastToolActivity(lines)).toBeNull();
  });

  it("extracts Read tool activity with shortened path", () => {
    const lines = [
      { type: "tool_use", tool_name: "Read", tool_input: { file_path: "/Users/dev/project/src/lib/types.ts" } },
    ];
    expect(extractLastToolActivity(lines)).toBe("Reading lib/types.ts");
  });

  it("extracts Edit tool activity", () => {
    const lines = [
      { type: "tool_use", tool_name: "Edit", tool_input: { file_path: "/Users/dev/project/src/index.ts" } },
    ];
    expect(extractLastToolActivity(lines)).toBe("Editing src/index.ts");
  });

  it("extracts Write tool activity", () => {
    const lines = [
      { type: "tool_use", tool_name: "Write", tool_input: { file_path: "/Users/dev/project/new-file.ts" } },
    ];
    expect(extractLastToolActivity(lines)).toBe("Writing project/new-file.ts");
  });

  it("extracts Bash tool activity with first command word", () => {
    const lines = [
      { type: "tool_use", tool_name: "Bash", tool_input: { command: "pnpm test --run" } },
    ];
    expect(extractLastToolActivity(lines)).toBe("Running pnpm");
  });

  it("extracts Grep/Glob as searching", () => {
    const lines = [
      { type: "tool_use", tool_name: "Grep", tool_input: { pattern: "foo" } },
    ];
    expect(extractLastToolActivity(lines)).toBe("Searching codebase");
  });

  it("returns last tool_use entry when multiple exist", () => {
    const lines = [
      { type: "tool_use", tool_name: "Read", tool_input: { file_path: "/a/b/old.ts" } },
      { type: "assistant", message: { content: "found it" } },
      { type: "tool_use", tool_name: "Edit", tool_input: { file_path: "/a/b/new.ts" } },
    ];
    expect(extractLastToolActivity(lines)).toBe("Editing b/new.ts");
  });

  it("handles tool_use with missing tool_input gracefully", () => {
    const lines = [
      { type: "tool_use", tool_name: "Read" },
    ];
    expect(extractLastToolActivity(lines)).toBe("Reading file");
  });

  it("handles unknown tool names", () => {
    const lines = [
      { type: "tool_use", tool_name: "CustomTool", tool_input: {} },
    ];
    expect(extractLastToolActivity(lines)).toBe("Using CustomTool");
  });
});
