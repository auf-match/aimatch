import { describe, it, expect } from "vitest";
import {
  dropThinCases,
  selectScreenshotIndexes,
  captionFor,
  type ScreenshotMeta,
} from "./screenshot-select";

/** Хелпер: собирает метаданные — n кадров главной + по кадрам на кейс. */
function build(mainFrames: number, caseFrames: number[]): ScreenshotMeta[] {
  const out: ScreenshotMeta[] = [];
  for (let i = 1; i <= mainFrames; i++) {
    out.push({ source: "main", frame: i, frameTotal: mainFrames });
  }
  caseFrames.forEach((total, ci) => {
    for (let i = 1; i <= total; i++) {
      out.push({
        source: "case",
        caseIndex: ci + 1,
        caseTitle: `Кейс ${ci + 1}`,
        frame: i,
        frameTotal: total,
      });
    }
  });
  return out;
}

/** Сколько выбрано кадров из каждого источника. */
function countBySource(metas: ScreenshotMeta[], idx: number[]) {
  const counts: Record<string, number> = {};
  for (const i of idx) {
    const m = metas[i];
    const k = m.source === "main" ? "main" : `case-${m.caseIndex}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

describe("selectScreenshotIndexes", () => {
  it("если кадров меньше лимита — берёт все", () => {
    const metas = build(2, [3, 2]);
    expect(selectScreenshotIndexes(metas, 20)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("каждый кейс представлен хотя бы одним кадром", () => {
    // 5 кейсов по 30 кадров + длинная главная — жёсткий лимит 20
    const metas = build(40, [30, 30, 30, 30, 30]);
    const idx = selectScreenshotIndexes(metas, 20);
    const counts = countBySource(metas, idx);
    for (let c = 1; c <= 5; c++) {
      expect(counts[`case-${c}`], `кейс ${c} должен быть представлен`).toBeGreaterThan(0);
    }
  });

  it("главная не съедает бюджет — экраны кейсов приоритетнее", () => {
    const metas = build(100, [20, 20]);
    const idx = selectScreenshotIndexes(metas, 20);
    const counts = countBySource(metas, idx);
    expect(counts["main"]).toBeLessThanOrEqual(3);
    // основной объём — из кейсов
    expect((counts["case-1"] ?? 0) + (counts["case-2"] ?? 0)).toBeGreaterThanOrEqual(15);
  });

  it("не превышает лимит", () => {
    const metas = build(50, [40, 40, 40]);
    expect(selectScreenshotIndexes(metas, 20)).toHaveLength(20);
  });

  it("внутри кейса берёт разные экраны (начало и конец), а не первые подряд", () => {
    const metas = build(0, [10]);
    const idx = selectScreenshotIndexes(metas, 4);
    // кадры кейса имеют индексы 0..9; выбранные не должны быть 0,1,2,3
    expect(idx).toContain(0); // начало
    expect(idx).toContain(9); // конец
    expect(idx).not.toEqual([0, 1, 2, 3]);
  });

  it("портфолио без кейсов (только главная) — равномерно по ленте", () => {
    const metas = build(30, []);
    const idx = selectScreenshotIndexes(metas, 5);
    expect(idx).toHaveLength(5);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(29);
  });

  it("пустой вход и нулевой лимит", () => {
    expect(selectScreenshotIndexes([], 20)).toEqual([]);
    expect(selectScreenshotIndexes(build(5, [5]), 0)).toEqual([]);
  });

  it("индексы отсортированы и уникальны", () => {
    const metas = build(20, [25, 25, 25]);
    const idx = selectScreenshotIndexes(metas, 20);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(new Set(idx).size).toBe(idx.length);
  });
});

describe("captionFor", () => {
  it("подпись кадра главной страницы", () => {
    expect(captionFor({ source: "main", frame: 2, frameTotal: 5 })).toBe(
      "Главная страница портфолио — кадр 2 из 5",
    );
  });

  it("подпись экрана кейса с заголовком", () => {
    expect(
      captionFor({
        source: "case",
        caseIndex: 2,
        caseTitle: "Fintech app",
        frame: 3,
        frameTotal: 8,
      }),
    ).toBe("Кейс 2 «Fintech app» — экран 3 из 8");
  });

  it("подпись кейса без заголовка не ломается", () => {
    expect(
      captionFor({ source: "case", caseIndex: 1, frame: 1, frameTotal: 4 }),
    ).toBe("Кейс 1 — экран 1 из 4");
  });
});

describe("dropThinCases", () => {
  const c = (i: number, n: number, title = `Кейс ${i}`): ScreenshotMeta[] =>
    Array.from({ length: n }, (_, k) => ({
      source: "case" as const, caseIndex: i, caseTitle: title, frame: k + 1, frameTotal: n,
    }));
  const main = (n: number): ScreenshotMeta[] =>
    Array.from({ length: n }, (_, k) => ({
      source: "main" as const, frame: k + 1, frameTotal: n,
    }));

  const casesIn = (m: ScreenshotMeta[]) =>
    [...new Set(m.filter((x) => x.source === "case").map((x) => x.caseTitle))];

  // Живые числа с Behance: три кейса по 26–32 кадра и две служебные страницы
  it("выбрасывает короткие служебные страницы", () => {
    const metas = [
      ...main(3),
      ...c(1, 26, "INSERM"),
      ...c(2, 29, "BIOGRAPHY.COM"),
      ...c(3, 32, "THISISPAPER"),
      ...c(4, 6, "How to Get Hired on Behance"),
      ...c(5, 3, "Профиль специалиста"),
    ];
    expect(casesIn(dropThinCases(metas))).toEqual([
      "INSERM", "BIOGRAPHY.COM", "THISISPAPER",
    ]);
  });

  it("кадры ленты не трогает", () => {
    const metas = [...main(4), ...c(1, 20), ...c(2, 2)];
    expect(dropThinCases(metas).filter((m) => m.source === "main")).toHaveLength(4);
  });

  it("нумерует оставшиеся заново, без пропусков", () => {
    const out = dropThinCases([...c(1, 20, "A"), ...c(2, 2, "B"), ...c(3, 18, "C")]);
    expect([...new Set(out.map((m) => m.caseIndex))]).toEqual([1, 2]);
  });

  // Портфолио бывают короткими целиком — абсолютный порог отсёк бы всё
  it("равномерно короткие кейсы остаются все", () => {
    const metas = [...c(1, 4, "A"), ...c(2, 3, "B"), ...c(3, 4, "C")];
    expect(casesIn(dropThinCases(metas))).toEqual(["A", "B", "C"]);
  });

  it("единственный кейс не трогает", () => {
    const metas = [...main(2), ...c(1, 1, "Один")];
    expect(casesIn(dropThinCases(metas))).toEqual(["Один"]);
  });

  it("пустой вход не ломает", () => {
    expect(dropThinCases([])).toEqual([]);
  });
});
