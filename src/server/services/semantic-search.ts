/**
 * Semantic Search — гибридный поиск кандидатов «найди как».
 *
 * Поток:
 *   1. LLM разбирает запрос → жёсткие фильтры + семантический текст
 *   2. SQL-предфильтр по жёстким критериям (роль, грейд, локация, bigtech)
 *   3. Эмбеддинг семантического текста (Gemini)
 *   4. Cosine-сходство в приложении против Candidate.embedding
 *   5. Сортировка по убыванию, top-K
 *
 * Кандидаты без эмбеддинга не отсеиваются жёстко: они идут в конце с пометкой
 * indexed=false (нужен backfill).
 */

import { prisma } from "@/server/db";
import { Prisma, type CandidateRole, type Grade } from "@prisma/client";
import { callGemini, ClaudeServiceError } from "./claude";
import { generateEmbedding } from "./embeddings";
import { buildSearchParsePrompt } from "../prompts/search-parse";

export interface ParsedSearchQuery {
  roles: string[] | null;
  grades: string[] | null;
  location: string | null;
  hasBigtech: true | null;
  semanticQuery: string;
  interpretation: string;
}

export interface SearchResultItem {
  id: string;
  score: number; // 0-100, нормализованное cosine-сходство
  indexed: boolean; // есть ли у кандидата эмбеддинг
}

export interface SemanticSearchResult {
  parsed: ParsedSearchQuery;
  results: SearchResultItem[];
  stats: { totalAfterFilter: number; indexed: number; notIndexed: number };
}

const VALID_ROLES = new Set<string>([
  "PRODUCT_DESIGNER", "UX_DESIGNER", "UI_DESIGNER", "COMMUNICATION_DESIGNER",
  "UX_RESEARCHER", "DESIGN_LEAD", "ART_DIRECTOR", "BRAND_DESIGNER",
  "MOTION_DESIGNER", "OTHER",
]);
const VALID_GRADES = new Set<string>([
  "JUNIOR", "MIDDLE", "MIDDLE_PLUS", "SENIOR", "SENIOR_PLUS", "LEAD", "HEAD",
]);

/** Разбирает поисковый запрос через LLM. Фолбэк: всё в semanticQuery. */
export async function parseSearchQuery(query: string): Promise<ParsedSearchQuery> {
  const prompt = buildSearchParsePrompt(query);

  let raw: string;
  try {
    raw = await callGemini([{ text: prompt }]);
  } catch (error) {
    if (error instanceof ClaudeServiceError) {
      // Фолбэк: используем сырой запрос как семантику без фильтров
      console.warn("[semantic-search] LLM-разбор не удался, фолбэк на сырой запрос");
      return { roles: null, grades: null, location: null, hasBigtech: null, semanticQuery: query, interpretation: query };
    }
    throw error;
  }

  raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.warn("[semantic-search] невалидный JSON от LLM, фолбэк на сырой запрос");
    return { roles: null, grades: null, location: null, hasBigtech: null, semanticQuery: query, interpretation: query };
  }

  // Валидация и санация
  const roles = Array.isArray(parsed.roles)
    ? (parsed.roles as unknown[]).map(String).filter((r) => VALID_ROLES.has(r))
    : null;
  const grades = Array.isArray(parsed.grades)
    ? (parsed.grades as unknown[]).map(String).filter((g) => VALID_GRADES.has(g))
    : null;

  return {
    roles: roles && roles.length > 0 ? roles : null,
    grades: grades && grades.length > 0 ? grades : null,
    location: typeof parsed.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
    hasBigtech: parsed.hasBigtech === true ? true : null,
    semanticQuery: typeof parsed.semanticQuery === "string" && parsed.semanticQuery.trim()
      ? parsed.semanticQuery.trim()
      : query,
    interpretation: typeof parsed.interpretation === "string" ? parsed.interpretation.trim() : "",
  };
}

/** Косинусное сходство двух векторов. Возвращает [-1, 1]. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return -1;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Главная функция семантического поиска.
 *
 * @param query — естественно-языковой запрос рекрутера
 * @param limit — сколько результатов вернуть (default 30)
 */
export async function semanticSearch(query: string, limit = 30): Promise<SemanticSearchResult> {
  const parsed = await parseSearchQuery(query);

  // 1. SQL-предфильтр по жёстким критериям
  const where: Prisma.CandidateWhereInput = {};
  if (parsed.roles) where.role = { in: parsed.roles as CandidateRole[] };
  if (parsed.grades) where.grade = { in: parsed.grades as Grade[] };
  if (parsed.location) where.location = { contains: parsed.location, mode: "insensitive" };
  if (parsed.hasBigtech) where.hasBigtechExperience = true;

  const candidates = await prisma.candidate.findMany({
    where,
    select: { id: true, embedding: true },
  });

  const totalAfterFilter = candidates.length;

  // 2. Эмбеддинг семантического запроса
  const queryVec = await generateEmbedding(parsed.semanticQuery, "query");

  // 3. Cosine-ранжирование
  const scored: SearchResultItem[] = [];
  const notIndexed: SearchResultItem[] = [];

  for (const c of candidates) {
    if (c.embedding && c.embedding.length > 0) {
      const sim = cosineSimilarity(queryVec, c.embedding);
      // cosine [-1,1] → [0,100]; на практике для эмбеддингов сходство ~[0.3, 0.9]
      const score = Math.round(Math.max(0, sim) * 100);
      scored.push({ id: c.id, score, indexed: true });
    } else {
      notIndexed.push({ id: c.id, score: 0, indexed: false });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const results = [...scored, ...notIndexed].slice(0, limit);

  return {
    parsed,
    results,
    stats: { totalAfterFilter, indexed: scored.length, notIndexed: notIndexed.length },
  };
}
