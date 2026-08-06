import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const vacancy = await prisma.vacancy.findUnique({ where: { id } });
    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    // Подсчёт по poolStatus среди PASS-кандидатов
    const statusCounts = await prisma.screeningResult.groupBy({
      by: ["poolStatus"],
      where: { vacancyId: id, decision: "PASS" },
      _count: true,
    });

    const byStatus: Record<string, number> = {
      NEW: 0,
      REVIEWED: 0,
      APPROVED: 0,
      REJECTED_MANUAL: 0,
      MAYBE: 0,
    };
    for (const row of statusCounts) {
      byStatus[row.poolStatus] = row._count;
    }

    return NextResponse.json({
      totalCandidates: vacancy.totalCandidates,
      afterHardFilter: vacancy.afterHardFilter,
      afterAiScreening: vacancy.afterAiScreening,
      lastScreeningAt: vacancy.lastScreeningAt,
      byStatus,
    });
  } catch (error) {
    console.error("Pool stats error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке статистики" },
      { status: 500 },
    );
  }
}
