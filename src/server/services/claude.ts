import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { buildResumeParsePrompt } from "../prompts/resume-parse";
import { buildVacancyParsePrompt } from "../prompts/vacancy-parse";
import { CandidateData } from "../types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Models in priority order — fallback if primary is overloaded.
// Verified available with current free-tier API key (тестировал 2026-04).
// gemini-2.5-flash-lite has highest availability on free tier — proven to work
// when other models return 503/429.
// Основную модель можно подменить через окружение: оценка визуала требует
// старшей модели, а разбор текста прекрасно идёт на flash. Без переменной
// список остаётся прежним.
const MODEL_PRIORITY = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-2.5-flash-lite"]
  : [
  "gemini-2.5-flash",        // best quality, but often 503 in peak hours
  "gemini-2.5-flash-lite",   // reliable fallback, lighter model, more free quota
  "gemini-flash-latest",     // alias — may resolve to a working version
  "gemini-flash-lite-latest", // last-resort lite alias
];

export class ClaudeServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ClaudeServiceError";
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyError(error: unknown): "overloaded" | "quota_daily" | "quota_minute" | "not_found" | "fatal" {
  if (!error || typeof error !== "object") return "fatal";
  const e = error as { status?: number; message?: string };
  const msg = e.message ?? "";

  if (e.status === 503 || e.status === 500) return "overloaded";
  if (e.status === 404) return "not_found";
  if (e.status === 429) {
    // Daily quota exhausted: limit is 0 or "per day" in message
    if (msg.includes("limit: 0") || msg.includes("PerDay")) return "quota_daily";
    return "quota_minute";
  }
  return "fatal";
}

/**
 * Call Gemini with retry + model fallback.
 * Strategy: try each model ONCE first, then loop back for an extra retry on overloaded ones.
 * This way we quickly fall through to a working model instead of waiting on the same broken one.
 */
/** Какая модель на самом деле ответила и была ли она основной. */
export interface GeminiAnswer {
  text: string;
  model: string;
  /** true, если основная модель была недоступна и отвечала запасная */
  fallback: boolean;
  /**
   * Почему модель остановилась. STOP — договорила сама; MAX_TOKENS —
   * ответ оборван на полуслове. Без этого признака обрыв неотличим от
   * мусора: и то и другое приходит как «невалидный JSON».
   */
  finishReason?: string;
}

/** Основная модель. Ответ любой другой означает, что она была недоступна. */
export const PRIMARY_MODEL = MODEL_PRIORITY[0];

/**
 * Совместимая обёртка: отдаёт только текст.
 *
 * Оставлена, потому что вызовов два с лишним десятка, и подмена модели
 * важна не всем. Там, где результат сохраняется надолго и потом влияет
 * на решение по человеку, зовите callGeminiWithModel и записывайте модель.
 */
export async function callGemini(parts: Part[]): Promise<string> {
  return (await callGeminiWithModel(parts)).text;
}

