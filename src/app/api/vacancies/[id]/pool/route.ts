import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import type { PoolStatus } from "@prisma/client";

const POOL_STATUS_ORDER: Record<PoolStatus, number> = {
  NEW: 0,
  MAYBE: 1,
  REVIEWED: 2,
  APPROVED: 3,
  REJECTED_MANUAL: 4,
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const statusParam = searchParams.get("status");

  try {
    const vacancy = await prisma.vacancy.findUnique({ where: { id } });
    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    const where: Record<string, unknown> = {
      vacancyId: id,
      decision: "PASS",
    };

    // Фильтр по poolStatus
    if (statusParam) {
      const statuses = statusParam.split(",") as PoolStatus[];
      where.poolStatus = { in: statuses };
    }

    const results = await prisma.screeningResult.findMany({
      where,
      include: {
        candidate: {
          include: { experiences: true },
        },
      },
    });

    // Сортировка: NEW → MAYBE → REVIEWED → APPROVED → REJECTED_MANUAL
    results.sort(
      (a, b) =>
        POOL_STATUS_ORDER[a.poolStatus] - POOL_STATUS_ORDER[b.poolStatus],
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("Pool error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке пула" },
      { status: 500 },
    );
  }
}
