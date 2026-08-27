/**
 * Portfolio Visual Analyzer.
 *
 * Берёт текст портфолио + скриншоты кейсов, отправляет в Gemini Vision,
 * получает структурированную оценку (7 шкал + разбор кейсов + red flags).
 *
 * Используется в flow загрузки кандидата как отдельный шаг после parseResume.
 * При ошибке не валит upload — это best-effort обогащение карточки.
 */

import { Part } from "@google/generative-ai";
import { callGeminiWithModel, ClaudeServiceError, PRIMARY_MODEL, type GeminiAnswer } from "./claude";
import {
  selectScreenshotIndexes,
  captionFor,
  type ScreenshotMeta,
} from "@/lib/screenshot-select";
import { buildPortfolioAnalyzePrompt } from "../prompts/portfolio-analyze";
import { buildPortfolioVisualPrompt } from "../prompts/portfolio-visual";
import { buildFrameScreenPrompt } from "../prompts/frame-screen";
import { loadVisualAnchors } from "./visual-anchors";
import { buildCaseTypePrompt } from "../prompts/case-type";
import { savePageImages, saveInterfaceShots } from "./interface-shots";
import {
  keepB2CFrames,
  levelToScore,
  listCases,
  parseLevel,
  type VisualLevel,
} from "@/lib/visual-level";
import { buildPortfolioAnalyzeCommPrompt } from "../prompts/portfolio-analyze-comm";

export interface PortfolioCase {
  title: string;
  description: string;
  strengths: string[];
  concerns: string[];
}

export interface PortfolioScores {
  visualStrength: number | null;
  uxStrength: number | null;
  productMaturity: number | null;
  systemThinking: number | null;
  argumentationQuality: number | null;
  metricsImpact: number | null;
  researchDepth: number | null;
}

export interface CommPortfolioScores {
  visualCraft: number | null;
  conceptStrength: number | null;
  typography: number | null;
  brandSystems: number | null;
  styleRange: number | null;
  presentation: number | null;
  trendRelevance: number | null;
}

export interface PortfolioAnalysis {
  direction: "product";
  scores: PortfolioScores;
  scoreExplanations: Record<keyof PortfolioScores, string>;
  cases: PortfolioCase[];
  overallAssessment: string;
  redFlags: string[];
  strengths: string[];
  concerns: string[];
  /** Сколько скриншотов реально проанализировано */
  screenshotsAnalyzed: number;
  /**
   * Какая модель ответила. Основная бывает перегружена, и разбор молча
   * уходил в более слабую — в карточке кандидата это никак не отражалось,
   * а оценки от разных моделей несопоставимы.
   */
  model?: string;
  /** Основная модель не ответила: к оценкам стоит отнестись осторожнее */
  modelFallback?: boolean;
  /**
   * Ступень визуала. Основной ответ — число в scores.visualStrength нужно
   * только для сортировки: на одном материале модель даёт 68, 74 и 78,
   * и точность до балла здесь ложная.
   */
  visualLevel?: VisualLevel;
  /**
   * Экраны интерфейсов для карточки. Оценку визуала модель не тянет, а вот
   * отобрать кадры с интерфейсом умеет — показываем их человеку.
   */
  interfaceShots?: { path: string; caption?: string }[];
  /**
   * Номера отобранных кадров. Нужны там, где кандидат ещё не создан на
   * момент разбора: маршрут загрузки сохраняет экраны уже после создания.
   */
  interfaceIndexes?: number[];
  /** Метаданные для отладки */
  analyzedAt: string;
}

export interface CommPortfolioAnalysis {
  direction: "communication";
  scores: CommPortfolioScores;
  scoreExplanations: Record<keyof CommPortfolioScores, string>;
  cases: PortfolioCase[];
  overallAssessment: string;
  redFlags: string[];
  strengths: string[];
  concerns: string[];
  screenshotsAnalyzed: number;
  /**
   * Какая модель ответила. Основная бывает перегружена, и разбор молча
   * уходил в более слабую — в карточке кандидата это никак не отражалось,
   * а оценки от разных моделей несопоставимы.
   */
  model?: string;
  /** Основная модель не ответила: к оценкам стоит отнестись осторожнее */
  modelFallback?: boolean;
  analyzedAt: string;
}

