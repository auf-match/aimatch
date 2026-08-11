/**
 * Сервис обработки записи брифинга (Zoom) для создания вакансии.
 *
 * Два прохода:
 *   1. transcribeAudio — загружает аудио в Gemini Files API, дожидается ACTIVE,
 *      прогоняет через `briefing-transcribe` промпт → получает чистый транскрипт.
 *   2. parseVacancyFromTranscript — отдаёт транскрипт в `briefing-parse` →
 *      получает { summary, fields[] } со структурой для формы.
 *
 * Files API нужен потому, что часовая запись в .m4a весит 30-60MB,
 * а inlineData в Gemini ограничен ~20MB. Files API принимает до 2GB / 9.5ч.
 */
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import type { Part } from "@google/generative-ai";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

import { callGemini, ClaudeServiceError } from "./claude";
import { buildBriefingTranscribePrompt } from "../prompts/briefing-transcribe";
import { buildBriefingParsePrompt } from "../prompts/briefing-parse";
import { buildBriefingDetectPrompt } from "../prompts/briefing-detect-vacancies";
import {
  applyDetectedSegments,
  numberTranscript,
  type DetectedSegment,
} from "@/lib/transcript-split";

const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || "");

// Допустимые аудио-форматы и их MIME
const ALLOWED_AUDIO_MIME: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
};

export const MAX_AUDIO_BYTES = 200 * 1024 * 1024; // 200 MB

export class BriefingAudioError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BriefingAudioError";
  }
}

export function getAudioMimeType(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_AUDIO_MIME[ext] ?? null;
}

/**
 * Загружает аудио в Gemini Files API и возвращает file URI после ACTIVE.
 * Внутренне пишет буфер во временный файл — это самый надёжный путь
 * для текущей версии SDK (uploadFile стабильнее работает с file path,
 * чем с Buffer).
 */
