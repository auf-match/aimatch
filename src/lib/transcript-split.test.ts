import { describe, it, expect } from "vitest";
import {
  splitTranscriptLines,
  numberTranscript,
  applySplitRanges,
  applyDetectedSegments,
} from "./transcript-split";

const TRANSCRIPT = ["раз", "два", "три", "четыре", "пять"].join("\n");

describe("splitTranscriptLines", () => {
  it("splits on \\n", () => {
    expect(splitTranscriptLines(TRANSCRIPT)).toEqual([
      "раз",
      "два",
      "три",
      "четыре",
      "пять",
    ]);
  });
  it("normalizes CRLF", () => {
    expect(splitTranscriptLines("a\r\nb")).toEqual(["a", "b"]);
  });
  it("keeps blank lines so numbering matches what the model saw", () => {
    expect(splitTranscriptLines("a\n\nb")).toEqual(["a", "", "b"]);
  });

  // Настоящая расшифровка 43-минутного звонка пришла семью строками, последняя
  // на 100 000 символов: границу между позициями поставить было негде.
  it("breaks up an oversized line so ranges can address inside it", () => {
    const blob =
      "[Спикер 1] " + "а".repeat(900) + " [Спикер 2] " + "б".repeat(900);
    const lines = splitTranscriptLines(blob);
    expect(lines.length).toBeGreaterThan(4);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(400);
  });

  it("splits an oversized line at speaker turns", () => {
    const blob = "[Спикер 1] " + "раз ".repeat(150) + "[Спикер 2] Ответ.";
    const lines = splitTranscriptLines(blob);
    expect(lines[lines.length - 1]).toBe("[Спикер 2] Ответ.");
  });

  it("packs sentences instead of cutting mid-sentence", () => {
    const blob = ("Короткое предложение. ").repeat(60);
    const lines = splitTranscriptLines(blob);
    expect(lines.every((l) => l.length <= 400)).toBe(true);
    expect(lines.every((l) => l.trim().endsWith("."))).toBe(true);
  });

  it("splits by words when a single sentence has no punctuation at all", () => {
    const blob = "слово ".repeat(400);
    const lines = splitTranscriptLines(blob);
    expect(lines.every((l) => l.length <= 400)).toBe(true);
    expect(lines.join(" ").replace(/\s+/g, " ").trim()).toBe(blob.trim());
  });

  it("leaves short lines untouched", () => {
    expect(splitTranscriptLines("[Спикер 1] Да.\n[Спикер 2] Нет.")).toEqual([
      "[Спикер 1] Да.",
      "[Спикер 2] Нет.",
    ]);
  });
  it("returns empty array for empty input", () => {
    expect(splitTranscriptLines("")).toEqual([]);
    expect(splitTranscriptLines("   ")).toEqual([]);
  });
});

describe("numberTranscript", () => {
  it("numbers lines from 1", () => {
    expect(numberTranscript("a\nb")).toBe("1| a\n2| b");
  });
});

