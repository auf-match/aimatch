import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { normalizeSourceList } from "@/lib/source-detect";

/**
 * GET /api/candidates/sources
 * Возвращает уникальные источники кандидатов (нормализованные ярлыки) —
 * для выбора из существующих в комбобоксе. Плюс базовый набор частых площадок.
 */
const BASE = ["Behance", "Dribbble", "Notion", "Figma", "LinkedIn", "Huntflow", "Личный сайт", "Реферал"];

export async function GET() {
  try {
    const rows = await prisma.candidate.findMany({
      where: { NOT: { source: null } },
      select: { source: true },
      distinct: ["source"],
    });
    const fromDb = rows.map((r) => r.source);
    const sources = normalizeSourceList([...BASE, ...fromDb]);
    return NextResponse.json({ sources });
  } catch (error) {
    console.error("GET /api/candidates/sources error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
