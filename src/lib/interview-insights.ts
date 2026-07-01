import { nanoid } from "nanoid";

export const INSIGHT_CATEGORIES = [
  "leadFocusAreas",
  "leadQuestions",
  "candidateTips",
  "prescreeningQuestions",
] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<InsightCategory, string> = {
  leadFocusAreas:        "Фокусы лида",
  leadQuestions:         "Вопросы лида",
  candidateTips:         "Советы кандидату",
  prescreeningQuestions: "Вопросы на прескрининг",
};

export interface InsightItem {
  id: string;
  text: string;
  important: boolean;
  hidden: boolean;
  origin: "ai" | "manual";
  sourceInterviewId?: string;
  createdAt: string;
}

export type Insights = Record<InsightCategory, InsightItem[]>;
export type AiSuggestions = Record<InsightCategory, string[]>;

export function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

export function emptyInsights(): Insights {
  return {
    leadFocusAreas: [],
    leadQuestions: [],
    candidateTips: [],
    prescreeningQuestions: [],
  };
}

/**
 * Мержит AI-предложения в существующие инсайты.
 * Дедуп по normalizeText(existing.text) === normalizeText(new).
 * Существующие item'ы не изменяются (сохраняется id, text, флаги).
 */
export function mergeInsights(
  current: Insights,
  suggestions: AiSuggestions,
  sourceInterviewId: string,
  now: Date,
): Insights {
  const result = emptyInsights();
  for (const cat of INSIGHT_CATEGORIES) {
    const existing = current[cat] ?? [];
    const existingNormalized = new Set(existing.map((i) => normalizeText(i.text)));
    const additions: InsightItem[] = [];
    for (const raw of suggestions[cat] ?? []) {
      const key = normalizeText(raw);
      if (!key) continue;
      if (existingNormalized.has(key)) continue;
      existingNormalized.add(key);
      additions.push({
        id: nanoid(),
        text: raw.trim(),
        important: false,
        hidden: false,
        origin: "ai",
        sourceInterviewId,
        createdAt: now.toISOString(),
      });
    }
    result[cat] = [...existing, ...additions];
  }
  return result;
}

/** Сортирует item'ы категории для показа: важные сверху, потом createdAt desc. */
export function sortForDisplay(items: InsightItem[]): {
  visible: InsightItem[];
  hidden: InsightItem[];
} {
  const visible: InsightItem[] = [];
  const hidden: InsightItem[] = [];
  for (const i of items) (i.hidden ? hidden : visible).push(i);
  const cmp = (a: InsightItem, b: InsightItem) => {
    if (a.important !== b.important) return a.important ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  };
  visible.sort(cmp);
  hidden.sort(cmp);
  return { visible, hidden };
}

export function countForBadge(items: InsightItem[]): {
  total: number;
  hidden: number;
  important: number;
} {
  let hidden = 0, important = 0;
  for (const i of items) {
    if (i.hidden) hidden++;
    if (i.important) important++;
  }
  return { total: items.length, hidden, important };
}
