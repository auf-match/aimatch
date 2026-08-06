/**
 * Embeddings service — семантические векторы для кандидатов и поисковых запросов.
 *
 * Используется Gemini text-embedding-004 (768 измерений) через тот же
 * GEMINI_API_KEY, что и остальной AI-функционал. Никакого нового вендора.
 *
 * Векторы хранятся в Candidate.embedding (Float[]). Поиск — cosine в приложении
 * (см. semantic-search.ts), поэтому здесь только генерация векторов и
 * сборка текста-профиля кандидата.
 */

import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

/** Модель эмбеддингов. gemini-embedding-001 поддерживает MRL-усечение размерности. */
export const EMBEDDING_MODEL = "gemini-embedding-001";
/** Усечённая размерность (MRL). 768 — баланс качества и объёма данных из БД. */
export const EMBEDDING_DIMS = 768;

// Ленивая инициализация: читаем ключ при первом вызове, а не при импорте модуля.
// Так env успевает загрузиться (важно для tsx-скриптов с dotenv).
let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  }
  return _genAI;
}

export class EmbeddingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "EmbeddingError";
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** L2-нормализация вектора (нужна после MRL-усечения gemini-embedding-001). */
function normalize(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

/**
 * Генерирует вектор для одного текста.
 *
 * @param text — текст для векторизации
 * @param taskType — RETRIEVAL_DOCUMENT для профилей кандидатов,
 *                   RETRIEVAL_QUERY для поисковых запросов (улучшает качество ретрива)
 */
export async function generateEmbedding(
  text: string,
  taskType: "document" | "query" = "document",
): Promise<number[]> {
  const clean = (text ?? "").trim();
  if (!clean) {
    throw new EmbeddingError("Пустой текст для эмбеддинга");
  }

  const model = getGenAI().getGenerativeModel({ model: EMBEDDING_MODEL });
  const tt = taskType === "query" ? TaskType.RETRIEVAL_QUERY : TaskType.RETRIEVAL_DOCUMENT;

  // 2 попытки с бэкоффом на случай 429/503
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // outputDimensionality поддерживается REST API gemini-embedding-001,
      // но отсутствует в типах SDK — передаём через cast.
      const result = await model.embedContent({
        content: { role: "user", parts: [{ text: clean.slice(0, 8000) }] },
        taskType: tt,
        outputDimensionality: EMBEDDING_DIMS,
      } as Parameters<typeof model.embedContent>[0]);
      const values = result.embedding?.values;
      if (!values || values.length === 0) {
        throw new EmbeddingError("Gemini вернул пустой вектор");
      }
      // При MRL-усечении вектор нужно нормализовать для корректного cosine.
      return normalize(values);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[embeddings] попытка ${attempt + 1} не удалась: ${msg.slice(0, 120)}`);
      if (attempt === 0) await sleep(2000);
    }
  }

  throw new EmbeddingError(
    `Не удалось сгенерировать эмбеддинг: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    lastError,
  );
}

/**
 * Поля кандидата, нужные для сборки текста-профиля.
 * Намеренно узкий тип — чтобы вызывать и из upload, и из backfill.
 */
export interface EmbeddingSourceCandidate {
  name?: string | null;
  role?: string | null;
  grade?: string | null;
  yearsOfExperience?: number | null;
  specializations?: string[];
  domains?: string[];
  segment?: string | null;
  platforms?: string[];
  skills?: string[];
  tools?: string[];
  location?: string | null;
  hasBigtechExperience?: boolean;
  hasStudioExperience?: boolean;
  hasInternationalExperience?: boolean;
  aiSummary?: string | null;
  aiStrengths?: string[];
  experiences?: { company?: string | null; role?: string | null; isBigtech?: boolean; isStudio?: boolean }[];
}

const ROLE_RU: Record<string, string> = {
  PRODUCT_DESIGNER: "продуктовый дизайнер",
  UX_DESIGNER: "UX-дизайнер",
  UI_DESIGNER: "UI-дизайнер",
  COMMUNICATION_DESIGNER: "коммуникационный дизайнер",
  UX_RESEARCHER: "UX-исследователь",
  DESIGN_LEAD: "дизайн-лид",
  ART_DIRECTOR: "арт-директор",
  BRAND_DESIGNER: "бренд-дизайнер",
  MOTION_DESIGNER: "моушн-дизайнер",
  OTHER: "дизайнер",
};

const GRADE_RU: Record<string, string> = {
  JUNIOR: "junior",
  MIDDLE: "middle",
  MIDDLE_PLUS: "middle+",
  SENIOR: "senior",
  SENIOR_PLUS: "senior+",
  LEAD: "lead",
  HEAD: "head",
};

/**
 * Собирает компактный текст-профиль кандидата для векторизации.
 * Включает только семантически значимые поля (что делает, в чём силён),
 * без числовых оценок портфолио — эмбеддинги кодируют их плохо.
 */
export function buildCandidateEmbeddingText(c: EmbeddingSourceCandidate): string {
  const lines: string[] = [];

  const role = c.role ? ROLE_RU[c.role] ?? c.role : "дизайнер";
  const grade = c.grade ? GRADE_RU[c.grade] ?? c.grade : "";
  const exp = c.yearsOfExperience != null ? `, опыт ${c.yearsOfExperience} лет` : "";
  lines.push(`Роль: ${role}${grade ? `, грейд ${grade}` : ""}${exp}.`);

  if (c.specializations?.length) lines.push(`Специализации: ${c.specializations.join(", ")}.`);

  const segPart = c.segment ? ` Сегмент: ${c.segment}.` : "";
  if (c.domains?.length) lines.push(`Домены: ${c.domains.join(", ")}.${segPart}`);
  else if (segPart) lines.push(segPart.trim());

  if (c.platforms?.length) lines.push(`Платформы: ${c.platforms.join(", ")}.`);
  if (c.skills?.length) lines.push(`Навыки: ${c.skills.join(", ")}.`);
  if (c.tools?.length) lines.push(`Инструменты: ${c.tools.join(", ")}.`);

  const flags: string[] = [];
  if (c.hasBigtechExperience) flags.push("опыт в bigtech");
  if (c.hasStudioExperience) flags.push("опыт в студии");
  if (c.hasInternationalExperience) flags.push("международный опыт");
  if (flags.length) lines.push(`Особенности: ${flags.join(", ")}.`);

  if (c.location) lines.push(`Локация: ${c.location}.`);

  if (c.experiences?.length) {
    const companies = c.experiences
      .slice(0, 8)
      .map((e) => {
        const tags = [e.isBigtech ? "BigTech" : "", e.isStudio ? "Studio" : ""].filter(Boolean).join("/");
        return `${e.company ?? "?"}${tags ? ` (${tags})` : ""}${e.role ? ` — ${e.role}` : ""}`;
      })
      .filter(Boolean);
    if (companies.length) lines.push(`Опыт: ${companies.join("; ")}.`);
  }

  if (c.aiStrengths?.length) lines.push(`Сильные стороны: ${c.aiStrengths.join(", ")}.`);
  if (c.aiSummary) lines.push(`О кандидате: ${c.aiSummary}`);

  return lines.join("\n");
}
