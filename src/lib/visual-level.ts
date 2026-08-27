import type { ScreenshotMeta } from "./screenshot-select";

/**
 * Ступени оценки визуала вместо балла.
 *
 * Зачем: замер показал, что модель на одном и том же материале даёт разброс
 * около десяти баллов — 68, 74 и 78 за три прогона. Это свойство модели,
 * инструкциями не лечится. Но все три числа означают одно и то же: «средний».
 *
 * Балл в карточке создаёт ложную точность: рекрутер видит 74 и думает, что
 * это на четыре лучше, чем 70, хотя разница внутри шума. Ступень честнее.
 *
 * Число всё равно нужно — по нему сортируют и фильтруют, — поэтому ступень
 * раскладывается в середину своего диапазона.
 */
export type VisualLevel = "сильный" | "средний" | "слабый";

/** Границы взяты из шкалы в промпте: 85+ сильный, 55–84 средний, ниже слабый. */
const LEVEL_SCORE: Record<VisualLevel, number> = {
  сильный: 90,
  средний: 70,
  слабый: 45,
};

export function levelToScore(level: VisualLevel): number {
  return LEVEL_SCORE[level];
}

/** Разбирает ответ модели. Возвращает null на всём, что не ступень. */
export function parseLevel(raw: unknown): VisualLevel | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v.startsWith("сильн")) return "сильный";
  if (v.startsWith("средн")) return "средний";
  if (v.startsWith("слаб")) return "слабый";
  return null;
}

/**
 * Оставляет кадры только тех кейсов, что признаны потребительскими.
 *
 * Раньше решение «что считать B2C» принимала сама модель прямо в оценке
 * визуала — и каждый прогон брала разный набор. У одного портфолио это
 * дало 74 по личному кабинету, 78 по фитнесу и 68 снова по фитнесу.
 * Теперь набор фиксируется до оценки и не меняется от прогона к прогону.
 *
 * Кадры ленты (не привязанные к кейсу) отбрасываем: непонятно, к какому
 * типу продукта они относятся.
 */
export function keepB2CFrames(
  metas: ScreenshotMeta[],
  b2cCaseIndexes: Set<number>,
): number[] {
  const out: number[] = [];
  metas.forEach((m, i) => {
    if (m.source !== "case") return;
    if (b2cCaseIndexes.has(m.caseIndex ?? -1)) out.push(i);
  });
  return out;
}

/** Номера кейсов и их заголовки — вход для разметки по типу. */
export function listCases(
  metas: ScreenshotMeta[],
): { index: number; title: string; frames: number }[] {
  const byIndex = new Map<number, { title: string; frames: number }>();
  for (const m of metas) {
    if (m.source !== "case") continue;
    const key = m.caseIndex ?? 0;
    const prev = byIndex.get(key);
    byIndex.set(key, {
      title: m.caseTitle ?? prev?.title ?? "",
      frames: (prev?.frames ?? 0) + 1,
    });
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, v]) => ({ index, title: v.title, frames: v.frames }));
}
