import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getProcessing } from "@/server/services/analysis-tracker";
import { IMPORT_SOURCES } from "@/lib/import-types";

export async function GET() {
  try {
    const sources = { in: [...IMPORT_SOURCES] };
    const [failed, pending] = await Promise.all([
      prisma.candidate.findMany({
        where: { status: "ANALYSIS_FAILED", source: sources },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: { id: true, name: true, lastAnalysisError: true, updatedAt: true },
      }),
      prisma.candidate.count({
        where: { status: "NEW", source: sources, portfolioLinks: { isEmpty: false } },
      }),
    ]);
    return NextResponse.json({
      processing: getProcessing(),
      failed,
      pending,
    });
  } catch (error) {
    console.error("GET analyze-status-debug error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
