import { describe, it, expect } from "vitest";
import {
  keepB2CFrames,
  levelToScore,
  listCases,
  parseLevel,
  type VisualLevel,
} from "./visual-level";
import type { ScreenshotMeta } from "./screenshot-select";

const кейс = (i: number, n: number, title = `Кейс ${i}`): ScreenshotMeta[] =>
  Array.from({ length: n }, (_, k) => ({
    source: "case" as const,
    caseIndex: i,
    caseTitle: title,
    frame: k + 1,
    frameTotal: n,
  }));

const лента = (n: number): ScreenshotMeta[] =>
  Array.from({ length: n }, (_, k) => ({
    source: "main" as const,
    frame: k + 1,
    frameTotal: n,
  }));

describe("parseLevel", () => {
  it("узнаёт три ступени", () => {
    expect(parseLevel("сильный")).toBe("сильный");
    expect(parseLevel("средний")).toBe("средний");
    expect(parseLevel("слабый")).toBe("слабый");
  });

  it("прощает регистр, пробелы и окончания", () => {
    expect(parseLevel("  Сильный ")).toBe("сильный");
    expect(parseLevel("СРЕДНЕЕ")).toBe("средний");
    expect(parseLevel("слабое")).toBe("слабый");
  });

  it("возвращает null на всём остальном", () => {
    expect(parseLevel("отличный")).toBe(null);
    expect(parseLevel(72)).toBe(null);
    expect(parseLevel(null)).toBe(null);
    expect(parseLevel("")).toBe(null);
  });
});

describe("levelToScore", () => {
  it("раскладывает ступени по диапазонам шкалы", () => {
    expect(levelToScore("сильный")).toBe(90);
    expect(levelToScore("средний")).toBe(70);
    expect(levelToScore("слабый")).toBe(45);
  });

  // Сортировка в списке кандидатов идёт по числу — порядок ступеней должен
  // сохраняться, иначе слабые окажутся выше сильных
  it("порядок ступеней сохраняется в числах", () => {
    const уровни: VisualLevel[] = ["слабый", "средний", "сильный"];
    const числа = уровни.map(levelToScore);
    expect(числа).toEqual([...числа].sort((a, b) => a - b));
  });
});

describe("listCases", () => {
  it("собирает кейсы с заголовками и числом кадров", () => {
    const metas = [...лента(3), ...кейс(1, 12, "Фитнес"), ...кейс(2, 8, "CRM")];
    expect(listCases(metas)).toEqual([
      { index: 1, title: "Фитнес", frames: 12 },
      { index: 2, title: "CRM", frames: 8 },
    ]);
  });

  it("кадры ленты в список кейсов не попадают", () => {
    expect(listCases(лента(5))).toEqual([]);
  });
});

describe("keepB2CFrames", () => {
  // Ради этого всё и делается: раньше набор кейсов выбирала модель, и он
  // менялся от прогона к прогону — 74 по личному кабинету, 78 по фитнесу
  it("оставляет кадры только отмеченных кейсов", () => {
    const metas = [...лента(4), ...кейс(1, 10, "Фитнес"), ...кейс(2, 6, "CRM")];
    const out = keepB2CFrames(metas, new Set([1]));
    expect(out).toHaveLength(10);
    expect(out.every((i) => metas[i].caseIndex === 1)).toBe(true);
  });

  it("кадры ленты отбрасываются — тип продукта по ним не определить", () => {
    const metas = [...лента(4), ...кейс(1, 5)];
    expect(keepB2CFrames(metas, new Set([1]))).toHaveLength(5);
  });

  it("ни одного потребительского кейса — пустой список", () => {
    const metas = [...кейс(1, 8), ...кейс(2, 8)];
    expect(keepB2CFrames(metas, new Set())).toEqual([]);
  });

  it("несколько кейсов сразу", () => {
    const metas = [...кейс(1, 4), ...кейс(2, 4), ...кейс(3, 4)];
    expect(keepB2CFrames(metas, new Set([1, 3]))).toHaveLength(8);
  });
});
