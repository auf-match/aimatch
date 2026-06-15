import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { detailedScore } from "@/server/services/detailed-scorer";
import { isStaleScore } from "@/lib/vacancy-update";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: vacancyId },
      select: { id: true, criteriaUpdatedAt: true },
    });
    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }
    if (!vacancy.criteriaUpdatedAt) {
      return NextResponse.json({ rescored: 0, total: 0 });
    }

    const stale = await prisma.detailedScore.findMany({
      where: { vacancyId },
      select: { candidateId: true, createdAt: true },
    });
    const toRescore = stale.filter((s) =>
      isStaleScore(s.createdAt, vacancy.criteriaUpdatedAt),
    );

    let rescored = 0;
    for (const s of toRescore) {
      try {
        const result = await detailedScore(vacancyId, s.candidateId);
        // delete + create в транзакции — иначе createdAt не обновится:
        // `@default(now())` срабатывает только при INSERT, а у Prisma `update`
        // явное `createdAt: new Date()` тоже не помогает, если столбец только
        // дефолт. Без бампа createdAt запись осталась бы вечно устаревшей.
        await prisma.$transaction([
          prisma.detailedScore.delete({
            where: { candidateId_vacancyId: { candidateId: s.candidateId, vacancyId } },
          }),
          prisma.detailedScore.create({
            data: {
              candidateId: s.candidateId,
              vacancyId,
              overallScore: result.overallScore,
              criteriaScores: result.criteriaScores as unknown as object,
              matchExplanation: result.matchExplanation,
              strengthsForVacancy: result.strengthsForVacancy,
              gaps: result.gaps,
              clarificationQuestions: result.clarificationQuestions,
              clarificationMessage: result.clarificationMessage,
            },
          }),
        ]);
        rescored++;
      } catch (err) {
        console.error(`rescore failed for candidate ${s.candidateId}:`, err);
      }
    }

    return NextResponse.json({ rescored, total: toRescore.length });
  } catch (error) {
    console.error("POST rescore-stale error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
