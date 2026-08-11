/**
 * POST /api/vacancies/parse-segment — разбор ОДНОГО куска брифинга в вакансию.
 *
 * Отдельно от parse-text: там лимит в 20 000 символов защищает от вставки
 * мусора руками, а сюда приходит машинная нарезка звонка — половина часовой
 * записи легко перевалит за этот предел. Плюс здесь нужен summary, который
 * форма показывает карточкой над полями.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseVacancyFromTranscript,
  BriefingAudioError,
} from "@/server/services/briefing-audio";

export const maxDuration = 300;

const MAX_SEGMENT_CHARS = 200_000;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    const trimmed = typeof text === "string" ? text.trim() : "";

    if (trimmed.length < 20) {
      return NextResponse.json({ error: "Слишком короткий фрагмент" }, { status: 400 });
    }
    if (trimmed.length > MAX_SEGMENT_CHARS) {
      return NextResponse.json(
        { error: "Фрагмент слишком длинный" },
        { status: 400 },
      );
    }

    const parsed = await parseVacancyFromTranscript(trimmed);
    return NextResponse.json({ fields: parsed.fields, summary: parsed.summary });
  } catch (error) {
    if (error instanceof BriefingAudioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[parse-segment] error:", error);
    const msg = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
