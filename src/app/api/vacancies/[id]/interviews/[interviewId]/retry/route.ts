import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { processVacancyInterview } from "@/server/services/interview-insights";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; interviewId: string }> },
) {
  const { id: vacancyId, interviewId } = await params;
  try {
    const interview = await prisma.vacancyInterview.findUnique({ where: { id: interviewId } });
    if (!interview || interview.vacancyId !== vacancyId) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }

    // Перезапуск возможен если: status=FAILED, или READY с errorMessage (парсинг упал).
    const canRetry =
      interview.status === "FAILED" ||
      (interview.status === "READY" && !!interview.errorMessage);
    if (!canRetry) {
      return NextResponse.json({ error: "Нечего повторять" }, { status: 409 });
    }

    // Если статус был FAILED — сбрасываем в PROCESSING, чтобы processVacancyInterview его подхватил.
    // Если READY с errorMessage — оставляем READY, чтобы фаза 1 пропустилась и запустился только парсинг.
    if (interview.status === "FAILED") {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { status: "PROCESSING", errorMessage: null },
      });
    } else {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { errorMessage: null },
      });
    }

    void processVacancyInterview(interviewId).catch((err) =>
      console.error("retry processVacancyInterview threw:", err),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST retry error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
