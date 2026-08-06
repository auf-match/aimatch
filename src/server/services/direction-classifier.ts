/**
 * Direction Classifier.
 *
 * Определяет направление портфолио дизайнера: продуктовый (product) или
 * коммуникационный (communication). Используется для ролей ART_DIRECTOR,
 * DESIGN_LEAD и OTHER, где направление неочевидно из заявленной роли.
 *
 * Для однозначных ролей (PRODUCT_DESIGNER, UX_DESIGNER и т.д.) возвращает
 * результат без вызова AI — confidence 100.
 */

import { Part } from "@google/generative-ai";
import { callGemini, ClaudeServiceError } from "./claude";
import { buildDirectionClassifyPrompt } from "../prompts/direction-classify";

export type DesignDirection = "product" | "communication";

export interface DirectionClassification {
  direction: DesignDirection;
  confidence: number;
  reasoning: string;
  /** true если направление определено по роли без вызова AI */
  isAutoDetected: boolean;
}

// Роли, однозначно указывающие на продуктовое направление
const PRODUCT_ROLES = new Set([
  "PRODUCT_DESIGNER",
  "UX_DESIGNER",
  "UI_DESIGNER",
  "UX_RESEARCHER",
]);

// Роли, однозначно указывающие на коммуникационное направление
const COMM_ROLES = new Set([
  "COMMUNICATION_DESIGNER",
  "BRAND_DESIGNER",
  "MOTION_DESIGNER",
]);

// Роли, требующие классификации по портфолио
const AMBIGUOUS_ROLES = new Set([
  "ART_DIRECTOR",
  "DESIGN_LEAD",
  "OTHER",
]);

/**
 * Определяет направление дизайнера.
 *
 * @param scrapedText — текст портфолио
 * @param screenshots — скриншоты портфолио (для Gemini Vision)
 * @param role — роль из Prisma enum (например "PRODUCT_DESIGNER")
 * @param context — дополнительный контекст для промпта
 */
export async function classifyDirection(
  scrapedText: string,
  screenshots: Buffer[],
  role: string,
  context?: { grade?: string },
): Promise<DirectionClassification> {
  // Однозначные продуктовые роли
  if (PRODUCT_ROLES.has(role)) {
    return {
      direction: "product",
      confidence: 100,
      reasoning: `Роль ${role} однозначно относится к продуктовому дизайну.`,
      isAutoDetected: true,
    };
  }

  // Однозначные коммуникационные роли
  if (COMM_ROLES.has(role)) {
    return {
      direction: "communication",
      confidence: 100,
      reasoning: `Роль ${role} однозначно относится к коммуникационному дизайну.`,
      isAutoDetected: true,
    };
  }

  // Неоднозначные роли — классифицируем по портфолио
  if (!AMBIGUOUS_ROLES.has(role)) {
    // Неизвестная роль — по умолчанию продуктовый с низкой уверенностью
    console.warn(`[direction-classifier] Неизвестная роль "${role}", использую product по умолчанию`);
    return {
      direction: "product",
      confidence: 50,
      reasoning: `Неизвестная роль "${role}". Использован продуктовый рубрик по умолчанию.`,
      isAutoDetected: true,
    };
  }

  // Вызываем Gemini для классификации
  const prompt = buildDirectionClassifyPrompt(scrapedText, {
    role,
    grade: context?.grade,
  });

  const parts: Part[] = [];

  // Передаём часть скриншотов для визуальной классификации
  const MAX_IMAGES = 8; // меньше чем для полного анализа — нам нужна только классификация
  if (screenshots.length > 0) {
    const selected = screenshots.slice(0, MAX_IMAGES);
    for (const screenshot of selected) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: screenshot.toString("base64"),
        },
      });
    }
  }

  parts.push({ text: prompt });

  let rawResponse: string;
  try {
    rawResponse = await callGemini(parts);
  } catch (error) {
    if (error instanceof ClaudeServiceError) {
      throw new Error(`Ошибка классификации направления: ${error.message}`);
    }
    throw new Error("Ошибка вызова Gemini при классификации направления");
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
    console.error(`[direction-classifier] Невалидный JSON: ${rawResponse.slice(0, 200)}`);
    // Фолбэк: продуктовый с низкой уверенностью
    return {
      direction: "product",
      confidence: 30,
      reasoning: "Не удалось распознать ответ AI. Использован продуктовый рубрик по умолчанию.",
      isAutoDetected: false,
    };
  }

  const r = (parsed ?? {}) as Record<string, unknown>;
  const direction: DesignDirection =
    r.direction === "communication" ? "communication" : "product";
  const confidence = Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 50)));
  const reasoning = typeof r.reasoning === "string" ? r.reasoning.trim() : "";

  return {
    direction,
    confidence,
    reasoning,
    isAutoDetected: false,
  };
}

/**
 * Проверяет, нужна ли ручная классификация.
 * Возвращает true если роль неоднозначна и confidence < threshold.
 */
export function needsManualClassification(
  classification: DirectionClassification,
  confidenceThreshold = 70,
): boolean {
  return !classification.isAutoDetected && classification.confidence < confidenceThreshold;
}
