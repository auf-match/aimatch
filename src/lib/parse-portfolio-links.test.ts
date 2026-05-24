import { describe, it, expect } from "vitest";
import { parsePortfolioLinks } from "./parse-portfolio-links";

describe("parsePortfolioLinks", () => {
  it("возвращает пустой массив для пустого ввода", () => {
    expect(parsePortfolioLinks([])).toEqual([]);
  });

  it("отсеивает пустые строки и строки только из пробелов", () => {
    expect(parsePortfolioLinks(["", "  ", "\t"])).toEqual([]);
  });

  it("принимает валидные http/https URL", () => {
    const result = parsePortfolioLinks(["https://notion.so/portfolio"]);
    expect(result).toEqual(["https://notion.so/portfolio"]);
  });

  it("отсеивает невалидные URL", () => {
    expect(parsePortfolioLinks(["not-a-url", "ftp://old.com", "javascript:alert(1)"])).toEqual([]);
  });

  it("дедуплицирует одинаковые ссылки", () => {
    const result = parsePortfolioLinks([
      "https://example.com/portfolio",
      "https://example.com/portfolio",
    ]);
    expect(result).toHaveLength(1);
  });

  it("нормализует trailing slash — считает их одной ссылкой", () => {
    const result = parsePortfolioLinks([
      "https://example.com/portfolio",
      "https://example.com/portfolio/",
    ]);
    expect(result).toHaveLength(1);
  });

  it("нормализует регистр домена — считает их одной ссылкой", () => {
    const result = parsePortfolioLinks([
      "https://Example.COM/portfolio",
      "https://example.com/portfolio",
    ]);
    expect(result).toHaveLength(1);
  });

  it("сохраняет регистр path (не нормализует)", () => {
    const result = parsePortfolioLinks([
      "https://example.com/Portfolio",
      "https://example.com/portfolio",
    ]);
    // Path регистр-чувствителен — это разные ссылки
    expect(result).toHaveLength(2);
  });

  it("обрезает пробелы вокруг ссылок", () => {
    const result = parsePortfolioLinks(["  https://example.com/portfolio  "]);
    expect(result).toEqual(["https://example.com/portfolio"]);
  });

  it("обрабатывает смесь валидных и невалидных", () => {
    const result = parsePortfolioLinks([
      "https://notion.so/abc",
      "",
      "not-a-url",
      "https://behance.net/portfolio",
    ]);
    expect(result).toEqual(["https://notion.so/abc", "https://behance.net/portfolio"]);
  });

  it("нормализует root URL с trailing slash и без", () => {
    // https://example.com и https://example.com/ — одна и та же ссылка
    const result = parsePortfolioLinks(["https://example.com", "https://example.com/"]);
    expect(result).toHaveLength(1);
  });
});
