/**
 * Обработка записи VacancyUpdate (выполняется как fire-and-forget из POST-роута):
 *   1. Читает запись из БД.
 *   2. Если kind === AUDIO и есть audioFileUrl — транскрибирует через briefing-audio.
 *   3. Гонит итоговый текст + текущую вакансию через vacancy-update-parse.
 *   4. Сохраняет proposedDiff и переводит status: PENDING / EMPTY / FAILED.
 */
import { promises as fs } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { transcribeAudio, getAudioMimeType } from "@/server/services/briefing-audio";
import { callGemini } from "@/server/services/claude";
import { buildVacancyUpdateParsePrompt } from "@/server/prompts/vacancy-update-parse";

// Поля вакансии, которые видит AI при парсинге диффа.
const VACANCY_FIELDS_FOR_AI = [
  "title",
  "productDescription",
  "reasonForHiring",
  "keyTasks",
  "requiredSkills",
  "niceToHaveSkills",
  "preferredDomains",
  "requiredTools",
  "redFlags",
  "specialCompetencies",
  "needsInternational",
  "scoringCriteria",
  "salaryRange",
  "teamComposition",
  "clientNotes",
] as const;

function pickVacancyForAi(v: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of VACANCY_FIELDS_FOR_AI) out[k] = v[k];
  return out;
}

function parseJsonResponse(text: string): { items: unknown[] } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(cleaned);
}

export async function processVacancyUpdate(updateId: string): Promise<void> {
  try {
    const update = await prisma.vacancyUpdate.findUnique({
      where: { id: updateId },
      include: { vacancy: true },
    });
    if (!update) return;
    if (update.status !== "PROCESSING") return;

    let updateText = update.rawText?.trim() || "";
    let transcript: string | null = update.transcript;

    if (update.kind === "AUDIO" && update.audioFileUrl && !transcript) {
      const absPath = path.isAbsolute(update.audioFileUrl)
        ? update.audioFileUrl
        : path.join(process.cwd(), update.audioFileUrl);
      const buffer = await fs.readFile(absPath);
      const mimeType = getAudioMimeType(path.basename(absPath));
      if (!mimeType) throw new Error("Неподдерживаемый формат аудио");
      transcript = await transcribeAudio(buffer, mimeType);
      await prisma.vacancyUpdate.update({
        where: { id: updateId },
        data: { transcript },
      });
      updateText = [updateText, transcript].filter(Boolean).join("\n\n").trim();
    }

    if (!updateText) {
      await prisma.vacancyUpdate.update({
        where: { id: updateId },
        data: { status: "FAILED", errorMessage: "Пустой текст уточнения" },
      });
      return;
    }

    const prompt = buildVacancyUpdateParsePrompt({
      vacancy: pickVacancyForAi(update.vacancy as unknown as Record<string, unknown>),
      updateText,
    });

    const raw = await callGemini([{ text: prompt }]);
    const parsed = parseJsonResponse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    if (items.length === 0) {
      await prisma.vacancyUpdate.update({
        where: { id: updateId },
        data: { status: "EMPTY", proposedDiff: items as Prisma.InputJsonValue },
      });
      return;
    }

    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: { status: "PENDING", proposedDiff: items as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error("processVacancyUpdate failed:", err);
    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Неизвестная ошибка",
      },
    });
  }
}
