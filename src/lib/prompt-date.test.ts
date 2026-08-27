import { describe, it, expect } from "vitest";
import { formatRuDate, staleBefore, todayBlock } from "./prompt-date";
import { buildPortfolioAnalyzePrompt } from "@/server/prompts/portfolio-analyze";
import { buildPortfolioAnalyzeCommPrompt } from "@/server/prompts/portfolio-analyze-comm";

const DAY = new Date(2026, 7, 24); // 24 августа 2026

describe("formatRuDate", () => {
  it("пишет дату по-русски, месяц словом", () => {
    expect(formatRuDate(DAY)).toBe("24 августа 2026 года");
  });

  it("не теряет однозначное число", () => {
    expect(formatRuDate(new Date(2026, 0, 1))).toBe("1 января 2026 года");
  });
});

describe("staleBefore", () => {
  it("отсчитывает границу от текущего года, а не от вписанной вручную", () => {
    expect(staleBefore(DAY)).toBe(2021);
    expect(staleBefore(new Date(2030, 0, 1))).toBe(2025);
  });

  it("для коммуникационного дизайна порог длиннее", () => {
    expect(staleBefore(DAY, 7)).toBe(2019);
  });
});

describe("todayBlock", () => {
  it("называет дату и запрещает считать прошедшее будущим", () => {
    const out = todayBlock(DAY);
    expect(out).toContain("24 августа 2026 года");
    expect(out).toMatch(/НЕ является будущей/);
  });
});

// Ради этого всё и затевалось: на живом прогоне модель записала кандидату
// red flag «кейс опубликован будущей датой (7 августа 2025)», хотя шёл 2026-й.
describe("промпты разбора портфолио", () => {
  it("продуктовый промпт сообщает сегодняшнюю дату", () => {
    const p = buildPortfolioAnalyzePrompt("текст", undefined, DAY);
    expect(p).toContain("24 августа 2026 года");
  });

  it("коммуникационный промпт сообщает сегодняшнюю дату", () => {
    const p = buildPortfolioAnalyzeCommPrompt("текст", undefined, DAY);
    expect(p).toContain("24 августа 2026 года");
  });

  it("порог несвежести считается, а не вписан числом", () => {
    const p = buildPortfolioAnalyzePrompt("текст", undefined, DAY);
    expect(p).toContain("2021");
    expect(p).not.toContain("2018-2020");
  });

  it("порог едет вместе с годом", () => {
    const p = buildPortfolioAnalyzePrompt("текст", undefined, new Date(2031, 0, 1));
    expect(p).toContain("2026");
  });

  it("без явной даты промпт всё равно её содержит", () => {
    const p = buildPortfolioAnalyzePrompt("текст");
    expect(p).toContain(String(new Date().getFullYear()));
  });
});
