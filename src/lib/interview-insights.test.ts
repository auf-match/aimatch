import { describe, it, expect } from "vitest";
import {
  mergeInsights,
  sortForDisplay,
  countForBadge,
  emptyInsights,
  normalizeText,
  INSIGHT_CATEGORIES,
  type InsightItem,
  type AiSuggestions,
} from "./interview-insights";

const now = new Date("2026-07-01T12:00:00Z");

describe("normalizeText", () => {
  it("trims and lowercases", () => {
    expect(normalizeText("  Hello World  ")).toBe("hello world");
  });
});

describe("emptyInsights", () => {
  it("returns object with all 4 empty arrays", () => {
    const e = emptyInsights();
    expect(Object.keys(e).sort()).toEqual([...INSIGHT_CATEGORIES].sort());
    for (const k of INSIGHT_CATEGORIES) expect(e[k]).toEqual([]);
  });
});

describe("mergeInsights", () => {
  const src = "src-interview-1";

  it("adds new items when current is empty", () => {
    const suggestions: AiSuggestions = {
      leadFocusAreas: ["Продуктовое мышление"],
      leadQuestions: [],
      candidateTips: ["Готовьте примеры с метриками"],
      prescreeningQuestions: [],
    };
    const result = mergeInsights(emptyInsights(), suggestions, src, now);
    expect(result.leadFocusAreas).toHaveLength(1);
    expect(result.leadFocusAreas[0]).toMatchObject({
      text: "Продуктовое мышление",
      important: false,
      hidden: false,
      origin: "ai",
      sourceInterviewId: src,
    });
    expect(result.leadFocusAreas[0].id).toBeTruthy();
    expect(result.candidateTips).toHaveLength(1);
  });

  it("dedupes by normalized text — existing item stays untouched", () => {
    const existing: InsightItem = {
      id: "old-1",
      text: "Продуктовое Мышление",
      important: true,
      hidden: false,
      origin: "manual",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), leadFocusAreas: [existing] };
    const suggestions: AiSuggestions = {
      leadFocusAreas: ["  продуктовое мышление  "],
      leadQuestions: [], candidateTips: [], prescreeningQuestions: [],
    };
    const result = mergeInsights(current, suggestions, src, now);
    expect(result.leadFocusAreas).toHaveLength(1);
    expect(result.leadFocusAreas[0]).toEqual(existing);
  });

  it("preserves items in other categories", () => {
    const kept: InsightItem = {
      id: "keep-1", text: "Уточнить зарплатные ожидания",
      important: false, hidden: false, origin: "manual",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), prescreeningQuestions: [kept] };
    const result = mergeInsights(
      current,
      { leadFocusAreas: ["X"], leadQuestions: [], candidateTips: [], prescreeningQuestions: [] },
      src, now,
    );
    expect(result.prescreeningQuestions).toEqual([kept]);
    expect(result.leadFocusAreas).toHaveLength(1);
  });

  it("adds several new items and preserves hidden existing", () => {
    const hidden: InsightItem = {
      id: "h-1", text: "Старая тема",
      important: false, hidden: true, origin: "ai", sourceInterviewId: "old-src",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), leadQuestions: [hidden] };
    const result = mergeInsights(
      current,
      { leadFocusAreas: [], leadQuestions: ["Новая тема", "Другая"], candidateTips: [], prescreeningQuestions: [] },
      src, now,
    );
    expect(result.leadQuestions).toHaveLength(3);
    expect(result.leadQuestions[0]).toEqual(hidden);
    expect(result.leadQuestions.slice(1).map((i) => i.text)).toEqual(["Новая тема", "Другая"]);
  });

  it("dedupes when AI suggests same text as an existing hidden item", () => {
    const hidden: InsightItem = {
      id: "h-1", text: "Уже отклонённая тема",
      important: false, hidden: true, origin: "ai",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), candidateTips: [hidden] };
    const result = mergeInsights(
      current,
      { leadFocusAreas: [], leadQuestions: [], candidateTips: ["УЖЕ ОТКЛОНЁННАЯ ТЕМА"], prescreeningQuestions: [] },
      src, now,
    );
    expect(result.candidateTips).toHaveLength(1);
    expect(result.candidateTips[0]).toEqual(hidden);
  });
});

describe("sortForDisplay", () => {
  const mk = (id: string, important: boolean, hidden: boolean, ts: string): InsightItem => ({
    id, text: id, important, hidden, origin: "ai", createdAt: ts,
  });

  it("splits by hidden and sorts visible by important-first then createdAt desc", () => {
    const items = [
      mk("a", false, false, "2026-06-01T00:00:00Z"),
      mk("b", true,  false, "2026-06-02T00:00:00Z"),
      mk("c", false, false, "2026-06-03T00:00:00Z"),
      mk("d", true,  false, "2026-06-01T00:00:00Z"),
      mk("h", false, true,  "2026-06-05T00:00:00Z"),
    ];
    const { visible, hidden } = sortForDisplay(items);
    expect(visible.map((i) => i.id)).toEqual(["b", "d", "c", "a"]);
    expect(hidden.map((i) => i.id)).toEqual(["h"]);
  });
});

describe("countForBadge", () => {
  it("counts totals, hidden, important", () => {
    const items: InsightItem[] = [
      { id: "1", text: "x", important: true,  hidden: false, origin: "ai",     createdAt: "" },
      { id: "2", text: "x", important: false, hidden: true,  origin: "ai",     createdAt: "" },
      { id: "3", text: "x", important: true,  hidden: true,  origin: "manual", createdAt: "" },
      { id: "4", text: "x", important: false, hidden: false, origin: "manual", createdAt: "" },
    ];
    expect(countForBadge(items)).toEqual({ total: 4, hidden: 2, important: 2 });
  });
});