async function uploadAudioToGemini(
  buffer: Buffer,
  mimeType: string,
): Promise<{ uri: string; name: string }> {
  const tmpPath = path.join(os.tmpdir(), `auf-briefing-${randomUUID()}`);
  await fs.writeFile(tmpPath, buffer);

  try {
    const uploaded = await fileManager.uploadFile(tmpPath, {
      mimeType,
      displayName: `briefing-${Date.now()}`,
    });

    // Poll until ACTIVE — для аудио обычно 2-10 сек
    let meta = uploaded.file;
    const startedAt = Date.now();
    const TIMEOUT_MS = 90 * 1000; // 90 сек хватит даже для длинных файлов

    while (meta.state === FileState.PROCESSING) {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        // best-effort cleanup
        await fileManager.deleteFile(meta.name).catch(() => {});
        throw new BriefingAudioError(
          "Gemini не успел обработать аудио за 90 секунд",
          504,
        );
      }
      await new Promise((r) => setTimeout(r, 2000));
      meta = await fileManager.getFile(meta.name);
    }

    if (meta.state === FileState.FAILED) {
      await fileManager.deleteFile(meta.name).catch(() => {});
      throw new BriefingAudioError(
        `Gemini не смог обработать аудио: ${meta.error?.message ?? "неизвестная причина"}`,
        422,
      );
    }

    return { uri: meta.uri, name: meta.name };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

/**
 * Расшифровать аудио → вернуть транскрипт со спикерами.
 * Удаляет загруженный файл из Gemini Files после использования.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const { uri, name } = await uploadAudioToGemini(buffer, mimeType);

  try {
    const parts: Part[] = [
      { fileData: { mimeType, fileUri: uri } },
      { text: buildBriefingTranscribePrompt() },
    ];
    const transcript = await callGemini(parts);

    const cleaned = transcript
      .replace(/^```(?:[a-z]+)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    if (cleaned.length < 30) {
      throw new BriefingAudioError(
        "Не удалось распознать речь — транскрипт пустой или слишком короткий. Возможно, на записи нет голоса или плохое качество звука.",
        422,
      );
    }

    return cleaned;
  } catch (error) {
    if (error instanceof BriefingAudioError) throw error;
    if (error instanceof ClaudeServiceError) {
      throw new BriefingAudioError(error.message, 502, error);
    }
    throw new BriefingAudioError(
      "Ошибка транскрипции через Gemini",
      500,
      error,
    );
  } finally {
    // best-effort cleanup, не валим запрос если не удалилось
    fileManager.deleteFile(name).catch((e) => {
      console.warn(`[briefing-audio] не удалось удалить ${name}:`, e);
    });
  }
}

// ── Парсинг транскрипта в структуру вакансии ───────────────────────

export type ConfidenceLevel = "high" | "low" | null;

export interface FieldWithConfidence<T> {
  value: T | null;
  confidence: ConfidenceLevel;
}

/**
 * Структура ответа от briefing-parse промпта.
 * Все поля повторяют схему Vacancy, но обёрнуты в { value, confidence }.
 */
export interface ParsedVacancyFromBriefing {
  summary: string;
  fields: {
    title: FieldWithConfidence<string>;
    clientName: FieldWithConfidence<string>;
    clientLead: FieldWithConfidence<string>;
    productDescription: FieldWithConfidence<string>;
    reasonForHiring: FieldWithConfidence<string>;
    role: FieldWithConfidence<string>;
    grade: FieldWithConfidence<string>;
    designersNeeded: FieldWithConfidence<number>;
    employmentType: FieldWithConfidence<string>;
    workFormat: FieldWithConfidence<string>;
    location: FieldWithConfidence<string>;
    timezone: FieldWithConfidence<string>;
    salaryRange: FieldWithConfidence<string>;
    desiredStartDate: FieldWithConfidence<string>;
    duration: FieldWithConfidence<string>;
    keyTasks: FieldWithConfidence<string[]>;
    requiredSkills: FieldWithConfidence<string[]>;
    niceToHaveSkills: FieldWithConfidence<string[]>;
    preferredDomains: FieldWithConfidence<string[]>;
    requiredTools: FieldWithConfidence<string[]>;
    needsInternational: FieldWithConfidence<boolean>;
    specialCompetencies: FieldWithConfidence<string[]>;
    redFlags: FieldWithConfidence<string[]>;
    portfolioReferences: FieldWithConfidence<string[]>;
    teamComposition: FieldWithConfidence<string>;
    decisionMaker: FieldWithConfidence<string>;
    hiringStages: FieldWithConfidence<number>;
    testTask: FieldWithConfidence<string>;
    scoringCriteria: FieldWithConfidence<
      Array<{ criterion: string; weight: number; type: "required" | "nice_to_have" | "stop_factor" }>
    >;
    clientNotes: FieldWithConfidence<string>;
    internalNotes: FieldWithConfidence<string>;
  };
}

/**
 * Определить, сколько вакансий обсуждали на записи, и нарезать транскрипт.
 *
 * Возвращает пустой массив, если разделить не удалось — вызывающий код
 * в этом случае идёт обычным путём «один звонок = одна вакансия».
 * Сбой определения не должен ронять брифинг: он лишь не даёт разделения.
 */
export async function detectVacancySegments(
  transcript: string,
): Promise<DetectedSegment[]> {
  try {
    const raw = await callGemini([
      { text: buildBriefingDetectPrompt(numberTranscript(transcript)) },
    ]);
    const cleaned = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    return applyDetectedSegments(transcript, JSON.parse(cleaned).segments);
  } catch (error) {
    console.error("[detectVacancySegments] не удалось разделить запись:", error);
    return [];
  }
}

/**
 * Распарсить транскрипт в структурированную вакансию + summary.
 */
export async function parseVacancyFromTranscript(
  transcript: string,
): Promise<ParsedVacancyFromBriefing> {
  const prompt = buildBriefingParsePrompt(transcript);
  let raw: string;
  try {
    raw = await callGemini([{ text: prompt }]);
  } catch (error) {
    if (error instanceof ClaudeServiceError) {
      throw new BriefingAudioError(error.message, 502, error);
    }
    throw new BriefingAudioError("Ошибка парсинга через Gemini", 500, error);
  }

  raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();

  let parsed: ParsedVacancyFromBriefing;
  try {
    parsed = JSON.parse(raw) as ParsedVacancyFromBriefing;
  } catch {
    throw new BriefingAudioError(
      `AI вернул невалидный JSON: ${raw.slice(0, 200)}`,
      502,
    );
  }

  if (!parsed || typeof parsed !== "object" || !parsed.fields) {
    throw new BriefingAudioError("AI вернул JSON без обязательных полей", 502);
  }

  return parsed;
}
