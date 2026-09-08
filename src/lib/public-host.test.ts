import { describe, it, expect } from "vitest";
import { isPublicHost, hostname, решитьПоПути } from "./public-host";

const ХОСТ = "razbor.pragmatica.design";

describe("hostname", () => {
  it("отрезает порт и приводит к нижнему регистру", () => {
    expect(hostname("Razbor.Pragmatica.Design:3000")).toBe("razbor.pragmatica.design");
  });

  it("пустое переживает", () => {
    expect(hostname(null)).toBe("");
    expect(hostname(undefined)).toBe("");
  });
});

describe("isPublicHost", () => {
  it("узнаёт публичный домен", () => {
    expect(isPublicHost(ХОСТ, ХОСТ)).toBe(true);
    expect(isPublicHost(`${ХОСТ}:3000`, ХОСТ)).toBe(true);
  });

  it("не путает с рабочим доменом", () => {
    expect(isPublicHost("match.pragmatica.design", ХОСТ)).toBe(false);
  });

  it("не ведётся на похожие имена", () => {
    // Проверка «заканчивается на» пропустила бы это, а пароля на публичном
    // домене нет — цена ошибки здесь выше обычного
    expect(isPublicHost(`злой-${ХОСТ}`, ХОСТ)).toBe(false);
    expect(isPublicHost(`${ХОСТ}.evil.ru`, ХОСТ)).toBe(false);
  });

  it("без хоста отвечает нет", () => {
    expect(isPublicHost(null, ХОСТ)).toBe(false);
    expect(isPublicHost("", ХОСТ)).toBe(false);
  });
});

describe("решитьПоПути", () => {
  it("на корне отдаёт страницу", () => {
    expect(решитьПоПути("/")).toEqual({ вид: "страница" });
  });

  it("собственный адрес страницы тоже оставляет рабочим", () => {
    // Ссылки на /p/portfolio уже могли разойтись
    expect(решитьПоПути("/p/portfolio")).toEqual({ вид: "страница" });
    expect(решитьПоПути("/p/portfolio/")).toEqual({ вид: "страница" });
  });

  it("пропускает ссылку на свой разбор", () => {
    // Её человек копирует на экране ожидания — она обязана открываться
    expect(решитьПоПути("/p/portfolio/cmtrd4yxx0000pubeovk7b96s")).toEqual({
      вид: "пропустить",
    });
  });

  it("пропускает приём заявок и сборку", () => {
    for (const p of ["/api/public/portfolio", "/api/public/portfolio/abc", "/_next/static/a.js", "/favicon.ico"]) {
      expect(решитьПоПути(p), p).toEqual({ вид: "пропустить" });
    }
  });

  it("внутреннего продукта на этом домене нет вовсе", () => {
    // Не «закрыт паролем», а не существует: иначе по ссылке, которую мы
    // раздаём дизайнерам, находился бы вход во внутренний инструмент
    for (const p of ["/candidates", "/vacancies", "/api/candidates", "/prototype/public-portfolio", "/p/другое"]) {
      expect(решитьПоПути(p), p).toEqual({ вид: "нет" });
    }
  });
});
