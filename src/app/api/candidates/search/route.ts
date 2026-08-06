import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { semanticSearch } from "@/server/services/semantic-search";
import { ClaudeServiceError } from "@/server/services/claude";
import { EmbeddingError } from "@/server/services/embeddings";

export const maxDuration = 60; // LLM-разбор + эмбеддинг запроса

/**
 * POST /api/candidates/search
 * Body: { query: string, limit?: number }
 *
 * Семантический поиск «найди как»: разбирает запрос, фильтрует, ранжирует
 * по векторному сходству. Возвращает гидрированные карточки в порядке score.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 30));

    if (!query) {
      return NextResponse.json({ error: "Пустой поисковый запрос" }, { status: 400 });
    }

    const search = await semanticSearch(query, limit);

    // Гидрируем карточки по id, сохраняя порядок ранжирования
    const ids = search.results.map((r) => r.id);
    if (ids.length === 0) {
      return NextResponse.json({
        parsed: search.parsed,
        stats: search.stats,
        data: [],
      });
    }

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: ids } },
      include: { experiences: true },
    });

    // Восстанавливаем порядок + прикрепляем score/indexed
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const scoreById = new Map(search.results.map((r) => [r.id, r]));

    const data = ids
      .map((id) => {
        const c = byId.get(id);
        if (!c) return null;
        const meta = scoreById.get(id);
        return { ...c, searchScore: meta?.score ?? 0, searchIndexed: meta?.indexed ?? false };
      })
      .filter(Boolean);

    return NextResponse.json({
      parsed: search.parsed,
      stats: search.stats,
      data,
    });
  } catch (error) {
    if (error instanceof ClaudeServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof EmbeddingError) {
      return NextResponse.json({ error: `Эмбеддинг: ${error.message}` }, { status: 502 });
    }
    console.error("POST /api/candidates/search error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
