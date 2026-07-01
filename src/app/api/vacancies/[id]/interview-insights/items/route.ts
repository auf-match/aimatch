import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  INSIGHT_CATEGORIES,
  emptyInsights,
  normalizeText,
  type InsightCategory,
  type Insights,
  type InsightItem,
} from "@/lib/interview-insights";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const { category, text } = (await req.json()) as { category?: string; text?: string };
    if (!category || !INSIGHT_CATEGORIES.includes(category as InsightCategory)) {
      return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
    }
    const trimmed = (text ?? "").trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Пустой текст" }, { status: 400 });
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const vacancy = await prisma.vacancy.findUnique({
        where: { id: vacancyId },
        select: { interviewInsights: true, updatedAt: true },
      });
      if (!vacancy) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });

      const current = (vacancy.interviewInsights as unknown as Insights) ?? emptyInsights();
      const cat = category as InsightCategory;
      const key = normalizeText(trimmed);
      if ((current[cat] ?? []).some((i) => normalizeText(i.text) === key)) {
        return NextResponse.json({ error: "Такой инсайт уже есть" }, { status: 409 });
      }

      const item: InsightItem = {
        id: nanoid(),
        text: trimmed,
        important: false,
        hidden: false,
        origin: "manual",
        createdAt: new Date().toISOString(),
      };
      const next: Insights = { ...current, [cat]: [...(current[cat] ?? []), item] };

      const res = await prisma.vacancy.updateMany({
        where: { id: vacancyId, updatedAt: vacancy.updatedAt },
        data: { interviewInsights: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 1) return NextResponse.json(item, { status: 201 });
    }
    return NextResponse.json({ error: "Не удалось сохранить (много гонок)" }, { status: 500 });
  } catch (error) {
    console.error("POST insight item error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
