import { NextRequest, NextResponse } from "next/server";
import { movePipelineStage } from "@/server/services/pipeline";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { id: vacancyId, candidateId } = await params;
  try {
    const { toStage, actor, note } = await req.json();
    if (!toStage) {
      return NextResponse.json({ error: "toStage обязателен" }, { status: 400 });
    }
    const updated = await movePipelineStage(candidateId, vacancyId, toStage, actor || "Система", note);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Кандидат не в воронке этой вакансии" }, { status: 404 });
    }
    console.error("POST move error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
