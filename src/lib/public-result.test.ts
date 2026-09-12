import { describe, it, expect } from "vitest";
import { toPublicResult, scoreToLevel } from "./public-result";

const разбор = {
  direction: "product",
  overallAssessment: "Сильный продуктовый дизайнер.",
  scores: {
    visualStrength: 74,
    uxStrength: 82,
    productMaturity: 50,
    systemThinking: null,
    argumentationQuality: 65,
    metricsImpact: 40,
    researchDepth: 70,
  },
  scoreExplanations: {
    visualStrength: "Композиция уверенная.",
    uxStrength: "Флоу читаются.",
    productMaturity: "Задача сформулирована общо.",
    systemThinking: "Не оценивалось.",
    argumentationQuality: "Решения показаны, но не обоснованы.",
    metricsImpact: "Цифр нет.",
    researchDepth: "Интервью упоминаются.",
  },
  cases: [{ title: "Мобильный банк", description: "Путь от проблемы до результата." }],
  strengths: ["Отбор работ сделан"],
  concerns: ["Роль не указана"],
  redFlags: ["Возможно врёт про роль в проекте"],
  visualLevel: "средний",
  model: "gemini-2.5-flash",
  screenshotsAnalyzed: 8,
  analyzedAt: "2026-09-07T00:00:00.000Z",
};

describe("scoreToLevel", () => {
  it("делит по порогам 80 и 58", () => {
    expect(scoreToLevel(90)).toBe("сильный");
    expect(scoreToLevel(80)).toBe("сильный");
    expect(scoreToLevel(79)).toBe("средний");
    expect(scoreToLevel(58)).toBe("средний");
    expect(scoreToLevel(57)).toBe("слабый");
  });

  it("честную семидесятку не считает слабой", () => {
    // Ступени внутри кодируются как 90/70/45 — 70 это ровно «средний»
    expect(scoreToLevel(70)).toBe("средний");
  });
});

describe("toPublicResult", () => {
  it("наружу не отдаёт внутреннее", () => {
    const r = toPublicResult(разбор)!;
    const текст = JSON.stringify(r);
    // Стоп-факторы адресованы рекрутеру, а не человеку
    expect(текст).not.toContain("врёт");
    expect(текст).not.toContain("gemini");
    expect(текст).not.toContain("screenshotsAnalyzed");
    expect(Object.keys(r).sort()).toEqual(
      ["кейсы", "критерии", "нехватает", "общее", "работает"].sort(),
    );
  });

  it("для визуала берёт ступень из разбора, а не из числа", () => {
    // 74 по порогам — «средний», и ступень тоже «средний»; проверяем,
    // что берётся именно поле, подменив его
    const r = toPublicResult({ ...разбор, visualLevel: "сильный" })!;
    expect(r.критерии.find((k) => k.название === "Визуал")!.ступень).toBe("сильный");
  });

  it("без ступени в разборе считает её из числа", () => {
    const r = toPublicResult({ ...разбор, visualLevel: null })!;
    expect(r.критерии.find((k) => k.название === "Визуал")!.ступень).toBe("средний");
  });

  it("визуал показывает всегда, даже когда оценить не вышло", () => {
    // Пропажа главного критерия читается как поломка: человек не понимает,
    // оценили его визуал или нет
    const r = toPublicResult({
      ...разбор,
      scores: { ...разбор.scores, visualStrength: null },
      visualLevel: null,
    })!;
    const в = r.критерии.find((k) => k.название === "Визуал")!;
    expect(в.ступень).toBeNull();
    expect(в.пояснение).toMatch(/не вышло/);
    // И стоит первым, как при обычной оценке
    expect(r.критерии[0].название).toBe("Визуал");
  });

  it("заглушку не подставляет к пустому разбору", () => {
    // null для маршрута означает «разбор ещё идёт». Подмени его
    // заглушкой — страница покажет готовый результат вместо ожидания
    expect(toPublicResult({})).toBeNull();
    expect(toPublicResult({ scores: {}, overallAssessment: "" })).toBeNull();
  });

  it("разбор без единой оценки даёт хотя бы объяснённый визуал", () => {
    // Так было у моушн-дизайнера без изображений: критериев ноль, раздел
    // исчезал целиком
    const r = toPublicResult({ overallAssessment: "Изображений в портфолио нет." })!;
    expect(r.критерии).toHaveLength(1);
    expect(r.критерии[0]).toMatchObject({ название: "Визуал", ступень: null });
  });

  it("пропускает критерии без оценки или без пояснения", () => {
    const r = toPublicResult(разбор)!;
    const названия = r.критерии.map((k) => k.название);
    // systemThinking = null → «Системность» не показываем
    expect(названия).not.toContain("Системность");
    expect(названия).toContain("Визуал");
  });

  it("голый ярлык без пояснения не показывает", () => {
    const r = toPublicResult({
      ...разбор,
      scoreExplanations: { ...разбор.scoreExplanations, uxStrength: "  " },
    })!;
    expect(r.критерии.map((k) => k.название)).not.toContain("UX");
  });

  it("держит заданный порядок критериев", () => {
    const r = toPublicResult(разбор)!;
    expect(r.критерии[0].название).toBe("Визуал");
    expect(r.критерии[1].название).toBe("UX");
  });

  it("у коммуникационных портфолио свой набор критериев", () => {
    const r = toPublicResult({
      direction: "communication",
      overallAssessment: "Сильная графика.",
      scores: { visualCraft: 85, typography: 60 },
      scoreExplanations: { visualCraft: "Чисто.", typography: "Кеглей многовато." },
    })!;
    expect(r.критерии.map((k) => k.название)).toEqual(["Визуал", "Типографика"]);
  });

  it("кейсы без названия выбрасывает", () => {
    const r = toPublicResult({
      ...разбор,
      cases: [{ title: "", description: "текст" }, { title: "Кейс", description: "" }],
    })!;
    expect(r.кейсы).toEqual([{ название: "Кейс", описание: "" }]);
  });

  it("на пустом разборе возвращает null — показывать нечего", () => {
    expect(toPublicResult(null)).toBeNull();
    expect(toPublicResult({})).toBeNull();
    expect(toPublicResult({ scores: {}, overallAssessment: "" })).toBeNull();
  });

  it("мусор в списках не роняет разбор", () => {
    const r = toPublicResult({ ...разбор, strengths: [1, null, "Годное"], concerns: "не массив" })!;
    expect(r.работает).toEqual(["Годное"]);
    expect(r.нехватает).toEqual([]);
  });
});
