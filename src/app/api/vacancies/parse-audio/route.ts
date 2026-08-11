import { NextRequest, NextResponse } from "next/server";
import {
  transcribeAudio,
  parseVacancyFromTranscript,
  detectVacancySegments,
  getAudioMimeType,
  MAX_AUDIO_BYTES,
  BriefingAudioError,
} from "@/server/services/briefing-audio";

export const maxDuration = 300; // транскрипция длинных файлов может занять несколько минут

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
    }

    const mimeType = getAudioMimeType(file.name);
    if (!mimeType) {
      return NextResponse.json(
        { error: "Поддерживаются только .m4a, .mp3 и .aac файлы" },
        { status: 400 },
      );
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Файл слишком большой (максимум 200 MB). Сократите длительность или конвертируйте в более низкий битрейт." },
        { status: 400 },
      );
    }

    if (file.size < 1024) {
      return NextResponse.json(
        { error: "Файл слишком маленький — это точно запись брифинга?" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Шаг 1: транскрипция
    const transcript = await transcribeAudio(buffer, mimeType);

    // Шаг 2: на одном звонке могли обсуждать несколько позиций. Если так —
    // не парсим сразу: разбор всей записи в одну вакансию смешал бы условия
    // разных позиций. Отдаём куски, пользователь выбирает, какую заводить.
    const segments = await detectVacancySegments(transcript);
    if (segments.length > 1) {
      return NextResponse.json({
        transcript,
        summary: null,
        fields: null,
        segments: segments.map((s) => ({ label: s.label, text: s.text })),
      });
    }

    // Шаг 3: парсинг в структуру вакансии. Если упал — отдаём
    // транскрипт без полей, чтобы пользователь не терял работу AI.
    try {
      const parsed = await parseVacancyFromTranscript(transcript);
      return NextResponse.json({
        transcript,
        summary: parsed.summary,
        fields: parsed.fields,
      });
    } catch (parseError) {
      console.error("[parse-audio] парсинг упал, возвращаем только транскрипт:", parseError);
      return NextResponse.json({
        transcript,
        summary: null,
        fields: null,
        parseError: parseError instanceof Error ? parseError.message : "Не удалось распарсить транскрипт",
      });
    }
  } catch (error) {
    if (error instanceof BriefingAudioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[parse-audio] error:", error);
    const msg = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
