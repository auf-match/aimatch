import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  applyDiffSelection,
  diffTouchesScoringFields,
  type DiffItem,
  type SelectedItem,
} from "@/lib/vacancy-update";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id: vacancyId, updateId } = await params;
  try {
    const { selections } = (await req.json()) as { selections: SelectedItem[] };
    if (!Array.isArray(selections)) {
      return NextResponse.json({ error: "selections обязателен" }, { status: 400 });
    }

    const update = await prisma.vacancyUpdate.findUnique({
      where: { id: updateId },
      include: { vacancy: true },
    });
    if (!update || update.vacancyId !== vacancyId) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (update.status !== "PENDING") {
      return NextResponse.json(
        { error: "Запись не в статусе PENDING" },
        { status: 409 },
      );
    }

    const proposed = (update.proposedDiff || []) as unknown as DiffItem[];
    const { payload, appliedDiff } = applyDiffSelection(
      update.vacancy as unknown as Record<string, unknown>,
      proposed,
      selections,
    );

    const touchesScoring = diffTouchesScoringFields(appliedDiff);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.vacancy.update({
        where: { id: vacancyId },
        data: {
          ...payload,
          ...(touchesScoring ? { criteriaUpdatedAt: now } : {}),
        },
      });
      await tx.vacancyUpdate.update({
        where: { id: updateId },
        data: {
          status: "APPLIED",
          appliedDiff: appliedDiff as unknown as object,
          appliedAt: now,
        },
      });
    });

    return NextResponse.json({ ok: true, applied: appliedDiff.length, touchesScoring });
  } catch (error) {
    console.error("POST apply error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