export type AnyPortfolioAnalysis = PortfolioAnalysis | CommPortfolioAnalysis;

export class PortfolioAnalyzerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PortfolioAnalyzerError";
  }
}

/**
 * Максимум кадров, уходящих в модель за один анализ.
 *
 * Раньше стояло 20 с комментарием «Gemini поддерживает до 20» — это неверно,
 * то был лимит Claude (наследие прежней архитектуры). Gemini принимает до 3600
 * изображений и держит контекст в 1M токенов: кадр 1440x900 стоит ~1550
 * токенов, поэтому даже 300-кадровое портфолио укладывается с запасом.
 *
 * Ограничение поднято, чтобы кейс анализировался ЦЕЛИКОМ, без пропусков —
 * иначе нельзя судить, удержана ли визуальная система по всему продукту.
 * Значение оставлено настраиваемым: при аномально длинных портфолио
 * (сотни экранов) включается прореживание с сохранением всех кейсов.
 */
const MAX_IMAGES = Number(process.env.PORTFOLIO_MAX_IMAGES) || 150;

/**
 * Собирает части запроса из скриншотов.
 *
 * Каждое изображение предваряется подписью («Кейс 2 «Fintech app» — экран 3 из
 * 8»), чтобы модель понимала структуру портфолио. Без подписей 20 кадров —
 * плоский набор картинок, и оценить главный признак сильного визуала
 * (удержана ли визуальная система внутри одного продукта) невозможно.
 *
 * Если метаданных нет (старые вызовы, Figma) — работает как раньше:
 * равномерная выборка без подписей.
 */
function buildScreenshotParts(
  screenshots: Buffer[],
  metas: ScreenshotMeta[] | undefined,
): { parts: Part[]; sentCount: number; caseCount: number } {
  const parts: Part[] = [];

  const hasMeta = !!metas && metas.length === screenshots.length;
  const indexes = hasMeta
    ? selectScreenshotIndexes(metas!, MAX_IMAGES)
    : pickScreenshots(screenshots, MAX_IMAGES).map((_, i) => i);

  const selectedBuffers = hasMeta
    ? indexes.map((i) => screenshots[i])
    : pickScreenshots(screenshots, MAX_IMAGES);

  selectedBuffers.forEach((buf, n) => {
    if (hasMeta) {
      parts.push({ text: `[${captionFor(metas![indexes[n]])}]` });
    }
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") },
    });
  });

  const caseCount = hasMeta
    ? new Set(
        indexes
          .map((i) => metas![i])
          .filter((m) => m.source === "case")
          .map((m) => m.caseIndex),
      ).size
    : 0;

  return { parts, sentCount: selectedBuffers.length, caseCount };
}

/**
 * Оставляет только кадры, на которых виден экран продукта.
 *
 * Возвращает исходный список, если отбор не удался или отобрал подозрительно
 * мало: пустая выборка хуже засорённой — по ней визуал вообще не оценить.
 */
async function pickInterfaceFrames(
  screenshots: Buffer[],
  indexes: number[],
): Promise<number[]> {
  if (indexes.length <= 3) return indexes;

  const parts: Part[] = [{ text: buildFrameScreenPrompt(indexes.length) }];
  indexes.forEach((i, n) => {
    parts.push({ text: `[кадр ${n + 1}]` });
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: screenshots[i].toString("base64") },
    });
  });

  try {
    const answer = await callGeminiWithModel(parts);
    const raw = answer.text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const list = (JSON.parse(raw) as { интерфейс?: unknown }).интерфейс;
    if (!Array.isArray(list)) return indexes;

    // Номера в ответе — позиции в переданной пачке, 1-based
    const picked = list
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= indexes.length)
      .map((n) => indexes[n - 1]);

    const unique = [...new Set(picked)];
    // Слишком мало — отбор скорее сломался, чем портфолио без интерфейсов
    if (unique.length < 3) {
      console.warn(
        `[portfolio-analyzer] отбор кадров вернул ${unique.length} из ${indexes.length} — берём все`,
      );
      return indexes;
    }
    console.log(
      `[portfolio-analyzer] кадров с интерфейсом: ${unique.length} из ${indexes.length}`,
    );
    return unique;
  } catch (e) {
    console.warn(
      "[portfolio-analyzer] отбор кадров не удался:",
      (e as Error).message.slice(0, 120),
    );
    return indexes;
  }
}

