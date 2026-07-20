import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { extractBehanceProfiles, mapProfileToCandidate } from "@/lib/behance-import";
import {
  isHuntflowExport,
  extractHuntflowApplicants,
  mapApplicantToCandidate,
} from "@/lib/huntflow-import";
import type { CandidateImportRow } from "@/lib/import-types";

export const maxDuration = 300;

/** Первая ссылка — самая содержательная (парсеры сортируют по тиру). */
function primaryUrlOf(row: CandidateImportRow): string {
  return row.portfolioLinks[0];
}

/**
 * Канонический ключ для дедупа. Huntflow-парсер отдаёт канон (https, без www,
 * без хвостового слэша), а Behance-парсер пишет URL как есть из выгрузки —
 * поэтому в базе один и тот же профиль может лежать в любой форме.
 *
 * Ключ применяется к ОБЕИМ сторонам сравнения. Перебирать варианты нельзя:
 * такой перебор односторонний (добавляет www, но не убирает) и не покрывает
 * хвостовой слэш — повторная загрузка Behance-файла после Huntflow-импорта
 * продублировала бы всех пересекающихся людей.
 */
function dedupKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
    }

    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return NextResponse.json({ error: "Не удалось разобрать файл" }, { status: 400 });
    }

    // Авто-детект формата выгрузки
    const huntflow = isHuntflowExport(json);

    let found: number;
    const mapped: CandidateImportRow[] = [];
    let skippedInvalid = 0;

    if (huntflow) {
      const applicants = extractHuntflowApplicants(json);
      found = applicants.length;
      for (const a of applicants) {
        const row = mapApplicantToCandidate(a);
        if (row) mapped.push(row);
        else skippedInvalid++;
      }
      if (mapped.length === 0) {
        return NextResponse.json(
          { error: "В выгрузке Huntflow не найдено кандидатов со ссылкой на портфолио" },
          { status: 400 },
        );
      }
    } else {
      const profiles = extractBehanceProfiles(json);
      found = profiles.length;
      if (profiles.length === 0) {
        return NextResponse.json(
          { error: "Не найдено профилей Behance в файле" },
          { status: 400 },
        );
      }
      for (const p of profiles) {
        const row = mapProfileToCandidate(p);
        if (row) mapped.push(row);
        else skippedInvalid++;
      }
    }

    // Дедуп внутри файла по каноническому ключу основной ссылки
    const seen = new Set<string>();
    const unique: CandidateImportRow[] = [];
    for (const row of mapped) {
      const key = dedupKey(primaryUrlOf(row));
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    // Дедуп против базы. Забираем ссылки всех кандидатов и сравниваем по
    // каноническому ключу: `hasSome` требует точного совпадения строк, а формы
    // в базе разные (www / http / хвостовой слэш), поэтому фильтровать запросом
    // нельзя — промахнёмся. Таблица кандидатов на порядки меньше лимитов
    // (тысячи строк, короткие массивы ссылок), разовый импорт это выдержит.
    const existing = await prisma.candidate.findMany({
      select: { portfolioLinks: true },
    });
    const existingKeys = new Set<string>();
    for (const c of existing) {
      for (const link of c.portfolioLinks) existingKeys.add(dedupKey(link));
    }
    const toCreate = unique.filter((r) => !existingKeys.has(dedupKey(primaryUrlOf(r))));
    const skippedExisting = unique.length - toCreate.length;

    // Заливка. skipDuplicates не используем: уникального индекса на portfolioLinks
    // нет, флаг был бы no-op — реальный дедуп сделан выше.
    if (toCreate.length > 0) {
      await prisma.candidate.createMany({ data: toCreate });
    }

    return NextResponse.json({
      found,
      imported: toCreate.length,
      skippedExisting,
      skippedInvalid,
    });
  } catch (error) {
    console.error("POST import-json error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
