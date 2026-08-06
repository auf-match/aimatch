import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: candidateId } = await params;
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { candidateId },
      include: {
        vacancy: { select: { id: true, title: true, clientName: true, grade: true } },
        transitions: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Оценка соответствия по каждой вакансии: DetailedScore -> MatchResult -> null
    const vacancyIds = pipelines.map((p) => p.vacancyId);
    const [detailed, matches] = await Promise.all([
      prisma.detailedScore.findMany({
        where: { candidateId, vacancyId: { in: vacancyIds } },
        select: { vacancyId: true, overallScore: true },
      }),
      prisma.matchResult.findMany({
        where: { candidateId, vacancyId: { in: vacancyIds } },
        select: { vacancyId: true, overallScore: true },
      }),
    ]);
    const scoreByVacancy = new Map<string, number>();
    for (const m of matches) scoreByVacancy.set(m.vacancyId, m.overallScore);
    for (const d of detailed) scoreByVacancy.set(d.vacancyId, d.overallScore);

    const result = pipelines.map((p) => ({
      ...p,
      score: scoreByVacancy.get(p.vacancyId) ?? null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET candidate pipelines error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
