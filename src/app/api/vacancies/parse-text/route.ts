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
    if (typeof text !== "string" || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Текст слишком короткий — вставьте описание вакансии" },
        { status: 400 },
      );
    }

    const parsed = await parseVacancyFromTranscript(text.trim());
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
