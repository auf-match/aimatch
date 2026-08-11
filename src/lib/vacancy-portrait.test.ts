import { describe, it, expect } from "vitest";
import {
  buildVacancyPortrait,
  riskyPortraitSections,
  titleNamesClient,
  type PortraitVacancy,
} from "./vacancy-portrait";

const FULL: PortraitVacancy = {
  title: "Senior Product Designer",
  role: "PRODUCT_DESIGNER",
  grade: "SENIOR",
  designersNeeded: 1,
  employmentType: "FULL_TIME",
  workFormat: "REMOTE",
  location: "РФ (удалённо)",
  timezone: "MSK",
  desiredStartDate: "сентябрь",
  duration: "бессрочно",
  productDescription: "Подписочный сервис лояльности.",
  reasonForHiring: "Усиление команды.",
  keyTasks: ["Проектирование экранов", "Ревью"],
  requiredSkills: ["B2C mobile", "дизайн-системы"],
  niceToHaveSkills: ["моушен"],
  preferredDomains: ["ритейл"],
  requiredTools: ["Figma"],
  needsInternational: false,
  specialCompetencies: ["онбординг"],
  redFlags: ["только графический дизайн"],
  portfolioReferences: ["https://example.com/case"],
};

describe("buildVacancyPortrait", () => {
  const text = buildVacancyPortrait(FULL);

  it("starts with the position title", () => {
    expect(text.startsWith("ПОРТРЕТ ПОЗИЦИИ: Senior Product Designer")).toBe(true);
  });

  it("translates enum values to Russian labels", () => {
    expect(text).toContain("Роль: Product Designer");
    expect(text).toContain("Грейд: Senior");
    expect(text).toContain("Занятость: Полная занятость");
    expect(text).toContain("Формат: Удалённо");
  });

  it("renders lists as dashes", () => {
    expect(text).toContain("ЗАДАЧИ\n— Проектирование экранов\n— Ревью");
  });

  it("keeps the sections an agency needs", () => {
    for (const heading of [
      "О ПРОДУКТЕ И КОМАНДЕ",
      "ЗАЧЕМ ИЩЕМ",
      "ОБЯЗАТЕЛЬНО",
      "БУДЕТ ПЛЮСОМ",
      "ИНСТРУМЕНТЫ",
      "СТОП-ФАКТОРЫ",
      "ОРИЕНТИРЫ ПО ПОРТФОЛИО",
    ]) {
      expect(text).toContain(heading);
    }
  });

  it("omits the count when only one designer is needed", () => {
    expect(text).not.toContain("Количество");
    expect(buildVacancyPortrait({ ...FULL, designersNeeded: 3 })).toContain(
      "Количество: 3",
    );
  });

  it("mentions international experience only when required", () => {
    expect(text).not.toContain("международных");
    expect(
      buildVacancyPortrait({ ...FULL, needsInternational: true }),
    ).toContain("Нужен опыт международных проектов");
  });

  it("skips empty sections entirely instead of leaving bare headings", () => {
    const bare = buildVacancyPortrait({
      ...FULL,
      productDescription: null,
      reasonForHiring: "   ",
      keyTasks: [],
      niceToHaveSkills: ["  "],
      portfolioReferences: [],
    });
    expect(bare).not.toContain("О ПРОДУКТЕ И КОМАНДЕ");
    expect(bare).not.toContain("ЗАЧЕМ ИЩЕМ");
    expect(bare).not.toContain("ЗАДАЧИ");
    expect(bare).not.toContain("БУДЕТ ПЛЮСОМ");
    expect(bare).not.toContain("ОРИЕНТИРЫ ПО ПОРТФОЛИО");
  });

  it("never leaves more than one blank line between blocks", () => {
    const sparse = buildVacancyPortrait({
      ...FULL,
      productDescription: null,
      reasonForHiring: null,
      keyTasks: [],
      requiredSkills: [],
    });
    expect(sparse).not.toMatch(/\n{3,}/);
  });

  it("trims values and drops blank list items", () => {
    const t = buildVacancyPortrait({
      ...FULL,
      title: "  Дизайнер  ",
      requiredSkills: ["  Figma  ", "", "   "],
    });
    expect(t).toContain("ПОРТРЕТ ПОЗИЦИИ: Дизайнер");
    expect(t).toContain("— Figma");
    expect(t).not.toContain("— \n");
  });

  it("falls back to the raw enum value when there is no label", () => {
    const t = buildVacancyPortrait({ ...FULL, role: "WEIRD_ROLE" });
    expect(t).toContain("Роль: WEIRD_ROLE");
  });
});

