import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { analyzeImportedCandidate } from "@/server/services/candidate-analysis";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 });
    }
    // Вернуть в очередь, чтобы UI сразу показал «в работе»
    await prisma.candidate.update({ where: { id }, data: { status: "NEW" } });

    void analyzeImportedCandidate(id).catch((err) =>
      console.error("analyze-import background threw:", err),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST analyze-import error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