export async function callGeminiWithModel(parts: Part[]): Promise<GeminiAnswer> {
  const errors: string[] = [];
  const overloaded: string[] = []; // models worth retrying after the round-robin
  let rateLimitWait = 0; // longest required per-minute wait, used as global backoff

  // Pass 1: try every model once, fast
  for (const modelName of MODEL_PRIORITY) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          // JSON-ответ на резюме + портфолио может быть 4000+ токенов.
          // gemini-2.5-flash поддерживает до 65536 output tokens.
          maxOutputTokens: 16384,
          temperature: 0.1,
        },
      });
      const result = await model.generateContent(parts);
      const finishReason = result.response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== "STOP" && finishReason !== "FINISH_REASON_UNSPECIFIED") {
        console.warn(`[gemini] ${modelName} finishReason=${finishReason} — ответ может быть обрезан`);
      }
      if (modelName !== PRIMARY_MODEL) {
        console.log(`[gemini] Used fallback model: ${modelName}`);
      }
      return {
        text: result.response.text(),
        model: modelName,
        fallback: modelName !== PRIMARY_MODEL,
        finishReason,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const kind = classifyError(error);
      errors.push(`${modelName}: [${kind}] ${msg.slice(0, 100)}`);
      console.warn(`[gemini] ${modelName} (${kind})`);

      if (kind === "overloaded") overloaded.push(modelName);
      if (kind === "quota_minute") {
        const retryMatch = msg.match(/"retryDelay":"(\d+)s"/);
        const waitMs = retryMatch ? parseInt(retryMatch[1]) * 1000 : 30000;
        rateLimitWait = Math.max(rateLimitWait, waitMs);
        overloaded.push(modelName); // also worth retrying after the wait
      }
      // quota_daily / not_found / fatal — skip permanently
    }
  }

  // Pass 2: retry overloaded models after a backoff
  if (overloaded.length > 0) {
    const wait = rateLimitWait || 5000;
    console.log(`[gemini] All models failed, waiting ${wait / 1000}s before retry...`);
    await sleep(wait);

    for (const modelName of overloaded) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { maxOutputTokens: 16384, temperature: 0.1 },
        });
        const result = await model.generateContent(parts);
        const finishReason = result.response.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== "STOP" && finishReason !== "FINISH_REASON_UNSPECIFIED") {
          console.warn(`[gemini] ${modelName} (retry) finishReason=${finishReason}`);
        }
        console.log(`[gemini] Retry succeeded with: ${modelName}`);
        return {
          text: result.response.text(),
          model: modelName,
          // Со второго захода даже основная модель означает, что первый
          // раз она не ответила — результат стоит перепроверить
          fallback: true,
          finishReason,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${modelName} (retry): ${msg.slice(0, 100)}`);
      }
    }
  }

  throw new ClaudeServiceError(
    `Gemini API недоступен. Все модели вернули ошибку.\n\nДетали:\n${errors.join("\n")}`,
  );
}

/**
 * Пытается «закрыть» обрезанный JSON через state machine.
 * Правильно отслеживает: внутри строки / escape / открытые скобки.
 */
function repairTruncatedJson(raw: string): string {
  // Шаг 1: пройтись по строке и понять состояние в конце
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
    // Не в строке
    switch (ch) {
      case '"': inString = true; break;
      case "{": openBrackets.push("}"); break;
      case "[": openBrackets.push("]"); break;
      case "}": case "]": openBrackets.pop(); break;
    }
  }

  let result = raw.trimEnd();

  // Шаг 2: если обрезало внутри строки — закрываем её
  if (inString) {
    result += '"';
  }

  // Шаг 3: убрать trailing запятую (перед закрывающими скобками)
  result = result.replace(/,\s*$/, "");

  // Шаг 4: закрыть все открытые { и [
  result += openBrackets.reverse().join("");

  return result;
}

// Допустимые значения enum-ов CandidateRole / Grade (см. prisma/schema.prisma).
// Нужны, чтобы отсеять выдуманные AI значения до записи в БД.
const VALID_ROLES = new Set<string>([
  "PRODUCT_DESIGNER",
  "UX_DESIGNER",
  "UI_DESIGNER",
  "COMMUNICATION_DESIGNER",
  "UX_RESEARCHER",
  "DESIGN_LEAD",
  "ART_DIRECTOR",
  "BRAND_DESIGNER",
  "MOTION_DESIGNER",
  "OTHER",
]);
const VALID_GRADES = new Set<string>([
  "JUNIOR",
  "MIDDLE",
  "MIDDLE_PLUS",
  "SENIOR",
  "SENIOR_PLUS",
  "LEAD",
  "HEAD",
]);

export async function parseResume(
  fileContent: string | Buffer,
  fileType: "pdf" | "docx",
  pdfBuffer?: Buffer,
  portfolioScreenshots?: Buffer[],
): Promise<CandidateData> {
  const text =
    typeof fileContent === "string" ? fileContent : fileContent.toString("utf-8");

  const hasText = text.trim().length > 50;
  const canSendPdfDirect = fileType === "pdf" && pdfBuffer;
  const hasScreenshots = portfolioScreenshots && portfolioScreenshots.length > 0;

  if (!hasText && !canSendPdfDirect && !hasScreenshots) {
    throw new ClaudeServiceError("Пустое содержимое резюме");
  }

  const prompt = buildResumeParsePrompt(hasText ? text : "");

  const parts: Part[] = [];

  if (canSendPdfDirect) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBuffer.toString("base64"),
      },
    });
  }

  if (hasScreenshots) {
    // Gemini supports up to 20 images; PDF already takes 1 slot if present
    const maxImages = canSendPdfDirect ? 18 : 20;
    for (const screenshot of portfolioScreenshots.slice(0, maxImages)) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: screenshot.toString("base64"),
        },
      });
    }
    console.log(`[gemini] sending ${Math.min(portfolioScreenshots.length, maxImages)} screenshots (total scraped: ${portfolioScreenshots.length})`);
  }

  parts.push({ text: prompt });

  let rawResponse: string;
  try {
    rawResponse = await callGemini(parts);
  } catch (error) {
    if (error instanceof ClaudeServiceError) throw error;
    throw new ClaudeServiceError("Ошибка вызова Gemini API", error);
  }

  // Убрать markdown обёртку если Gemini вернул ```json...```
  rawResponse = rawResponse.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
  console.log(`[gemini] parseResume raw response length: ${rawResponse.length} chars`);

  let parsed: CandidateData;
  try {
    parsed = JSON.parse(rawResponse) as CandidateData;
  } catch {
    // JSON мог обрезаться — попробуем «закрыть» его и распарсить частично
    console.warn(`[gemini] JSON parse failed, attempting repair. Last 100 chars: ...${rawResponse.slice(-100)}`);
    const repaired = repairTruncatedJson(rawResponse);
    try {
      parsed = JSON.parse(repaired) as CandidateData;
      console.warn("[gemini] JSON был обрезан — использован частичный результат");
    } catch {
      throw new ClaudeServiceError(
        `AI вернул невалидный JSON: ${rawResponse.slice(0, 300)}...`,
      );
    }
  }

  // Fallback defaults for portfolio-only parsing where AI correctly leaves fields null
  if (!parsed.name) parsed.name = "Без имени";

  // Валидация enum: AI иногда выдумывает роль/грейд, которых нет в схеме
  // (напр. "SENIOR_UX_UI_DESIGNER"), и тогда prisma.update падает, теряя весь
  // оплаченный parseResume. Невалидное значение → безопасный дефолт.
  if (!parsed.role || !VALID_ROLES.has(parsed.role)) {
    parsed.role = "OTHER" as CandidateData["role"];
  }
  if (!parsed.grade || !VALID_GRADES.has(parsed.grade)) {
    parsed.grade = "MIDDLE" as CandidateData["grade"];
  }

  return parsed;
}

export interface VacancyData {
  title: string;
  clientName?: string | null;
  clientLead?: string | null;
  productDescription?: string | null;
  reasonForHiring?: string | null;
  role: string;
  grade: string;
  designersNeeded: number;
  employmentType: string;
  workFormat: string;
  location?: string | null;
  timezone?: string | null;
  salaryRange?: string | null;
  desiredStartDate?: string | null;
  duration?: string | null;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  needsInternational: boolean;
  specialCompetencies: string[];
  redFlags: string[];
  portfolioReferences: string[];
  teamComposition?: string | null;
  decisionMaker?: string | null;
  hiringStages?: number | null;
  testTask?: string | null;
  scoringCriteria: { criterion: string; weight: number; type: string }[];
  clientNotes?: string | null;
  internalNotes?: string | null;
}

export async function parseVacancy(
  text: string,
  pdfBuffer?: Buffer,
): Promise<VacancyData> {
  const hasText = text.trim().length > 50;

  if (!hasText && !pdfBuffer) {
    throw new ClaudeServiceError("Пустое содержимое документа");
  }

  const prompt = buildVacancyParsePrompt(hasText ? text : "");

  const parts: Part[] = [];

  if (pdfBuffer) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBuffer.toString("base64"),
      },
    });
  }

  parts.push({ text: prompt });

  let rawResponse: string;
  try {
    rawResponse = await callGemini(parts);
  } catch (error) {
    if (error instanceof ClaudeServiceError) throw error;
    throw new ClaudeServiceError("Ошибка вызова Gemini API", error);
  }

  rawResponse = rawResponse.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");

  let parsed: VacancyData;
  try {
    parsed = JSON.parse(rawResponse) as VacancyData;
  } catch {
    throw new ClaudeServiceError(
      `AI вернул невалидный JSON: ${rawResponse.slice(0, 200)}...`,
    );
  }

  if (!parsed.title || !parsed.role || !parsed.grade) {
    throw new ClaudeServiceError(
      "AI не извлёк обязательные поля (title, role, grade)",
    );
  }

  return parsed;
}
