/**
 * POST /api/vacancies/updates-multi
 *
 * Одна аудиозапись → уточнения сразу по нескольким вакансиям.
 * Файл сохраняется один раз, на каждую вакансию заводится своя запись
 * VacancyUpdate в статусе PROCESSING, дальше их разбирает фоновая обработка.
 *
 * formData: audio (File), vacancyIds (несколько значений), actor
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/server/db";
import { getAudioMimeType, MAX_AUDIO_BYTES } from "@/server/services/briefing-audio";
import { processMultiVacancyAudio } from "@/server/services/multi-vacancy-update";

export const maxDuration = 300;

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const actor = (formData.get("actor") as string | null) || "Система";
    const vacancyIds = Array.from(
      new Set(
        formData
          .getAll("vacancyIds")
          .map((v) => String(v).trim())
          .filter(Boolean),
      ),
    );

    if (!audio) {
      return NextResponse.json({ error: "Нужна аудиозапись" }, { status: 400 });
    }
    if (vacancyIds.length < 2) {
      return NextResponse.json(
        { error: "Выберите минимум две вакансии" },
        { status: 400 },
      );
    }

    const mimeType = getAudioMimeType(audio.name);
    if (!mimeType) {
      return NextResponse.json(
        { error: "Поддерживаются только .m4a, .mp3, .aac" },
        { status: 400 },
      );
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Файл слишком большой (максимум 200 MB)" },
        { status: 400 },
      );
    }
    if (audio.size < 1024) {
      return NextResponse.json({ error: "Файл слишком маленький" }, { status: 400 });
    }

    const found = await prisma.vacancy.findMany({
      where: { id: { in: vacancyIds } },
      select: { id: true },
    });
    if (found.length !== vacancyIds.length) {
      return NextResponse.json(
        { error: "Часть вакансий не найдена" },
        { status: 404 },
      );
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const fileName = `vacancy-update-${randomUUID()}${path.extname(audio.name)}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    await fs.writeFile(filePath, Buffer.from(await audio.arrayBuffer()));

    const created = await prisma.$transaction(
      vacancyIds.map((vacancyId) =>
        prisma.vacancyUpdate.create({
          data: {
            vacancyId,
            actor,
            kind: "AUDIO",
            audioFileUrl: filePath,
            status: "PROCESSING",
          },
        }),
      ),
    );

    // Fire-and-forget, как и в одиночном роуте: клиент поллит GET по вакансии.
    void processMultiVacancyAudio(created.map((c) => c.id)).catch((err) => {
      console.error("background processMultiVacancyAudio threw:", err);
    });

    return NextResponse.json({ updates: created }, { status: 201 });
  } catch (error) {
    console.error("POST updates-multi error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
