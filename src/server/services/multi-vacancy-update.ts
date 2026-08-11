/**
 * Обработка одной аудиозаписи, на которой обсуждали несколько вакансий.
 *
 * Порядок (fire-and-forget из POST-роута):
 *   1. Транскрибируем файл ОДИН раз на весь звонок.
 *   2. Просим модель разметить, какие строки к какой вакансии относятся.
 *   3. Режем транскрипт по номерам строк локально и раскладываем куски
 *      по заранее созданным записям VacancyUpdate.
 *   4. Дальше каждую запись доводит обычный processVacancyUpdate — он видит
 *      уже проставленный transcript и повторно аудио не трогает.
 *
 * Смысл разделения: разбор диффа для вакансии А не должен видеть разговор
 * про Б, иначе условия перетекают между позициями, и на глаз это не ловится.
 */
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/server/db";
import { transcribeAudio, getAudioMimeType } from "@/server/services/briefing-audio";
import { callGemini } from "@/server/services/claude";
import { processVacancyUpdate } from "@/server/services/vacancy-update";
import {
  buildTranscriptSplitPrompt,
  type SplitVacancyInfo,
} from "@/server/prompts/transcript-split";
import { applySplitRanges, numberTranscript } from "@/lib/transcript-split";

function parseJsonResponse(text: string): { ranges?: unknown } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(cleaned);
}

async function failAll(updateIds: string[], message: string, transcript?: string) {
  await prisma.vacancyUpdate.updateMany({
    where: { id: { in: updateIds } },
    data: {
      status: "FAILED",
      errorMessage: message,
      ...(transcript ? { transcript } : {}),
    },
  });
}

/**
 * @param updateIds записи VacancyUpdate в статусе PROCESSING — по одной на вакансию
 */
export async function processMultiVacancyAudio(updateIds: string[]): Promise<void> {
  if (updateIds.length === 0) return;

  let transcript = "";

  try {
    const updates = await prisma.vacancyUpdate.findMany({
      where: { id: { in: updateIds } },
      include: { vacancy: true },
    });
    if (updates.length === 0) return;

    const audioFileUrl = updates.find((u) => u.audioFileUrl)?.audioFileUrl;
    if (!audioFileUrl) {
      await failAll(updateIds, "К записи не приложен аудиофайл");
      return;
    }

    // --- 1. Транскрибация (один раз на весь звонок) ---
    const absPath = path.isAbsolute(audioFileUrl)
      ? audioFileUrl
      : path.join(process.cwd(), audioFileUrl);
    const buffer = await fs.readFile(absPath);
    const mimeType = getAudioMimeType(path.basename(absPath));
    if (!mimeType) {
      await failAll(updateIds, "Неподдерживаемый формат аудио");
      return;
    }
    transcript = await transcribeAudio(buffer, mimeType);

    if (!transcript.trim()) {
      await failAll(updateIds, "Транскрипт пустой — запись не распознана");
      return;
    }

    // --- 2. Разметка по вакансиям ---
    const vacancies: SplitVacancyInfo[] = updates.map((u) => ({
      id: u.vacancyId,
      title: u.vacancy.title,
      clientName: u.vacancy.clientName,
      role: u.vacancy.role,
      grade: u.vacancy.grade,
    }));

    const raw = await callGemini([
      {
        text: buildTranscriptSplitPrompt({
          numberedTranscript: numberTranscript(transcript),
          vacancies,
        }),
      },
    ]);

    const segments = applySplitRanges(
      transcript,
      parseJsonResponse(raw).ranges,
      updates.map((u) => u.vacancyId),
    );

    if (segments.length === 0) {
      // Полный транскрипт сохраняем, чтобы его можно было разнести руками.
      await failAll(
        updateIds,
        "Не удалось разделить запись по вакансиям. Транскрипт сохранён — разнесите фрагменты вручную.",
        transcript,
      );
      return;
    }

    // --- 3. Раскладываем куски и до-обрабатываем каждую запись ---
    const byVacancy = new Map(segments.map((s) => [s.vacancyId, s]));

    for (const update of updates) {
      const segment = byVacancy.get(update.vacancyId);

      if (!segment) {
        // Про эту вакансию на записи ничего не нашлось — это валидный исход,
        // а не сбой: помечаем EMPTY и кладём полный транскрипт для проверки.
        await prisma.vacancyUpdate.update({
          where: { id: update.id },
          data: { status: "EMPTY", transcript, proposedDiff: [] },
        });
        continue;
      }

      await prisma.vacancyUpdate.update({
        where: { id: update.id },
        data: { transcript: segment.text },
      });
    }

    // Последовательно, а не параллельно: каждый разбор — отдельный вызов
    // модели, и упереться в rate limit на длинном звонке легко.
    for (const update of updates) {
      if (!byVacancy.has(update.vacancyId)) continue;
      await processVacancyUpdate(update.id).catch((err) =>
        console.error("processVacancyUpdate in split failed:", update.id, err),
      );
    }
  } catch (err) {
    console.error("processMultiVacancyAudio failed:", err);
    await failAll(
      updateIds,
      err instanceof Error ? err.message : "Неизвестная ошибка",
      transcript || undefined,
    ).catch(() => {});
  }
}
