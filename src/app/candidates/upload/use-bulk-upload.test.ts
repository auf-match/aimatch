import { describe, it, expect } from "vitest";
import { isRowValid } from "./use-bulk-upload";

describe("isRowValid", () => {
  it("returns false for an empty row (no file, no url)", () => {
    expect(isRowValid({ url: "", status: "idle" })).toBe(false);
  });

  it("returns false for a whitespace-only url and no file", () => {
    expect(isRowValid({ url: "   ", status: "idle" })).toBe(false);
  });

  it("returns true for a row with a file and no url", () => {
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    expect(isRowValid({ url: "", file, status: "idle" })).toBe(true);
  });

  it("returns true for a row with a url and no file", () => {
    expect(isRowValid({ url: "https://example.com", status: "idle" })).toBe(true);
  });

  it("returns true for a row with both a file and a url", () => {
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    expect(isRowValid({ url: "https://example.com", file, status: "idle" })).toBe(true);
  });
});
