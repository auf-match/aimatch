import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

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
    if (update.status !== "PENDING" && update.status !== "EMPTY") {
      return NextResponse.json({ error: "Нечего отклонять" }, { status: 409 });
    }
    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: { status: "DISMISSED" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST dismiss error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
