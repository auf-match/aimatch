/**
 * Обработка одной VacancyInterview:
 *   1. Если нет transcript и это AUDIO — транскрибируем.
 *   2. Гоним итоговый текст через промпт -> AiSuggestions.
 *   3. Мержим в Vacancy.interviewInsights (в транзакции, с оптимистичной блокировкой).
 *
 * Идемпотентен: если transcript уже есть, шаг 1 пропускается.
 * Если merge упал, повторный вызов начнёт с шага 2.
 */
import { promises as fs } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { transcribeAudio, getAudioMimeType } from "@/server/services/briefing-audio";
import { callGemini } from "@/server/services/claude";
import { buildInterviewInsightsParsePrompt } from "@/server/prompts/interview-insights-parse";
import {
  mergeInsights,
  emptyInsights,
  type AiSuggestions,
  type Insights,
} from "@/lib/interview-insights";

function parseJsonResponse(text: string): AiSuggestions {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned);
  return {
    leadFocusAreas: Array.isArray(parsed.leadFocusAreas) ? parsed.leadFocusAreas.filter((x: unknown) => typeof x === "string") : [],
    leadQuestions: Array.isArray(parsed.leadQuestions) ? parsed.leadQuestions.filter((x: unknown) => typeof x === "string") : [],
    candidateTips: Array.isArray(parsed.candidateTips) ? parsed.candidateTips.filter((x: unknown) => typeof x === "string") : [],
    prescreeningQuestions: Array.isArray(parsed.prescreeningQuestions) ? parsed.prescreeningQuestions.filter((x: unknown) => typeof x === "string") : [],
  };
}

export async function processVacancyInterview(interviewId: string): Promise<void> {
  try {
    const interview = await prisma.vacancyInterview.findUnique({
      where: { id: interviewId },
      include: { vacancy: { select: { id: true, title: true, role: true, grade: true } } },
    });
    if (!interview) return;

    // Фаза 1: транскрибация (если нужно).
    let transcript = interview.transcript;
    if (!transcript) {
      if (interview.source === "AUDIO" && interview.audioFileUrl) {
        const absPath = path.isAbsolute(interview.audioFileUrl)
          ? interview.audioFileUrl
          : path.join(process.cwd(), interview.audioFileUrl);
        const buffer = await fs.readFile(absPath);
        const mimeType = getAudioMimeType(path.basename(absPath));
        if (!mimeType) throw new Error("Неподдерживаемый формат аудио");
        transcript = await transcribeAudio(buffer, mimeType);
      } else if (interview.source === "TEXT") {
        transcript = interview.rawText?.trim() || "";
      }

      if (!transcript) {
        await prisma.vacancyInterview.update({
          where: { id: interviewId },
          data: { status: "FAILED", errorMessage: "Пустой транскрипт" },
        });
        return;
      }

      // Персистим транскрипт независимо от источника — это то, на что
      // ориентируется catch-блок при выборе FAILED vs READY+errorMessage.
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { transcript },
      });
    }

    // После успешной транскрипции — READY (даже если парсинг ниже упадёт).
    if (interview.status !== "READY") {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { status: "READY", errorMessage: null },
      });
    }

    // Фаза 2: парсинг.
    const prompt = buildInterviewInsightsParsePrompt({
      vacancy: {
        title: interview.vacancy.title,
        role: interview.vacancy.role,
        grade: interview.vacancy.grade,
      },
      transcript,
    });
    const raw = await callGemini([{ text: prompt }]);
    const suggestions = parseJsonResponse(raw);
    if (Object.values(suggestions).every((arr) => arr.length === 0)) {
      console.warn(`interview ${interviewId}: AI vernul empty insights (possible malformed response)`);
    }

    // Фаза 3: мерж (с оптимистичной блокировкой через updatedAt).
    await mergeIntoVacancy(interview.vacancyId, suggestions, interviewId);

    // Успех — errorMessage чистим.
    await prisma.vacancyInterview.update({
      where: { id: interviewId },
      data: { errorMessage: null },
    });
  } catch (err) {
    console.error("processVacancyInterview failed:", err);
    try {
      // Если транскрипт уже есть — оставляем/восстанавливаем READY + записываем errorMessage
      // (retry перезапустит только парсинг). Явно ставим status: "READY", чтобы запись
      // не застряла в PROCESSING, если этот прогон упал уже после персиста транскрипта.
      // Если транскрипта нет — FAILED (retry начнёт с транскрипции).
      const cur = await prisma.vacancyInterview.findUnique({ where: { id: interviewId } });
      if (!cur) return;
      const message = err instanceof Error ? err.message : "Неизвестная ошибка";
      if (cur.transcript) {
        await prisma.vacancyInterview.update({
          where: { id: interviewId },
          data: { status: "READY", errorMessage: message },
        });
      } else {
        await prisma.vacancyInterview.update({
          where: { id: interviewId },
          data: { status: "FAILED", errorMessage: message },
        });
      }
    } catch (innerErr) {
      console.error("processVacancyInterview: failed to record error state:", innerErr, "original error:", err);
    }
  }
}

/**
 * Мержит suggestions в Vacancy.interviewInsights с ретраем при коллизии.
 * Ловит гонку при параллельной обработке нескольких записей.
 */
async function mergeIntoVacancy(
  vacancyId: string,
  suggestions: AiSuggestions,
  sourceInterviewId: string,
): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: vacancyId },
      select: { interviewInsights: true, updatedAt: true },
    });
    if (!vacancy) throw new Error("Вакансия не найдена");

    const current = (vacancy.interviewInsights as unknown as Insights) ?? emptyInsights();
    const merged = mergeInsights(current, suggestions, sourceInterviewId, new Date());

    // Оптимистичная блокировка: обновляем только если updatedAt не менялся.
    const res = await prisma.vacancy.updateMany({
      where: { id: vacancyId, updatedAt: vacancy.updatedAt },
      data: { interviewInsights: merged as unknown as Prisma.InputJsonValue },
    });
    if (res.count === 1) return;
    // Иначе — конкурентная запись, повтор.
  }
  throw new Error("Не удалось смерджить инсайты (много гонок)");
}
