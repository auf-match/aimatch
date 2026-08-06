import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { analyzeImportedCandidate } from "@/server/services/candidate-analysis";

export const maxDuration = 300;

const ALLOWED_LIMITS = [10, 20, 50, 100];
const CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  try {
    let body: { limit?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
    }
    const { limit } = body;
    if (!limit || !ALLOWED_LIMITS.includes(limit)) {
      return NextResponse.json({ error: "limit должен быть 10, 20, 50 или 100" }, { status: 400 });
    }

    // Фильтр по источникам импорта обязателен — иначе пачка захватит любых
    // прочих кандидатов со статусом NEW и перезапишет им role/grade.
    const candidates = await prisma.candidate.findMany({
      where: {
        status: "NEW",
        source: { not: null },
        portfolioLinks: { isEmpty: false },
      },
      select: { id: true },
      take: limit,
    });

    // Fire-and-forget: обрабатываем пачками по CONCURRENCY.
    // Рассчитано на долгоживущий Node-процесс (VPS/Railway).
    // Известное ограничение: строки не «застолбляются» атомарно перед обработкой.
    // Повторный вызов до завершения пачки (или ретрай отдельного кандидата из
    // той же пачки) может обработать кандидата дважды — лишний AI-расход, но не
    // порча данных (последняя запись побеждает). Осознанный компромисс для
    // админ-инструмента с одним оператором и редкими ручными запусками.
    void (async () => {
      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const chunk = candidates.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((c) => analyzeImportedCandidate(c.id)));
      }
    })().catch((err) => console.error("analyze-batch background threw:", err));

    return NextResponse.json({ started: candidates.length });
  } catch (error) {
    console.error("POST analyze-batch error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
