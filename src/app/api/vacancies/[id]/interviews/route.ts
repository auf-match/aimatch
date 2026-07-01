import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/server/db";
import { getAudioMimeType, MAX_AUDIO_BYTES } from "@/server/services/briefing-audio";
import { processVacancyInterview } from "@/server/services/interview-insights";

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
      return NextResponse.json({ error: "Нужен текст или аудио" }, { status: 400 });
    }

    let audioFileUrl: string | null = null;
    let source: "TEXT" | "AUDIO" = "TEXT";

    if (audio) {
      const mimeType = getAudioMimeType(audio.name);
      if (!mimeType) {
        return NextResponse.json({ error: "Поддерживаются только .m4a, .mp3, .aac" }, { status: 400 });
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Файл слишком большой (максимум 200 MB)" }, { status: 400 });
      }
      if (audio.size < 1024) {
        return NextResponse.json({ error: "Файл слишком маленький" }, { status: 400 });
      }
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const ext = path.extname(audio.name);
      const fileName = `interview-${randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      await fs.writeFile(filePath, Buffer.from(await audio.arrayBuffer()));
      audioFileUrl = filePath;
      source = "AUDIO";
    }

    const created = await prisma.vacancyInterview.create({
      data: {
        vacancyId, actor, source, rawText, audioFileUrl,
        status: "PROCESSING",
      },
    });

    void processVacancyInterview(created.id).catch((err) => {
      console.error("background processVacancyInterview threw:", err);
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST interview error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const [interviews, vacancy] = await Promise.all([
      prisma.vacancyInterview.findMany({
        where: { vacancyId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.vacancy.findUnique({
        where: { id: vacancyId },
        select: { interviewInsights: true },
      }),
    ]);
    return NextResponse.json({
      interviews,
      interviewInsights: vacancy?.interviewInsights ?? null,
    });
  } catch (error) {
    console.error("GET interviews error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
