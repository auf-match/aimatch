import { describe, it, expect } from "vitest";
import { activeHref } from "./sidebar-active";

// Реальный состав сайдбара: навигация и быстрые действия вперемешку —
// именно так функция и должна их получать.
const HREFS = [
  "/",
  "/candidates",
  "/vacancies",
  "/pipeline",
  "/candidates/analyze-status",
  "/candidates/upload",
  "/vacancies/new",
];

describe("activeHref", () => {
  it("подсвечивает пункт, на котором стоим", () => {
    expect(activeHref(HREFS, "/candidates")).toBe("/candidates");
    expect(activeHref(HREFS, "/vacancies")).toBe("/vacancies");
    expect(activeHref(HREFS, "/pipeline")).toBe("/pipeline");
  });

  // Из-за этого и завели функцию: раньше на странице загрузки горели
  // и «Кандидаты», и «Новый кандидат».
  it("на быстром действии не подсвечивает раздел над ним", () => {
    expect(activeHref(HREFS, "/candidates/upload")).toBe("/candidates/upload");
    expect(activeHref(HREFS, "/vacancies/new")).toBe("/vacancies/new");
  });

  it("побеждает самое длинное совпадение", () => {
    expect(activeHref(HREFS, "/candidates/analyze-status")).toBe(
      "/candidates/analyze-status",
    );
  });

  it("на вложенной странице подсвечивает раздел", () => {
    expect(activeHref(HREFS, "/candidates/abc123")).toBe("/candidates");
    expect(activeHref(HREFS, "/vacancies/xyz789")).toBe("/vacancies");
  });

  it("корень совпадает только сам с собой", () => {
    expect(activeHref(HREFS, "/")).toBe("/");
    // иначе «Дашборд» горел бы на каждой странице
    expect(activeHref(HREFS, "/candidates")).not.toBe("/");
  });

  // /vacancies не должен подсвечиваться на /vacancies-archive:
  // startsWith по строке этого не отличает, нужна граница сегмента.
  it("не считает совпадением похожее начало пути", () => {
    expect(activeHref(HREFS, "/vacancies-archive")).toBe(null);
    expect(activeHref(HREFS, "/candidates-old")).toBe(null);
  });

  it("возвращает null для неизвестного адреса", () => {
    expect(activeHref(HREFS, "/prototype/vacancy-new")).toBe(null);
    expect(activeHref(HREFS, "/settings")).toBe(null);
  });

  it("подсвечивает не больше одного пункта за раз", () => {
    for (const path of [
      "/",
      "/candidates",
      "/candidates/upload",
      "/candidates/analyze-status",
      "/candidates/abc",
      "/vacancies",
      "/vacancies/new",
      "/pipeline",
    ]) {
      const hit = activeHref(HREFS, path);
      const matched = HREFS.filter((h) => activeHref(HREFS, path) === h);
      expect(matched.length, `${path} → ${hit}`).toBeLessThanOrEqual(1);
    }
  });
});
