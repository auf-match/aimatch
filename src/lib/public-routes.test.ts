import { describe, it, expect } from "vitest";
import { isPublicRoute, isChromelessRoute } from "./public-routes";

describe("isPublicRoute", () => {
  it("открывает публичную форму и всё под ней", () => {
    expect(isPublicRoute("/p/portfolio")).toBe(true);
    expect(isPublicRoute("/p/portfolio/result")).toBe(true);
    expect(isPublicRoute("/p")).toBe(true);
  });

  it("не открывает внутренние страницы", () => {
    for (const path of [
      "/",
      "/candidates",
      "/vacancies",
      "/pipeline",
      "/candidates/upload",
      "/api/vacancies",
      "/api/candidates/analyze-batch",
    ]) {
      expect(isPublicRoute(path), path).toBe(false);
    }
  });

  // Самая дорогая ошибка: адрес, лишь похожий на публичный, пускают без пароля.
  it("не ведётся на похожие адреса", () => {
    for (const path of [
      "/pipeline",       // начинается на /p
      "/private",
      "/prototype/public-portfolio",
      "/candidates/p/1",
      "/api/p/portfolio",
    ]) {
      expect(isPublicRoute(path), path).toBe(false);
    }
  });

  it("не зависит от хвостового слэша", () => {
    expect(isPublicRoute("/p/portfolio/")).toBe(true);
    expect(isPublicRoute("/candidates/")).toBe(false);
  });

  it("переживает пустой путь", () => {
    expect(isPublicRoute("")).toBe(false);
    expect(isPublicRoute("/")).toBe(false);
  });
});

describe("isChromelessRoute", () => {
  it("прячет сайдбар на публичных страницах", () => {
    expect(isChromelessRoute("/p/portfolio")).toBe(true);
  });

  it("прячет сайдбар на прототипе публичной формы", () => {
    expect(isChromelessRoute("/prototype/public-portfolio")).toBe(true);
  });

  // Прототип выглядит публичным, но паролем закрыт — иначе черновики
  // страниц уехали бы наружу вместе с рабочими.
  it("но прототип остаётся под паролем", () => {
    expect(isPublicRoute("/prototype/public-portfolio")).toBe(false);
  });

  it("открывает приём заявок — форме нечем авторизоваться", () => {
    expect(isPublicRoute("/api/public/portfolio")).toBe(true);
  });

  it("остальное api держит под паролем", () => {
    // Промах здесь означал бы открытую наружу базу кандидатов
    for (const path of [
      "/api/candidates",
      "/api/candidates/123",
      "/api/vacancies",
      "/api/publications", // похоже на public, но им не является
      "/api/candidates/public",
    ]) {
      expect(isPublicRoute(path), path).toBe(false);
    }
  });

  it("оставляет сайдбар на остальных страницах", () => {
    for (const path of ["/", "/candidates", "/vacancies", "/prototype/dashboard"]) {
      expect(isChromelessRoute(path), path).toBe(false);
    }
  });
});
