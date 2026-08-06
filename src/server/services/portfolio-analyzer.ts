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
import { callGemini, ClaudeServiceError } from "./claude";
import { buildPortfolioAnalyzePrompt } from "../prompts/portfolio-analyze";
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
 * Анализирует портфолио продуктового дизайнера: текст + скриншоты → оценка по 7 продуктовым шкалам.
 */
export async function analyzePortfolio(
  scrapedText: string,
  screenshots: Buffer[],
  context?: { name?: string; role?: string; grade?: string },
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

  // Gemini поддерживает до 20 изображений за запрос. Приоритезируем скриншоты
  // кейсов (они идут после основной страницы в порядке сборки скрейпером).
  const MAX_IMAGES = 20;
  const parts: Part[] = [];

  if (hasScreenshots) {
    const selected = pickScreenshots(screenshots, MAX_IMAGES);
    for (const screenshot of selected) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: screenshot.toString("base64"),
        },
      });
    }
    console.log(
      `[portfolio-analyzer] sending ${selected.length} screenshots (total: ${screenshots.length})`,
    );
  }

  parts.push({ text: prompt });

  let rawResponse: string;
  try {
    rawResponse = await callGemini(parts);
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
        `AI вернул невалидный JSON: ${rawResponse.slice(0, 300)}...`,
      );
    }
  }

  return normalizeAnalysis(parsed, hasScreenshots ? Math.min(screenshots.length, MAX_IMAGES) : 0);
}

/**
 * Анализирует портфолио коммуникационного/брендингового дизайнера.
 * Использует рубрик с 7 коммуникационными шкалами.
 */
export async function analyzePortfolioComm(
  scrapedText: string,
  screenshots: Buffer[],
  context?: { name?: string; role?: string; grade?: string },
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

  const MAX_IMAGES = 20;
  const parts: Part[] = [];

  if (hasScreenshots) {
    const selected = pickScreenshots(screenshots, MAX_IMAGES);
    for (const screenshot of selected) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: screenshot.toString("base64"),
        },
      });
    }
    console.log(
      `[portfolio-analyzer-comm] sending ${selected.length} screenshots (total: ${screenshots.length})`,
    );
  }

  parts.push({ text: prompt });

  let rawResponse: string;
  try {
    rawResponse = await callGemini(parts);
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
        `AI вернул невалидный JSON (comm): ${rawResponse.slice(0, 300)}...`,
      );
    }
  }

  return normalizeCommAnalysis(parsed, hasScreenshots ? Math.min(screenshots.length, MAX_IMAGES) : 0);
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
