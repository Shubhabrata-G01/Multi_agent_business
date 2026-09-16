import { describe, expect, it } from "vitest";
import { diffLines, summarizeDiff } from "./diff";

describe("diffLines (STEP 5 item 4)", () => {
  it("marks identical text as entirely unchanged", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines.every((l) => l.type === "unchanged")).toBe(true);
    expect(summarizeDiff(lines)).toEqual({ added: 0, removed: 0, unchanged: 3 });
  });

  it("detects an added line", () => {
    const lines = diffLines("a\nb", "a\nb\nc");
    expect(summarizeDiff(lines)).toEqual({ added: 1, removed: 0, unchanged: 2 });
    expect(lines.at(-1)).toEqual({ type: "added", text: "c" });
  });

  it("detects a removed line", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    expect(summarizeDiff(lines)).toEqual({ added: 0, removed: 1, unchanged: 2 });
  });

  it("detects a changed line as a remove+add pair", () => {
    const lines = diffLines("hello world", "hello there");
    const summary = summarizeDiff(lines);
    expect(summary.removed).toBeGreaterThan(0);
    expect(summary.added).toBeGreaterThan(0);
  });

  it("handles empty strings", () => {
    expect(summarizeDiff(diffLines("", ""))).toEqual({ added: 0, removed: 0, unchanged: 1 });
    expect(summarizeDiff(diffLines("", "a")).added).toBeGreaterThan(0);
  });
});
