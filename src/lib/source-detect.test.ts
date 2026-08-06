import { describe, it, expect } from "vitest";
import { detectSourceFromUrl, sourceLabel, normalizeSourceList } from "./source-detect";

describe("detectSourceFromUrl", () => {
  it("узнаёт известные площадки по хосту", () => {
    expect(detectSourceFromUrl("https://behance.net/john")).toBe("Behance");
    expect(detectSourceFromUrl("https://www.behance.net/john")).toBe("Behance");
    expect(detectSourceFromUrl("https://dribbble.com/john")).toBe("Dribbble");
    expect(detectSourceFromUrl("https://john.notion.site/portfolio")).toBe("Notion");
    expect(detectSourceFromUrl("https://www.figma.com/@john")).toBe("Figma");
    expect(detectSourceFromUrl("https://linkedin.com/in/john")).toBe("LinkedIn");
    expect(detectSourceFromUrl("https://read.cv/john")).toBe("Read.cv");
    expect(detectSourceFromUrl("https://t.me/john")).toBe("Telegram");
  });

  it("неизвестный сайт → «Личный сайт»", () => {
    expect(detectSourceFromUrl("https://john-design.com/work")).toBe("Личный сайт");
    expect(detectSourceFromUrl("https://portfolio.me")).toBe("Личный сайт");
  });

  it("битый URL → «Другое»", () => {
    expect(detectSourceFromUrl("not a url")).toBe("Другое");
    expect(detectSourceFromUrl("")).toBe("Другое");
  });

  it("не путает поддомены-обманки", () => {
    // notbehance.net НЕ должен матчить behance.net
    expect(detectSourceFromUrl("https://notbehance.net/x")).toBe("Личный сайт");
  });
});

describe("sourceLabel", () => {
  it("нормализует legacy-значения", () => {
    expect(sourceLabel("behance")).toBe("Behance");
    expect(sourceLabel("huntflow")).toBe("Huntflow");
  });
  it("кастомные значения оставляет как есть", () => {
    expect(sourceLabel("Реферал от Пети")).toBe("Реферал от Пети");
  });
  it("пусто → «—»", () => {
    expect(sourceLabel(null)).toBe("—");
    expect(sourceLabel("")).toBe("—");
    expect(sourceLabel("   ")).toBe("—");
  });
});

describe("normalizeSourceList", () => {
  it("дедуплицирует case-insensitive и сортирует", () => {
    const out = normalizeSourceList(["behance", "Behance", "huntflow", null, "  ", "Реферал"]);
    expect(out).toContain("Behance");
    expect(out).toContain("Huntflow");
    expect(out).toContain("Реферал");
    // "behance" и "Behance" схлопнулись в один
    expect(out.filter((s) => s.toLowerCase() === "behance")).toHaveLength(1);
  });
});
