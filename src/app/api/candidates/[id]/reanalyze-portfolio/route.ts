import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { scrapePortfolio, ScraperError } from "@/server/services/scraper";
import {
  analyzePortfolio,
  analyzePortfolioComm,
  PortfolioAnalyzerError,
} from "@/server/services/portfolio-analyzer";
import {
  classifyDirection,
  needsManualClassification,
  type DesignDirection,
} from "@/server/services/direction-classifier";

export const maxDuration = 500; // scraping + vision analysis (кейсы целиком)

/**
 * POST /api/candidates/[id]/reanalyze-portfolio
 *
 * Заново скрейпит портфолио кандидата и перезапускает визуальный анализ.
 * Поддерживает оба рубрика: продуктовый и коммуникационный.
 *
 * Body (опционально):
 *   { "direction": "product" | "communication" } — принудительно задать направление.
 *   Если не передано — определяется автоматически по роли / портфолио.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, grade: true, portfolioLinks: true, portfolioAnalysis: true },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 });
  }

  const link = candidate.portfolioLinks[0]?.trim();
  if (!link) {
    return NextResponse.json(
      { error: "У кандидата нет ссылки на портфолио" },
      { status: 400 },
    );
  }

  // Читаем direction из тела запроса или из существующего анализа
  let explicitDirection: DesignDirection | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.direction === "product" || body.direction === "communication") {
      explicitDirection = body.direction;
    }
  } catch {
    // Тело необязательно
  }

  try {
    console.log(`[reanalyze-portfolio] ${candidate.name}: scraping ${link}`);
    const scrapeResult = await scrapePortfolio(link);

    if (scrapeResult.screenshots.length === 0 && !scrapeResult.text) {
      return NextResponse.json(
        { error: "Не удалось получить данные с портфолио" },
        { status: 422 },
      );
    }

    // Определяем направление
    let resolvedDirection: DesignDirection = "product";

    if (explicitDirection) {
      resolvedDirection = explicitDirection;
      console.log(`[reanalyze-portfolio] Направление задано явно: ${resolvedDirection}`);
    } else {
      // Проверяем существующий анализ
      const existingAnalysis = candidate.portfolioAnalysis as { direction?: string } | null;
      if (existingAnalysis?.direction === "communication") {
        resolvedDirection = "communication";
        console.log(`[reanalyze-portfolio] Направление из существующего анализа: communication`);
      } else {
        // Классифицируем заново
        const classification = await classifyDirection(
          scrapeResult.text,
          scrapeResult.screenshots,
          candidate.role,
          { grade: candidate.grade },
        );
        console.log(
          `[reanalyze-portfolio] Классификация: ${classification.direction} (confidence=${classification.confidence})`,
        );

        if (needsManualClassification(classification)) {
          return NextResponse.json(
            {
              needsDirection: true,
              suggestedDirection: classification.direction,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
            },
            { status: 409 },
          );
        }

        resolvedDirection = classification.direction;
      }
    }

    const analysisCtx = {
      name: candidate.name,
      role: candidate.role,
      grade: candidate.grade,
    };

    console.log(
      `[reanalyze-portfolio] ${candidate.name}: analyzing as ${resolvedDirection} (${scrapeResult.screenshots.length} screenshots)`,
    );

    if (resolvedDirection === "communication") {
      const analysis = await analyzePortfolioComm(scrapeResult.text, scrapeResult.screenshots, analysisCtx, scrapeResult.screenshotMeta);

      await prisma.candidate.update({
        where: { id },
        data: {
          // Для коммуникационного — только JSON, product-поля оставляем null
          portfolioAnalysis: analysis as unknown as object,
          status: "PORTFOLIO_ANALYZED",
        },
      });

      return NextResponse.json({ success: true, analysis });
    } else {
      const analysis = await analyzePortfolio(scrapeResult.text, scrapeResult.screenshots, analysisCtx, scrapeResult.screenshotMeta, id, scrapeResult.pageImages);

      await prisma.candidate.update({
        where: { id },
        data: {
          visualStrength: analysis.scores.visualStrength,
          uxStrength: analysis.scores.uxStrength,
          productMaturity: analysis.scores.productMaturity,
          systemThinking: analysis.scores.systemThinking,
          argumentationQuality: analysis.scores.argumentationQuality,
          metricsImpact: analysis.scores.metricsImpact,
          researchDepth: analysis.scores.researchDepth,
          portfolioAnalysis: analysis as unknown as object,
          status: "PORTFOLIO_ANALYZED",
        },
      });

      return NextResponse.json({ success: true, analysis });
    }
  } catch (error) {
    if (error instanceof ScraperError) {
      return NextResponse.json({ error: `Скрейпинг: ${error.message}` }, { status: 422 });
    }
    if (error instanceof PortfolioAnalyzerError) {
      return NextResponse.json({ error: `Анализ: ${error.message}` }, { status: 502 });
    }
    console.error("[reanalyze-portfolio] error:", error);
    const msg = error instanceof Error ? error.message : "Внутренняя ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
