import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  INSIGHT_CATEGORIES,
  emptyInsights,
  type InsightCategory,
  type Insights,
  type InsightItem,
} from "@/lib/interview-insights";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: vacancyId, itemId } = await params;
  try {
    const patch = (await req.json()) as { text?: string; important?: boolean; hidden?: boolean };

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const vacancy = await prisma.vacancy.findUnique({
        where: { id: vacancyId },
        select: { interviewInsights: true, updatedAt: true },
      });
      if (!vacancy) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });

      const current = (vacancy.interviewInsights as unknown as Insights) ?? emptyInsights();
      let foundIn: InsightCategory | null = null;
      let foundIndex = -1;
      for (const cat of INSIGHT_CATEGORIES) {
        const idx = (current[cat] ?? []).findIndex((i) => i.id === itemId);
        if (idx >= 0) { foundIn = cat; foundIndex = idx; break; }
      }
      if (!foundIn) return NextResponse.json({ error: "Инсайт не найден" }, { status: 404 });

      const prevItem = current[foundIn][foundIndex];
      const updated: InsightItem = {
        ...prevItem,
        ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
        ...(patch.important !== undefined ? { important: !!patch.important } : {}),
        ...(patch.hidden !== undefined ? { hidden: !!patch.hidden } : {}),
      };
      if (!updated.text) {
        return NextResponse.json({ error: "Пустой текст" }, { status: 400 });
      }
      const nextArr = [...current[foundIn]];
      nextArr[foundIndex] = updated;
      const next: Insights = { ...current, [foundIn]: nextArr };

      const res = await prisma.vacancy.updateMany({
        where: { id: vacancyId, updatedAt: vacancy.updatedAt },
        data: { interviewInsights: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 1) return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Не удалось сохранить (много гонок)" }, { status: 500 });
  } catch (error) {
    console.error("PATCH insight item error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
