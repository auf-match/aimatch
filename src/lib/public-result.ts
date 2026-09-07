import type { VisualLevel } from "./visual-level";

/**
 * Что из разбора портфолио показывать человеку на публичной странице.
 *
 * Отдельный модуль, потому что это граница: по одну сторону внутренний
 * разбор для дизайн-лида, по другую — текст, который прочитает про себя
 * сам дизайнер. Наружу должно уходить ровно перечисленное здесь, и
 * добавлять поля можно только осознанно.
 *
 * Чего наружу НЕ отдаём:
 *   redFlags — внутренние стоп-факторы для найма. Формулировки там резкие
 *              и адресованы рекрутеру, а не человеку («врёт про роль»).
 *   model, screenshotsAnalyzed, analyzedAt — устройство системы.
 *   interfaceShots — пути к файлам за паролем, снаружи всё равно не отдать.
 *
 * Оценки показываем словом, а не числом. Внутри разбора визуал — это 68,
 * 74 или 78 на одном и том же материале; точность до балла здесь ложная,
 * и показывать её человеку значит выдавать шум за измерение.
 */

export type Ступень = VisualLevel;

export interface PublicCriterion {
  /** Название по-человечески: «Визуал», а не visualStrength */
  название: string;
  ступень: Ступень;
  пояснение: string;
}

export interface PublicResult {
  общее: string;
  критерии: PublicCriterion[];
  работает: string[];
  нехватает: string[];
  кейсы: { название: string; описание: string }[];
}

/** Как поля разбора называются для человека. Порядок задаёт порядок карточек. */
const НАЗВАНИЯ_ПРОДУКТ: [string, string][] = [
  ["visualStrength", "Визуал"],
  ["uxStrength", "UX"],
  ["productMaturity", "Продуктовое мышление"],
  ["systemThinking", "Системность"],
  ["argumentationQuality", "Аргументация"],
  ["researchDepth", "Исследования"],
  ["metricsImpact", "Результат в цифрах"],
];

const НАЗВАНИЯ_КОММ: [string, string][] = [
  ["visualCraft", "Визуал"],
  ["conceptStrength", "Идея"],
  ["typography", "Типографика"],
  ["brandSystems", "Системы и айдентика"],
  ["styleRange", "Диапазон стилей"],
  ["presentation", "Подача"],
  ["trendRelevance", "Актуальность"],
];

/**
 * Порог между «сильным» и «средним» — 80, между «средним» и «слабым» — 58.
 *
 * Не круглые 80/60 намеренно: внутри ступени кодируются числами 90, 70 и 45,
 * и середина между 70 и 45 равна 57,5. Порог 60 отправил бы честную
 * семидесятку в «слабый».
 */
export function scoreToLevel(score: number): Ступень {
  if (score >= 80) return "сильный";
  if (score >= 58) return "средний";
  return "слабый";
}

interface Разбор {
  scores?: Record<string, number | null> | null;
  scoreExplanations?: Record<string, string> | null;
  cases?: { title?: string; description?: string }[] | null;
  overallAssessment?: string | null;
  strengths?: string[] | null;
  concerns?: string[] | null;
  visualLevel?: string | null;
  direction?: string;
}

const строки = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];

/**
 * Собирает публичный результат. Возвращает null, если показывать нечего:
 * без общего впечатления и без единого критерия страница будет пустой, и
 * честнее сказать «не получилось», чем показать заготовку.
 */
export function toPublicResult(разбор: unknown): PublicResult | null {
  if (!разбор || typeof разбор !== "object") return null;
  const a = разбор as Разбор;

  const общее = typeof a.overallAssessment === "string" ? a.overallAssessment.trim() : "";
  const scores = a.scores ?? {};
  const пояснения = a.scoreExplanations ?? {};

  const названия = a.direction === "communication" ? НАЗВАНИЯ_КОММ : НАЗВАНИЯ_ПРОДУКТ;

  const критерии: PublicCriterion[] = [];
  for (const [ключ, название] of названия) {
    const score = scores[ключ];
    const пояснение = typeof пояснения[ключ] === "string" ? пояснения[ключ].trim() : "";
    // Без пояснения карточка превращается в голый ярлык — такое не показываем
    if (typeof score !== "number" || !пояснение) continue;

    // Для визуала ступень берём из разбора, если она там есть: её считали
    // отдельным запросом по одним скриншотам, и число — производное от неё
    const ступень =
      название === "Визуал" && typeof a.visualLevel === "string" && a.visualLevel.trim()
        ? (a.visualLevel.trim() as Ступень)
        : scoreToLevel(score);

    критерии.push({ название, ступень, пояснение });
  }

  if (!общее && критерии.length === 0) return null;

  const кейсы = (Array.isArray(a.cases) ? a.cases : [])
    .map((c) => ({
      название: typeof c?.title === "string" ? c.title.trim() : "",
      описание: typeof c?.description === "string" ? c.description.trim() : "",
    }))
    .filter((c) => c.название);

  return {
    общее,
    критерии,
    работает: строки(a.strengths),
    нехватает: строки(a.concerns),
    кейсы,
  };
}
