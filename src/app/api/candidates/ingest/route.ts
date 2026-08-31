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
 *
 * Дедуп двухступенчатый — внутри запроса и против базы:
 *   1) по паре «источник + externalId», если он передан. Нужен для регулярных
 *      выгрузок (Хантфлоу и т.п.): у человека может не быть ссылки на портфолио
 *      или она может отличаться от той, что уже лежит в базе, и тогда сравнение
 *      по ссылке заводит второго такого же.
 *   2) по каноническому URL — как раньше, для всех, у кого externalId нет.
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

    // Ключ по источнику: разные источники могут нумеровать людей одинаково.
    const externalKey = (source: string, externalId: string) => `${source}\u0000${externalId}`;

    // Дедуп внутри запроса: сперва по внешнему id, затем по ссылке.
    const seenExternal = new Set<string>();
    const seenLinks = new Set<string>();
    const unique: IngestRow[] = [];
    for (const row of rows) {
      if (row.externalId) {
        const key = externalKey(row.source, row.externalId);
        if (seenExternal.has(key)) continue;
        seenExternal.add(key);
      }
      const key = dedupKey(row.portfolioLinks[0]);
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      unique.push(row);
    }

    // Дедуп против базы: формы URL в базе разные — сравниваем по канон-ключу.
    const existing = await prisma.candidate.findMany({
      select: { portfolioLinks: true, source: true, externalId: true },
    });
    const existingKeys = new Set<string>();
    const existingExternal = new Set<string>();
    for (const c of existing) {
      for (const link of c.portfolioLinks) existingKeys.add(dedupKey(link));
      if (c.source && c.externalId) existingExternal.add(externalKey(c.source, c.externalId));
    }

    const toCreate = unique.filter((r) => {
      if (r.externalId && existingExternal.has(externalKey(r.source, r.externalId))) return false;
      return !existingKeys.has(dedupKey(r.portfolioLinks[0]));
    });
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
