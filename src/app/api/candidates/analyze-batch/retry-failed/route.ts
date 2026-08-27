import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { analyzeImportedCandidate } from "@/server/services/candidate-analysis";

export const maxDuration = 500;

const ALLOWED_LIMITS = [10, 20, 50, 100];
const CONCURRENCY = 1; // по одному — см. analyze-batch

/**
 * POST /api/candidates/analyze-batch/retry-failed
 * Body: { limit?: 10 | 20 | 50 | 100 }  (по умолчанию 50)
 *
 * Повторно прогоняет кандидатов со статусом ANALYSIS_FAILED (из импорта).
 * analyzeImportedCandidate статус-независим: заново гоняет весь пайплайн,
 * на успехе ставит PORTFOLIO_ANALYZED/PARSED, на провале — снова ANALYSIS_FAILED.
 * Fire-and-forget, порциями по CONCURRENCY (как в analyze-batch).
 */
export async function POST(req: NextRequest) {
  try {
    let limit = 50;
    try {
      const body = (await req.json()) as { limit?: number };
      if (body?.limit != null) {
        if (!ALLOWED_LIMITS.includes(body.limit)) {
          return NextResponse.json({ error: "limit должен быть 10, 20, 50 или 100" }, { status: 400 });
        }
        limit = body.limit;
      }
    } catch {
      // тело необязательно — используем дефолт
    }

    const candidates = await prisma.candidate.findMany({
      where: {
        status: "ANALYSIS_FAILED",
        source: { not: null },
      },
      select: { id: true },
      take: limit,
    });

    void (async () => {
      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const chunk = candidates.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((c) => analyzeImportedCandidate(c.id)));
      }
    })().catch((err) => console.error("retry-failed background threw:", err));

    return NextResponse.json({ started: candidates.length });
  } catch (error) {
    console.error("POST analyze-batch/retry-failed error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