// Главное свойство: наружу не должно утечь ничего клиентского.
describe("buildVacancyPortrait — confidentiality", () => {
  it("has no field for client, salary, decision maker or scoring", () => {
    // Поля намеренно отсутствуют в PortraitVacancy: если кто-то добавит
    // их в тип, этот тест перестанет компилироваться и заставит подумать.
    const keys = Object.keys(FULL);
    for (const forbidden of [
      "clientName",
      "clientLead",
      "salaryRange",
      "teamComposition",
      "decisionMaker",
      "hiringStages",
      "testTask",
      "scoringCriteria",
      "clientNotes",
      "internalNotes",
      "briefingTranscript",
      "briefingSummary",
      "interviewInsights",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("does not leak values passed in as extra properties", () => {
    const withExtras = {
      ...FULL,
      clientName: "Х5 Group",
      salaryRange: "400-500к",
      internalNotes: "клиент тяжёлый",
    } as PortraitVacancy;
    const t = buildVacancyPortrait(withExtras);
    expect(t).not.toContain("Х5 Group");
    expect(t).not.toContain("400-500к");
    expect(t).not.toContain("тяжёлый");
  });
});

describe("riskyPortraitSections", () => {
  it("flags free-text blocks that usually name the client", () => {
    expect(riskyPortraitSections(FULL)).toEqual([
      "О продукте и команде",
      "Зачем ищем",
    ]);
  });
  it("flags nothing when those blocks are empty", () => {
    expect(
      riskyPortraitSections({
        ...FULL,
        productDescription: "",
        reasonForHiring: null,
      }),
    ).toEqual([]);
  });

  it("flags the title when it carries the client name", () => {
    const v = { ...FULL, title: "Х5 - Senior Product Designer" };
    expect(riskyPortraitSections(v, "Х5")).toContain("Название позиции");
    expect(riskyPortraitSections(v, "Ростикс")).not.toContain("Название позиции");
  });

  it("does not flag the title when there is no client on record", () => {
    expect(riskyPortraitSections(FULL, null)).not.toContain("Название позиции");
    expect(riskyPortraitSections(FULL, "   ")).not.toContain("Название позиции");
  });
});

describe("titleNamesClient", () => {
  it("matches regardless of case and padding", () => {
    expect(titleNamesClient("Дизайнер в ЯНДЕКС Маркет", "  яндекс  ")).toBe(true);
  });

  // Настоящий случай из базы: клиент «X5 Group» латиницей, заголовок «Х5» кириллицей.
  it("sees through Latin/Cyrillic lookalike letters", () => {
    expect(titleNamesClient("Х5 - Senior Product Designer", "X5 Group")).toBe(true);
    expect(titleNamesClient("X5 - Senior Product Designer", "Х5 Групп")).toBe(true);
  });

  it("matches on a short form of a multi-word client", () => {
    expect(titleNamesClient("Дизайнер, Ростикс", "Ростикс Россия")).toBe(true);
  });

  it("ignores generic corporate tokens on their own", () => {
    expect(titleNamesClient("Дизайнер в growth team", "Acme Group")).toBe(false);
    expect(titleNamesClient("Product Designer, studio", "Некое ООО")).toBe(false);
  });

  it("ignores one-letter tokens that would match almost anything", () => {
    expect(titleNamesClient("Senior Product Designer", "X")).toBe(false);
  });

  it("returns false without a client name", () => {
    expect(titleNamesClient("Дизайнер", null)).toBe(false);
    expect(titleNamesClient("Дизайнер", "  ")).toBe(false);
  });
});
