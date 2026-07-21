/**
 * Анализ импортированного кандидата (у которого есть только имя + ссылка).
 *
 * Повторяет путь upload-роута для случая «только портфолио»:
 *   scrape → parseResume(текст портфолио) → classifyDirection →
 *   analyzePortfolio(+Comm) → update(role/grade/...) → embedding.
 *
 * Почему не reanalyze-portfolio: тот роут role/grade только читает и не
 * обновляет — импортированный остался бы role: OTHER и невидимым для матчинга.
 *
 * Обработка ошибок по стадиям (важно для бюджета на ~2000 профилей):
 *   - скрейп/мёртвая страница упали → ANALYSIS_FAILED (не платили, терять нечего)
 *   - parseResume упал → ANALYSIS_FAILED (role/grade не получены)
 *   - parseResume прошёл, но classify/analyze упали → СОХРАНЯЕМ парсинг
 *     (role/grade/skills + эмбеддинг), portfolioAnalysis не трогаем, status: PARSED.
 *     Иначе транзиентный 503 от Gemini заставит платить за parseResume заново.
 *     Оценки портфолио потом добираются точечно кнопкой «Переанализировать
 *     портфолио» (reanalyze-portfolio) — ей как раз нужны уже готовые role/grade.
 *   - эмбеддинг упал → best-effort, статус не понижаем (как в upload)
 *
 * Никогда не бросает наружу — fire-and-forget безопасен (вызывается из
 * route-хендлеров без ожидания).
 */
import { prisma } from "@/server/db";
import { scrapePortfolio } from "@/server/services/scraper";
import { parseResume } from "@/server/services/claude";
import { classifyDirection } from "@/server/services/direction-classifier";
import {
  analyzePortfolio,
  analyzePortfolioComm,
  type AnyPortfolioAnalysis,
} from "@/server/services/portfolio-analyzer";
import {
  generateEmbedding,
  buildCandidateEmbeddingText,
  EMBEDDING_MODEL,
} from "@/server/services/embeddings";
import { isDeadBehancePage } from "@/lib/behance-import";
import { markStarted, markFinished } from "@/server/services/analysis-tracker";
import type { Prisma } from "@prisma/client";

export async function analyzeImportedCandidate(candidateId: string): Promise<void> {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        name: true,
        portfolioLinks: true,
        location: true,
        telegramContact: true,
        email: true,
        linkedinUrl: true,
      },
    });
    if (!candidate) return;

    const link = candidate.portfolioLinks[0];
    if (!link) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "ANALYSIS_FAILED", lastAnalysisError: "Нет ссылки на портфолио" },
      });
      return;
    }

    markStarted({
      id: candidateId,
      name: candidate.name,
      portfolioLink: link,
      startedAt: Date.now(),
    });
    try {
      const scrape = await scrapePortfolio(link);

      if (isDeadBehancePage(scrape.title ?? "")) {
        await prisma.candidate.update({
          where: { id: candidateId },
          data: { status: "ANALYSIS_FAILED", lastAnalysisError: "Страница портфолио недоступна (dead page)" },
        });
        return;
      }

      // parseResume падает — считаем стадию неуспешной целиком: role/grade
      // не получены, сохранять нечего (см. заголовок файла).
      const data = await parseResume(scrape.text, "pdf", undefined, scrape.screenshots);

      let analysis: AnyPortfolioAnalysis | null = null;
      try {
        const classification = await classifyDirection(
          scrape.text,
          scrape.screenshots,
          data.role ?? "OTHER",
          { grade: data.grade },
        );
        const ctx = { name: candidate.name, role: data.role, grade: data.grade };
        analysis =
          classification.direction === "communication"
            ? await analyzePortfolioComm(scrape.text, scrape.screenshots, ctx)
            : await analyzePortfolio(scrape.text, scrape.screenshots, ctx);
      } catch (err) {
        // Портфолио-анализ — best-effort стадия. parseResume уже оплачен и дал
        // role/grade — не теряем это из-за транзиентного сбоя классификации/анализа.
        console.error(`[candidate-analysis] portfolio analysis failed for ${candidateId} (keeping parseResume result):`, err);
        analysis = null;
      }

      const updated = await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          role: data.role,
          grade: data.grade,
          yearsOfExperience: data.yearsOfExperience,
          specializations: data.specializations ?? [],
          domains: data.domains ?? [],
          segment: data.segment,
          platforms: data.platforms ?? [],
          skills: data.skills ?? [],
          tools: data.tools ?? [],
          // Не затираем контакты, импортированные из Behance-JSON, пустыми
          // значениями от parseResume (Behance-страницы почти никогда не
          // содержат email/telegram/location в видимом тексте).
          location: data.location ?? candidate.location,
          timezone: data.timezone,
          languages: data.languages ?? undefined,
          salaryExpectations: data.salaryExpectations,
          education: data.education,

          hasBigtechExperience: data.hasBigtechExperience,
          hasStudioExperience: data.hasStudioExperience,
          hasInternationalExperience: data.hasInternationalExperience,

          aiSummary: data.aiSummary,
          aiStrengths: data.aiStrengths ?? [],
          aiConcerns: data.aiConcerns ?? [],
          aiConfidenceScore: data.aiConfidenceScore,

          telegramContact: data.telegramContact ?? candidate.telegramContact,
          email: data.email ?? candidate.email,
          linkedinUrl: data.linkedinUrl ?? candidate.linkedinUrl,

          resumeRawText: scrape.text,

          // Стадия анализа портфолио не удалась — НЕ трогаем portfolioAnalysis
          // (undefined = "не обновлять поле" в Prisma), статус остаётся PARSED.
          ...(analysis && analysis.direction === "product" && {
            visualStrength: analysis.scores.visualStrength,
            uxStrength: analysis.scores.uxStrength,
            productMaturity: analysis.scores.productMaturity,
            systemThinking: analysis.scores.systemThinking,
            argumentationQuality: analysis.scores.argumentationQuality,
            metricsImpact: analysis.scores.metricsImpact,
            researchDepth: analysis.scores.researchDepth,
            portfolioAnalysis: analysis as unknown as Prisma.InputJsonValue,
          }),
          ...(analysis && analysis.direction === "communication" && {
            portfolioAnalysis: analysis as unknown as Prisma.InputJsonValue,
          }),

          status: analysis ? "PORTFOLIO_ANALYZED" : "PARSED",
        },
      });

      try {
        const embeddingText = buildCandidateEmbeddingText(updated);
        const vector = await generateEmbedding(embeddingText, "document");
        await prisma.candidate.update({
          where: { id: candidateId },
          data: {
            embedding: vector,
            embeddingText,
            embeddingModel: EMBEDDING_MODEL,
            embeddingUpdatedAt: new Date(),
          },
        });
      } catch (err) {
        // Эмбеддинг — best-effort, не понижаем статус (как в upload-роуте).
        console.error(`[candidate-analysis] embedding failed for ${candidateId}:`, err);
      }
    } finally {
      markFinished(candidateId);
    }
  } catch (err) {
    console.error(`[candidate-analysis] analyzeImportedCandidate failed for ${candidateId}:`, err);
    try {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          status: "ANALYSIS_FAILED",
          lastAnalysisError: String(err instanceof Error ? err.message : err).slice(0, 500),
        },
      });
    } catch (inner) {
      console.error(`[candidate-analysis] failed to mark ANALYSIS_FAILED for ${candidateId}:`, inner);
    }
  }
}
