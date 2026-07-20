import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { extractBehanceProfiles, mapProfileToCandidate } from "@/lib/behance-import";
import type { CandidateImportRow } from "@/lib/import-types";

export const maxDuration = 300;

function behanceUrlOf(row: CandidateImportRow): string {
  return row.portfolioLinks[0]; // по построению первый — behance-профиль
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

    const profiles = extractBehanceProfiles(json);
    if (profiles.length === 0) {
      return NextResponse.json(
        { error: "Не найдено профилей Behance в файле" },
        { status: 400 },
      );
    }

    // Маппинг + отбраковка невалидных
    const mapped: CandidateImportRow[] = [];
    let skippedInvalid = 0;
    for (const p of profiles) {
      const row = mapProfileToCandidate(p);
      if (row) mapped.push(row);
      else skippedInvalid++;
    }

    // Дедуп внутри файла по behance-url
    const seen = new Set<string>();
    const unique: CandidateImportRow[] = [];
    for (const row of mapped) {
      const key = behanceUrlOf(row);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    // Дедуп против базы — сравниваем ТОЛЬКО по behance-url профиля.
    const behanceUrls = unique.map(behanceUrlOf);
    const existing = await prisma.candidate.findMany({
      where: { portfolioLinks: { hasSome: behanceUrls } },
      select: { portfolioLinks: true },
    });
    const existingUrls = new Set<string>();
    for (const c of existing) {
      for (const link of c.portfolioLinks) {
        if (behanceUrls.includes(link)) existingUrls.add(link);
      }
    }
    const toCreate = unique.filter((r) => !existingUrls.has(behanceUrlOf(r)));
    const skippedExisting = unique.length - toCreate.length;

    // Заливка. skipDuplicates не используем: уникального индекса на portfolioLinks
    // нет, флаг был бы no-op — реальный дедуп сделан выше.
    if (toCreate.length > 0) {
      await prisma.candidate.createMany({ data: toCreate });
    }

    return NextResponse.json({
      found: profiles.length,
      imported: toCreate.length,
      skippedExisting,
      skippedInvalid,
    });
  } catch (error) {
    console.error("POST import-json error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
