import { describe, it, expect, beforeEach } from "vitest";
import {
  markStarted,
  markFinished,
  getProcessing,
} from "./analysis-tracker";

// Трекер — модульный синглтон в globalThis. Между тестами чистим,
// снимая всё, что осталось от предыдущего кейса.
beforeEach(() => {
  for (const e of getProcessing()) markFinished(e.id);
});

describe("analysis-tracker", () => {
  it("starts empty", () => {
    expect(getProcessing()).toEqual([]);
  });

  it("tracks a started candidate", () => {
    markStarted({ id: "a", name: "Иван", portfolioLink: "https://behance.net/ivan", startedAt: 1000 });
    const snap = getProcessing();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ id: "a", name: "Иван", portfolioLink: "https://behance.net/ivan" });
  });

  it("removes a finished candidate", () => {
    markStarted({ id: "a", name: "Иван", portfolioLink: "x", startedAt: 1000 });
    markFinished("a");
    expect(getProcessing()).toEqual([]);
  });

  it("markFinished on unknown id does not throw", () => {
    expect(() => markFinished("nope")).not.toThrow();
  });

  it("double markStarted with same id does not duplicate", () => {
    markStarted({ id: "a", name: "Иван", portfolioLink: "x", startedAt: 1000 });
    markStarted({ id: "a", name: "Иван 2", portfolioLink: "y", startedAt: 2000 });
    const snap = getProcessing();
    expect(snap).toHaveLength(1);
    expect(snap[0].name).toBe("Иван 2"); // перезапись
  });

  it("snapshot is sorted by startedAt ascending", () => {
    markStarted({ id: "b", name: "B", portfolioLink: "x", startedAt: 3000 });
    markStarted({ id: "a", name: "A", portfolioLink: "x", startedAt: 1000 });
    markStarted({ id: "c", name: "C", portfolioLink: "x", startedAt: 2000 });
    expect(getProcessing().map((e) => e.id)).toEqual(["a", "c", "b"]);
  });
});