/**
 * Размечает кейсы по типу продукта и возвращает номера потребительских.
 *
 * Отдельный запрос, по одному кадру на кейс. Раньше это решала оценивающая
 * модель по ходу дела, и набор менялся от прогона к прогону — отсюда
 * половина разброса в оценке визуала.
 *
 * При сбое возвращает все кейсы: лучше оценить лишнее, чем ничего.
 */
async function pickB2CCases(
  screenshots: Buffer[],
  metas: ScreenshotMeta[],
): Promise<Set<number>> {
  const cases = listCases(metas);
  const все = new Set(cases.map((c) => c.index));
  if (cases.length === 0) return все;

  // По одному кадру на кейс — берём средний, он информативнее обложки
  const parts: Part[] = [
    { text: buildCaseTypePrompt(cases.map((c) => ({ index: c.index, title: c.title }))) },
  ];
  for (const c of cases) {
    const свои = metas
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.source === "case" && m.caseIndex === c.index)
      .map(({ i }) => i);
    if (свои.length === 0) continue;
    parts.push({ text: `[кейс ${c.index}]` });
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: screenshots[свои[Math.floor(свои.length / 2)]].toString("base64"),
      },
    });
  }

  try {
    const answer = await callGeminiWithModel(parts);
    const raw = answer.text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const list = (JSON.parse(raw) as { кейсы?: unknown }).кейсы;
    if (!Array.isArray(list)) return все;

    const b2c = new Set<number>();
    for (const item of list) {
      const r = item as { номер?: unknown; тип?: unknown };
      const n = Number(r.номер);
      if (Number.isInteger(n) && String(r.тип).toLowerCase() === "b2c") b2c.add(n);
    }
    console.log(
      `[portfolio-analyzer] потребительских кейсов: ${b2c.size} из ${cases.length}`,
    );
    return b2c;
  } catch (e) {
    console.warn(
      "[portfolio-analyzer] разметка кейсов не удалась:",
      (e as Error).message.slice(0, 120),
    );
    return все;
  }
}

/** Результат отдельной оценки визуала. */
interface VisualVerdict {
  level: VisualLevel | null;
  score: number | null;
  explanation: string;
  /** Номера кадров, на которых модель увидела интерфейс — их показываем в карточке */
  interfaceIndexes: number[];
}

/**
 * Оценка визуала отдельным запросом: только кадры, без текста портфолио.
 *
 * Возвращает null-оценку и пустое объяснение, если кадров нет или модель
 * не ответила: визуал — не единственная шкала, и ронять из-за него весь
 * разбор было бы хуже, чем оставить поле пустым.
 */
