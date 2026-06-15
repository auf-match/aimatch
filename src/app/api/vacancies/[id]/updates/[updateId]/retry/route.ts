import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { processVacancyUpdate } from "@/server/services/vacancy-update";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id: vacancyId, updateId } = await params;
  try {
    const update = await prisma.vacancyUpdate.findUnique({ where: { id: updateId } });
    if (!update || update.vacancyId !== vacancyId) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (update.status !== "FAILED") {
      return NextResponse.json({ error: "Перезапуск возможен только для FAILED" }, { status: 409 });
    }
    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: { status: "PROCESSING", errorMessage: null },
    });
    void processVacancyUpdate(updateId).catch((err) =>
      console.error("retry processVacancyUpdate threw:", err),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST retry error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
