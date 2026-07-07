import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

// GET — данные общей воронки по всем ОТКРЫТЫМ вакансиям.
// Query: ?vacancyIds=id1,id2 — опционально сузить набор (AND с фильтром OPEN).
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("vacancyIds");
    const requestedIds = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const pipelines = await prisma.pipeline.findMany({
      where: {
        vacancy: { status: "OPEN" },
        ...(requestedIds ? { vacancyId: { in: requestedIds } } : {}),
      },
      include: {
        candidate: { select: { id: true, name: true, role: true, grade: true } },
        vacancy: { select: { id: true, title: true, clientName: true } },
        transitions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    // overall score: DetailedScore -> MatchResult -> null.
    // Скоры уникальны по паре (candidateId, vacancyId), поэтому ключ — обе части.
    const pairs = pipelines.map((p) => ({ candidateId: p.candidateId, vacancyId: p.vacancyId }));
    const candidateIds = [...new Set(pairs.map((x) => x.candidateId))];
    const vacancyIds = [...new Set(pairs.map((x) => x.vacancyId))];

    const [detailed, matches] = await Promise.all([
      prisma.detailedScore.findMany({
        where: { candidateId: { in: candidateIds }, vacancyId: { in: vacancyIds } },
        select: { candidateId: true, vacancyId: true, overallScore: true },
      }),
      prisma.matchResult.findMany({
        where: { candidateId: { in: candidateIds }, vacancyId: { in: vacancyIds } },
        select: { candidateId: true, vacancyId: true, overallScore: true },
      }),
    ]);
    const key = (c: string, v: string) => `${c}::${v}`;
    const scoreByPair = new Map<string, number>();
    for (const m of matches) scoreByPair.set(key(m.candidateId, m.vacancyId), m.overallScore);
    for (const d of detailed) scoreByPair.set(key(d.candidateId, d.vacancyId), d.overallScore);

    const result = pipelines.map((p) => ({
      candidateId: p.candidateId,
      candidate: p.candidate,
      vacancyId: p.vacancyId,
      vacancy: p.vacancy,
      stage: p.stage,
      score: scoreByPair.get(key(p.candidateId, p.vacancyId)) ?? null,
      lastTransitionAt: p.transitions[0]?.createdAt ?? p.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/pipeline error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
