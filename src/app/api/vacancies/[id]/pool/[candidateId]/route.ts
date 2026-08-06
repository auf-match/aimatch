import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import type { PoolStatus } from "@prisma/client";

const VALID_STATUSES: PoolStatus[] = [
  "APPROVED",
  "REJECTED_MANUAL",
  "MAYBE",
  "REVIEWED",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { id, candidateId } = await params;

  try {
    const body = await req.json();
    const { poolStatus, reviewNote, reviewedBy } = body;

    if (!poolStatus || !VALID_STATUSES.includes(poolStatus)) {
      return NextResponse.json(
        {
          error: `poolStatus должен быть одним из: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!reviewedBy) {
      return NextResponse.json(
        { error: "reviewedBy обязателен" },
        { status: 400 },
      );
    }

    const result = await prisma.screeningResult.update({
      where: {
        candidateId_vacancyId: {
          candidateId,
          vacancyId: id,
        },
      },
      data: {
        poolStatus,
        reviewNote: reviewNote || null,
        reviewedBy,
        reviewedAt: new Date(),
      },
      include: {
        candidate: true,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Record to update not found")
    ) {
      return NextResponse.json(
        { error: "Кандидат не найден в пуле этой вакансии" },
        { status: 404 },
      );
    }
    console.error("Pool update error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении статуса" },
      { status: 500 },
    );
  }
}