async function analyzeVisualOnly(
  screenshots: Buffer[],
  metas?: ScreenshotMeta[],
): Promise<VisualVerdict | null> {
  if (!screenshots || screenshots.length === 0) return null;

  // Тип кейсов определяем ЗАРАНЕЕ и своим запросом: иначе оценивающая модель
  // каждый прогон берёт разный набор, и оценка плавает на десяток баллов.
  let pool = screenshots.map((_, i) => i);
  if (metas && metas.length === screenshots.length) {
    const b2c = await pickB2CCases(screenshots, metas);
    const только = keepB2CFrames(metas, b2c);
    if (только.length === 0) {
      // Все кейсы корпоративные — визуал не оцениваем
      return { level: null, score: null, explanation: "", interfaceIndexes: [] };
    }
    pool = только;
  }

  const all =
    metas && metas.length === screenshots.length
      ? selectScreenshotIndexes(
          pool.map((i) => metas[i]),
          MAX_IMAGES,
        ).map((n) => pool[n])
      : pool.slice(0, MAX_IMAGES);

  // Дальше выбрасываем развороты, обложки и таблицы мета-данных: оценивать
  // надо интерфейс, а не страницу о нём.
  const indexes = await pickInterfaceFrames(screenshots, all);

  const anchors = loadVisualAnchors();
  const parts: Part[] = [
    { text: buildPortfolioVisualPrompt(new Date(), anchors !== null) },
  ];

  if (anchors) {
    parts.push({ text: "=== ЭТАЛОНЫ СИЛЬНЫЕ (уровень 90) ===" });
    for (const a of anchors.strong) {
      parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
    }
    parts.push({ text: "=== ЭТАЛОНЫ СЛАБЫЕ (уровень 40) ===" });
    for (const a of anchors.weak) {
      parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
    }
    parts.push({ text: "=== КАНДИДАТ ===" });
  }

  for (const i of indexes) {
    if (metas && metas[i]) parts.push({ text: `[${captionFor(metas[i])}]` });
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: screenshots[i].toString("base64") },
    });
  }

  try {
    const answer = await callGeminiWithModel(parts);
    const raw = answer.text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const level = parseLevel(parsed.level);
    return {
      level,
      // Число нужно для сортировки и фильтров: ступень раскладывается
      // в середину своего диапазона
      score: level ? levelToScore(level) : null,
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
      interfaceIndexes: indexes,
    };
  } catch (e) {
    console.warn(
      "[portfolio-analyzer] оценка визуала не удалась:",
      (e as Error).message.slice(0, 120),
    );
    return null;
  }
}

/**
 * Анализирует портфолио продуктового дизайнера: текст + скриншоты → оценка по 7 продуктовым шкалам.
 */
export async function analyzePortfolio(
  scrapedText: string,
  screenshots: Buffer[],
  context?: { name?: string; role?: string; grade?: string },
  screenshotMeta?: ScreenshotMeta[],
  /** Нужен, чтобы разложить экраны интерфейсов по папкам кандидата */
  candidateId?: string,
  /** Картинки со страниц портфолио — предпочтительнее снимков экрана */
  pageImages?: { buffer: Buffer; caseTitle?: string }[],
): Promise<PortfolioAnalysis> {
  const text = scrapedText?.trim() ?? "";
  const hasText = text.length > 50;
  const hasScreenshots = screenshots && screenshots.length > 0;

  if (!hasText && !hasScreenshots) {
    throw new PortfolioAnalyzerError(
      "Нет данных для анализа портфолио (ни текста, ни скриншотов)",
    );
  }

  const prompt = buildPortfolioAnalyzePrompt(text, context);

  // Промпт идёт ПЕРЕД изображениями: модель должна знать задачу до того, как
  // начнёт смотреть кадры.
  const parts: Part[] = [{ text: prompt }];

  if (hasScreenshots) {
    const built = buildScreenshotParts(screenshots, screenshotMeta);
    parts.push(...built.parts);
    console.log(
      `[portfolio-analyzer] sending ${built.sentCount} screenshots ` +
        `(total: ${screenshots.length}, кейсов охвачено: ${built.caseCount})`,
    );
  }

  let rawResponse: string;
  let answer: GeminiAnswer = { text: "", model: PRIMARY_MODEL, fallback: false };
  try {
    answer = await callGeminiWithModel(parts);
    rawResponse = answer.text;
  } catch (error) {
    if (error instanceof ClaudeServiceError) {
      throw new PortfolioAnalyzerError(error.message, error);
    }
    throw new PortfolioAnalyzerError(
      "Ошибка вызова Gemini API при анализе портфолио",
      error,
    );
  }

  // Снять markdown-обёртку если есть
  rawResponse = rawResponse
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    // Попытка ремонта обрезанного JSON
    const repaired = repairTruncatedJson(rawResponse);
    try {
      parsed = JSON.parse(repaired);
      console.warn(
        "[portfolio-analyzer] JSON был обрезан — использован частичный результат",
      );
    } catch {
      throw new PortfolioAnalyzerError(
        `AI вернул невалидный JSON. Модель ${answer.model}, остановилась: ${answer.finishReason ?? "неизвестно"}, длина ${rawResponse.length}.\nНачало: ${rawResponse.slice(0, 200)}\nКонец: ${rawResponse.slice(-200)}`,
      );
    }
  }

  const base = normalizeAnalysis(
    parsed,
    hasScreenshots ? Math.min(screenshots.length, MAX_IMAGES) : 0,
  );

  // Визуал приходит из отдельного запроса — там модель видит только кадры.
  // Если он не удался, поле остаётся пустым: лучше пробел, чем цифра,
  // выведенная из текста про метрики и бренды.
  const visual = await analyzeVisualOnly(screenshots, screenshotMeta);
  if (visual) {
    base.scores.visualStrength = visual.score;
    base.scoreExplanations.visualStrength = visual.explanation;
    base.visualLevel = visual.level ?? undefined;
    base.interfaceIndexes = visual.interfaceIndexes;
    if (candidateId) {
      // Картинки со страницы лучше снимков экрана: цельная работа вместо
      // куска прокрутки с обрывком текста. Снимки — запасной путь для
      // страниц, где интерфейс нарисован вёрсткой (Notion и подобные).
      base.interfaceShots =
        pageImages && pageImages.length > 0
          ? savePageImages(candidateId, pageImages)
          : visual.interfaceIndexes.length > 0
            ? saveInterfaceShots(
                candidateId,
                screenshots,
                screenshotMeta,
                visual.interfaceIndexes,
              )
            : [];
    }
  }

  return { ...base, model: answer.model, modelFallback: answer.fallback };
}

