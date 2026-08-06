import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { detailedScore } from "@/server/services/detailed-scorer";

export const maxDuration = 60; // LLM-скоринг соответствия

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { id, candidateId } = await params;

  try {
    const result = await detailedScore(id, candidateId);

    // Зеркалим в MatchResult, чтобы кандидат появился в списке
    // «Результаты матчинга» на странице вакансии (та же форма данных).
    const matchData = {
      overallScore: result.overallScore,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      criteriaScores: result.criteriaScores as any,
      matchExplanation: result.matchExplanation,
      strengthsForVacancy: result.strengthsForVacancy,
      gaps: result.gaps,
      clarificationQuestions: result.clarificationQuestions,
      clarificationMessage: result.clarificationMessage,
    };
    await prisma.matchResult.upsert({
      where: { candidateId_vacancyId: { candidateId, vacancyId: id } },
      update: matchData,
      create: { candidateId, vacancyId: id, ...matchData },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Detailed scoring error:", error);
    const message =
      error instanceof Error ? error.message : "Ошибка детального скоринга";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { id, candidateId } = await params;

  try {
    const score = await prisma.detailedScore.findUnique({
      where: {
        candidateId_vacancyId: { candidateId, vacancyId: id },
      },
      include: {
        candidate: true,
      },
    });

    if (!score) {
      return NextResponse.json(
        { error: "Скоринг для этого кандидата ещё не проведён" },
        { status: 404 },
      );
    }

    return NextResponse.json(score);
  } catch (error) {
    console.error("Get score error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке скоринга" },
      { status: 500 },
    );
  }
}
