import { NextRequest, NextResponse } from "next/server";
import {
  parseVacancyFromTranscript,
  BriefingAudioError,
} from "@/server/services/briefing-audio";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const text = body?.text;
    if (typeof text !== "string") {
      return NextResponse.json(
        { error: "Текст слишком короткий — вставьте описание вакансии" },
        { status: 400 },
      );
    }
    const trimmed = text.trim();
    if (trimmed.length < 20) {
      return NextResponse.json(
        { error: "Текст слишком короткий — вставьте описание вакансии" },
        { status: 400 },
      );
    }
    if (trimmed.length > 20000) {
      return NextResponse.json(
        { error: "Текст слишком длинный (максимум 20000 символов) — сократите или разбейте на части" },
        { status: 400 },
      );
    }

    const parsed = await parseVacancyFromTranscript(trimmed);
    // summary не возвращаем — форме не нужен, текст не храним
    return NextResponse.json({ fields: parsed.fields });
  } catch (error) {
    if (error instanceof BriefingAudioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[parse-text] error:", error);
    const msg = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
