import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { approveToVacancy } from "@/server/services/pipeline";

// GET — данные доски: записи Pipeline + последний переход + score кандидата
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { vacancyId },
      include: {
        candidate: { select: { id: true, name: true, role: true, grade: true } },
        transitions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    // overall score: DetailedScore -> MatchResult -> null
    const candidateIds = pipelines.map((p) => p.candidateId);
    const [detailed, matches] = await Promise.all([
      prisma.detailedScore.findMany({
        where: { vacancyId, candidateId: { in: candidateIds } },
        select: { candidateId: true, overallScore: true },
      }),
      prisma.matchResult.findMany({
        where: { vacancyId, candidateId: { in: candidateIds } },
        select: { candidateId: true, overallScore: true },
      }),
    ]);
    const scoreByCandidate = new Map<string, number>();
    for (const m of matches) scoreByCandidate.set(m.candidateId, m.overallScore);
    for (const d of detailed) scoreByCandidate.set(d.candidateId, d.overallScore);

    const result = pipelines.map((p) => ({
      candidateId: p.candidateId,
      candidate: p.candidate,
      stage: p.stage,
      score: scoreByCandidate.get(p.candidateId) ?? null,
      lastTransitionAt: p.transitions[0]?.createdAt ?? p.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET pipeline error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

// POST — одобрить кандидата под вакансию (создаёт запись на DL_APPROVED)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const { candidateId, actor } = await req.json();
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId обязателен" }, { status: 400 });
    }
    const entry = await approveToVacancy(candidateId, vacancyId, actor || "Система");
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST pipeline error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