describe("applySplitRanges", () => {
  const ids = ["vac-a", "vac-b"];

  it("slices one range per vacancy", () => {
    const out = applySplitRanges(
      TRANSCRIPT,
      [
        { vacancyId: "vac-a", fromLine: 1, toLine: 2 },
        { vacancyId: "vac-b", fromLine: 3, toLine: 5 },
      ],
      ids,
    );
    expect(out).toEqual([
      { vacancyId: "vac-a", text: "раз\nдва", lineCount: 2 },
      { vacancyId: "vac-b", text: "три\nчетыре\nпять", lineCount: 3 },
    ]);
  });

  it("merges several ranges of the same vacancy — the call may come back to it", () => {
    const out = applySplitRanges(
      TRANSCRIPT,
      [
        { vacancyId: "vac-a", fromLine: 1, toLine: 1 },
        { vacancyId: "vac-b", fromLine: 2, toLine: 3 },
        { vacancyId: "vac-a", fromLine: 4, toLine: 5 },
      ],
      ids,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      vacancyId: "vac-a",
      text: "раз\n\nчетыре\nпять",
      lineCount: 3,
    });
  });

  it("drops ranges pointing at a vacancy that was not selected", () => {
    const out = applySplitRanges(
      TRANSCRIPT,
      [
        { vacancyId: "vac-a", fromLine: 1, toLine: 2 },
        { vacancyId: "vac-ghost", fromLine: 3, toLine: 5 },
      ],
      ids,
    );
    expect(out.map((s) => s.vacancyId)).toEqual(["vac-a"]);
  });

  it("clamps out-of-bounds line numbers instead of throwing", () => {
    const out = applySplitRanges(
      TRANSCRIPT,
      [{ vacancyId: "vac-a", fromLine: 0, toLine: 999 }],
      ids,
    );
    expect(out[0].text).toBe(TRANSCRIPT);
  });

  it("accepts numeric strings", () => {
    const out = applySplitRanges(
      TRANSCRIPT,
      [{ vacancyId: "vac-a", fromLine: "2", toLine: "3" }],
      ids,
    );
    expect(out[0].text).toBe("два\nтри");
  });

  it("skips inverted and malformed ranges", () => {
    const out = applySplitRanges(
      TRANSCRIPT,
      [
        { vacancyId: "vac-a", fromLine: 4, toLine: 2 },
        { vacancyId: "vac-a", fromLine: "abc", toLine: 3 },
        null,
        "junk",
        { fromLine: 1, toLine: 2 },
        { vacancyId: "vac-b", fromLine: 1, toLine: 1 },
      ],
      ids,
    );
    expect(out).toEqual([{ vacancyId: "vac-b", text: "раз", lineCount: 1 }]);
  });

  it("skips a range that slices only blank lines", () => {
    const out = applySplitRanges("a\n\n\nb", [
      { vacancyId: "vac-a", fromLine: 2, toLine: 3 },
    ], ids);
    expect(out).toEqual([]);
  });

  it("returns empty array when input is not an array", () => {
    expect(applySplitRanges(TRANSCRIPT, null, ids)).toEqual([]);
    expect(applySplitRanges(TRANSCRIPT, { a: 1 }, ids)).toEqual([]);
  });

  it("returns empty array for an empty transcript", () => {
    expect(
      applySplitRanges("", [{ vacancyId: "vac-a", fromLine: 1, toLine: 2 }], ids),
    ).toEqual([]);
  });

  it("preserves order of first appearance", () => {
    const out = applySplitRanges(
      TRANSCRIPT,
      [
        { vacancyId: "vac-b", fromLine: 4, toLine: 5 },
        { vacancyId: "vac-a", fromLine: 1, toLine: 2 },
      ],
      ids,
    );
    expect(out.map((s) => s.vacancyId)).toEqual(["vac-b", "vac-a"]);
  });
});

describe("applyDetectedSegments", () => {
  it("groups by label when vacancies do not exist yet", () => {
    const out = applyDetectedSegments(TRANSCRIPT, [
      { label: "Дизайнер в Х5", fromLine: 1, toLine: 2 },
      { label: "Арт-директор Ростикс", fromLine: 3, toLine: 5 },
    ]);
    expect(out).toEqual([
      { label: "Дизайнер в Х5", text: "раз\nдва", lineCount: 2 },
      { label: "Арт-директор Ростикс", text: "три\nчетыре\nпять", lineCount: 3 },
    ]);
  });

  it("merges ranges sharing a label — the call came back to that position", () => {
    const out = applyDetectedSegments(TRANSCRIPT, [
      { label: "Первая", fromLine: 1, toLine: 1 },
      { label: "Вторая", fromLine: 2, toLine: 3 },
      { label: "Первая", fromLine: 5, toLine: 5 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ label: "Первая", text: "раз\n\nпять", lineCount: 2 });
  });

  it("trims labels and drops entries without one", () => {
    const out = applyDetectedSegments(TRANSCRIPT, [
      { label: "  Позиция  ", fromLine: 1, toLine: 1 },
      { label: "   ", fromLine: 2, toLine: 2 },
      { fromLine: 3, toLine: 3 },
      { label: 42, fromLine: 4, toLine: 4 },
    ]);
    expect(out).toEqual([{ label: "Позиция", text: "раз", lineCount: 1 }]);
  });

  it("returns empty array on malformed input", () => {
    expect(applyDetectedSegments(TRANSCRIPT, null)).toEqual([]);
    expect(applyDetectedSegments("", [{ label: "a", fromLine: 1, toLine: 1 }])).toEqual([]);
  });

  it("clamps out-of-bounds ranges", () => {
    const out = applyDetectedSegments(TRANSCRIPT, [
      { label: "Одна", fromLine: -5, toLine: 999 },
    ]);
    expect(out[0].text).toBe(TRANSCRIPT);
  });
});