/**
 * Анализирует портфолио коммуникационного/брендингового дизайнера.
 * Использует рубрик с 7 коммуникационными шкалами.
 */
export async function analyzePortfolioComm(
  scrapedText: string,
  screenshots: Buffer[],
  context?: { name?: string; role?: string; grade?: string },
  screenshotMeta?: ScreenshotMeta[],
): Promise<CommPortfolioAnalysis> {
  const text = scrapedText?.trim() ?? "";
  const hasText = text.length > 50;
  const hasScreenshots = screenshots && screenshots.length > 0;

  if (!hasText && !hasScreenshots) {
    throw new PortfolioAnalyzerError(
      "Нет данных для анализа портфолио (ни текста, ни скриншотов)",
    );
  }

  const prompt = buildPortfolioAnalyzeCommPrompt(text, context);

  // Промпт первым — задача до данных.
  const parts: Part[] = [{ text: prompt }];

  if (hasScreenshots) {
    const built = buildScreenshotParts(screenshots, screenshotMeta);
    parts.push(...built.parts);
    console.log(
      `[portfolio-analyzer-comm] sending ${built.sentCount} screenshots ` +
        `(total: ${screenshots.length}, кейсов охвачено: ${built.caseCount})`,
    );
  }

  let rawResponse: string;
  let answer: GeminiAnswer = { text: "", model: PRIMARY_MODEL, fallback: false };
  try {
    answer = await callGeminiWithModel(parts);
    rawResponse = answer.text;
  } catch (error) {
    if (error instanceof ClaudeServiceError) {
      throw new PortfolioAnalyzerError(error.message, error);
    }
    throw new PortfolioAnalyzerError(
      "Ошибка вызова Gemini API при анализе портфолио (comm)",
      error,
    );
  }

  rawResponse = rawResponse
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    const repaired = repairTruncatedJson(rawResponse);
    try {
      parsed = JSON.parse(repaired);
      console.warn("[portfolio-analyzer-comm] JSON был обрезан — использован частичный результат");
    } catch {
      throw new PortfolioAnalyzerError(
        `AI вернул невалидный JSON (comm). Модель ${answer.model}, остановилась: ${answer.finishReason ?? "неизвестно"}, длина ${rawResponse.length}.\nНачало: ${rawResponse.slice(0, 200)}\nКонец: ${rawResponse.slice(-200)}`,
      );
    }
  }

  return {
    ...normalizeCommAnalysis(parsed, hasScreenshots ? Math.min(screenshots.length, MAX_IMAGES) : 0),
    model: answer.model,
    modelFallback: answer.fallback,
  };
}

/**
 * Берём первые 4 скриншота (главная) + равномерно распределённые из остальных.
 * Так получаем картину «обложка + срез из всех кейсов» вместо «20 из первого кейса».
 */
