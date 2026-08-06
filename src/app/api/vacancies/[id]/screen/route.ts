import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { hardFilter } from "@/server/services/hard-filter";
import { aiScreen } from "@/server/services/ai-screener";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const vacancy = await prisma.vacancy.findUnique({ where: { id } });
    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    // Слой 1: Hard filter
    const { candidates: hardFiltered, stats } = await hardFilter(vacancy);

    // Слой 2: AI screening
    const screeningResults = await aiScreen(vacancy, hardFiltered);
    const passCount = screeningResults.filter((r) => r.decision === "PASS").length;

    // Обновить статистику вакансии
    await prisma.vacancy.update({
      where: { id },
      data: {
        totalCandidates: stats.total,
        afterHardFilter: stats.passed,
        afterAiScreening: passCount,
        lastScreeningAt: new Date(),
      },
    });

    return NextResponse.json({
      totalCandidates: stats.total,
      afterHardFilter: stats.passed,
      afterAiScreening: passCount,
      poolSize: passCount,
    });
  } catch (error) {
    console.error("Screening error:", error);
    return NextResponse.json(
      { error: "Ошибка при скрининге" },
      { status: 500 },
    );
  }
}
