import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { dedupKey } from "@/lib/candidate-dedup";
import { normalizeIngestRow, type IngestInput, type IngestRow } from "@/lib/ingest";

export const maxDuration = 60;

const DEFAULT_SOURCE = "Консультант";

/**
 * POST /api/candidates/ingest
 *
 * Внешний приём кандидатов (для продукта коллеги/консультанта). Авторизация —
 * отдельный токен в заголовке `X-Ingest-Token` (не общий пароль приложения),
 * чтобы дать интеграции ТОЛЬКО право добавлять и легко отозвать сменой токена.
 *
 * Body: { source?: string, candidates: IngestInput[] }
 *   IngestInput: { name, portfolioLinks|portfolioUrl|url, email?, telegram?, linkedin?, location?, source? }
 *
 * Кандидаты заводятся со статусом NEW → дальше идут в обычный анализ портфолио.
 * Дедуп по каноническому URL — внутри запроса и против базы.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) {
    // Не сконфигурирован — не открываем эндпоинт «в мир».
    return NextResponse.json({ error: "Ingest не настроен (нет INGEST_TOKEN)" }, { status: 503 });
  }
  const provided = req.headers.get("x-ingest-token");
  if (provided !== expected) {
    return NextResponse.json({ error: "Неверный или отсутствующий токен" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | { source?: string; candidates?: IngestInput[] }
      | IngestInput[]
      | null;
    if (!body) {
      return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
    }

    const list = Array.isArray(body) ? body : body.candidates;
    const defaultSource =
      (!Array.isArray(body) && typeof body.source === "string" && body.source.trim()) ||
      DEFAULT_SOURCE;

    if (!Array.isArray(list) || list.length === 0) {
      return NextResponse.json({ error: "Ожидается непустой массив candidates" }, { status: 400 });
    }
    if (list.length > 1000) {
      return NextResponse.json({ error: "Максимум 1000 кандидатов за запрос" }, { status: 400 });
    }

    // Нормализация + отсев невалидных (нет имени / нет ссылки).
    const rows: IngestRow[] = [];
    let skippedInvalid = 0;
    for (const item of list) {
      const row = normalizeIngestRow(item ?? {}, defaultSource);
      if (row) rows.push(row);
      else skippedInvalid++;
    }

    // Дедуп внутри запроса по каноническому ключу первой ссылки.
    const seen = new Set<string>();
    const unique: IngestRow[] = [];
    for (const row of rows) {
      const key = dedupKey(row.portfolioLinks[0]);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    // Дедуп против базы (формы URL в базе разные — сравниваем по канон-ключу).
    const existing = await prisma.candidate.findMany({ select: { portfolioLinks: true } });
    const existingKeys = new Set<string>();
    for (const c of existing) for (const link of c.portfolioLinks) existingKeys.add(dedupKey(link));

    const toCreate = unique.filter((r) => !existingKeys.has(dedupKey(r.portfolioLinks[0])));
    const skippedExisting = unique.length - toCreate.length;

    if (toCreate.length > 0) {
      await prisma.candidate.createMany({ data: toCreate });
    }

    return NextResponse.json({
      received: list.length,
      imported: toCreate.length,
      skippedExisting,
      skippedInvalid,
    });
  } catch (error) {
    console.error("POST /api/candidates/ingest error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