function pickScreenshots(screenshots: Buffer[], max: number): Buffer[] {
  if (screenshots.length <= max) return screenshots;

  const HEAD_KEEP = 4; // первые 4 — главная страница
  const tail = screenshots.slice(HEAD_KEEP);
  const tailQuota = max - HEAD_KEEP;
  const step = Math.max(1, Math.floor(tail.length / tailQuota));

  const result: Buffer[] = screenshots.slice(0, HEAD_KEEP);
  for (let i = 0; i < tail.length && result.length < max; i += step) {
    result.push(tail[i]);
  }
  return result.slice(0, max);
}

// ── Shared helpers ────────────────────────────────────────────────────

const clampScore = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strArr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
    : [];

function parseCases(raw: unknown): PortfolioCase[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((c) => {
    const co = (c ?? {}) as Record<string, unknown>;
    return {
      title: str(co.title) || "Без названия",
      description: str(co.description),
      strengths: strArr(co.strengths),
      concerns: strArr(co.concerns),
    };
  });
}

/**
 * Нормализует ответ AI для продуктового рубрика.
 */
function normalizeAnalysis(raw: unknown, screenshotsAnalyzed: number): PortfolioAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scoresRaw = (r.scores ?? {}) as Record<string, unknown>;
  const explanationsRaw = (r.scoreExplanations ?? {}) as Record<string, unknown>;

  const productScoreKeys = [
    "visualStrength",
    "uxStrength",
    "productMaturity",
    "systemThinking",
    "argumentationQuality",
    "metricsImpact",
    "researchDepth",
  ] as const;

  const scores = Object.fromEntries(
    productScoreKeys.map((k) => [k, clampScore(scoresRaw[k])]),
  ) as unknown as PortfolioScores;

  const scoreExplanations = Object.fromEntries(
    productScoreKeys.map((k) => [k, str(explanationsRaw[k])]),
  ) as unknown as Record<keyof PortfolioScores, string>;

  return {
    direction: "product",
    scores,
    scoreExplanations,
    cases: parseCases(r.cases),
    overallAssessment: str(r.overallAssessment),
    redFlags: strArr(r.redFlags),
    strengths: strArr(r.strengths),
    concerns: strArr(r.concerns),
    screenshotsAnalyzed,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Нормализует ответ AI для коммуникационного рубрика.
 */
function normalizeCommAnalysis(raw: unknown, screenshotsAnalyzed: number): CommPortfolioAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scoresRaw = (r.scores ?? {}) as Record<string, unknown>;
  const explanationsRaw = (r.scoreExplanations ?? {}) as Record<string, unknown>;

  const commScoreKeys = [
    "visualCraft",
    "conceptStrength",
    "typography",
    "brandSystems",
    "styleRange",
    "presentation",
    "trendRelevance",
  ] as const;

  const scores = Object.fromEntries(
    commScoreKeys.map((k) => [k, clampScore(scoresRaw[k])]),
  ) as unknown as CommPortfolioScores;

  const scoreExplanations = Object.fromEntries(
    commScoreKeys.map((k) => [k, str(explanationsRaw[k])]),
  ) as unknown as Record<keyof CommPortfolioScores, string>;

  return {
    direction: "communication",
    scores,
    scoreExplanations,
    cases: parseCases(r.cases),
    overallAssessment: str(r.overallAssessment),
    redFlags: strArr(r.redFlags),
    strengths: strArr(r.strengths),
    concerns: strArr(r.concerns),
    screenshotsAnalyzed,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Простой ремонт обрезанного JSON: дозакрываем строки и скобки.
 * Скопировано из claude.ts чтобы не плодить экспорт.
 */
function repairTruncatedJson(raw: string): string {
  let inString = false;
  let escape = false;
  const openBrackets: string[] = [];

  for (const ch of raw) {
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; }
      else if (ch === '"') { inString = false; }
      continue;
    }
    switch (ch) {
      case '"': inString = true; break;
      case "{": openBrackets.push("}"); break;
      case "[": openBrackets.push("]"); break;
      case "}": case "]": openBrackets.pop(); break;
    }
  }

  let result = raw.trimEnd();
  if (inString) result += '"';
  result = result.replace(/,\s*$/, "");
  result += openBrackets.reverse().join("");
  return result;
}
