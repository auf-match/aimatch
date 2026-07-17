import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    // Фильтры должны совпадать с выборкой в analyze-batch.
    const [pending, failed] = await Promise.all([
      prisma.candidate.count({
        where: { status: "NEW", source: "behance", portfolioLinks: { isEmpty: false } },
      }),
      prisma.candidate.count({
        where: { status: "ANALYSIS_FAILED", source: "behance" },
      }),
    ]);
    return NextResponse.json({ pending, failed });
  } catch (error) {
    console.error("GET analyze-batch status error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
