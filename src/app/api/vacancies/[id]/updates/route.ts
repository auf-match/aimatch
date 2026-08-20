import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/server/db";
import { getAudioMimeType, MAX_AUDIO_BYTES } from "@/server/services/briefing-audio";
import { processVacancyUpdate } from "@/server/services/vacancy-update";

export const maxDuration = 300;

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const formData = await req.formData();
    const rawText = (formData.get("rawText") as string | null)?.trim() || null;
    const audio = formData.get("audio") as File | null;
    const actor = (formData.get("actor") as string | null) || "Система";

    if (!rawText && !audio) {
      return NextResponse.json(
        { error: "Нужен текст или аудио" },
        { status: 400 },
      );
    }

    let audioFileUrl: string | null = null;
    let kind: "TEXT" | "AUDIO" = "TEXT";

    if (audio) {
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
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const ext = path.extname(audio.name);
      const fileName = `vacancy-update-${randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      await fs.writeFile(filePath, Buffer.from(await audio.arrayBuffer()));
      audioFileUrl = filePath;
      kind = "AUDIO";
    }

    const created = await prisma.vacancyUpdate.create({
      data: {
        vacancyId,
        actor,
        kind,
        rawText,
        audioFileUrl,
        status: "PROCESSING",
      },
    });

    // Fire-and-forget: обработка идёт в фоне, клиент поллит GET.
    // ВАЖНО: рассчитано на долгоживущий Node-процесс (не serverless).
    // На serverless с заморозкой функции после ответа (Vercel) фон НЕ выполнится —
    // тогда нужно перейти на синхронный inline-вариант или внешнюю очередь.
    void processVacancyUpdate(created.id).catch((err) => {
      console.error("background processVacancyUpdate threw:", err);
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST vacancy update error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const updates = await prisma.vacancyUpdate.findMany({
      where: { vacancyId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(updates);
  } catch (error) {
    console.error("GET vacancy updates error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
