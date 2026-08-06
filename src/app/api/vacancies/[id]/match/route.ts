import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { matchCandidates } from "@/server/services/matching-engine";

export const maxDuration = 300; // 5 minutes — matching can take a while

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

    const results = await matchCandidates(id);

    return NextResponse.json({
      vacancyId: id,
      totalMatched: results.length,
      results,
    });
  } catch (error) {
    console.error("POST /api/vacancies/:id/match error:", error);
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    const results = await prisma.matchResult.findMany({
      where: { vacancyId: id },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            role: true,
            grade: true,
            aiSummary: true,
          },
        },
      },
      orderBy: { overallScore: "desc" },
    });

    return NextResponse.json({
      vacancyId: id,
      totalMatched: results.length,
      results,
    });
  } catch (error) {
    console.error("GET /api/vacancies/:id/match error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
