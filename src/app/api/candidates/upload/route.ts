import { savePageImages, saveInterfaceShots } from "@/server/services/interface-shots";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { extractText } from "@/server/utils/file-processing";
import { parseResume } from "@/server/services/claude";
import { prisma } from "@/server/db";
import { FileProcessingError } from "@/server/utils/file-processing";
import { ClaudeServiceError } from "@/server/services/claude";
import { scrapePortfolio, ScraperError } from "@/server/services/scraper";
import {
  analyzePortfolio,
  analyzePortfolioComm,
  PortfolioAnalyzerError,
  type AnyPortfolioAnalysis,
} from "@/server/services/portfolio-analyzer";
import {
  classifyDirection,
  needsManualClassification,
  type DesignDirection,
} from "@/server/services/direction-classifier";
import {
  generateEmbedding,
  buildCandidateEmbeddingText,
  EMBEDDING_MODEL,
} from "@/server/services/embeddings";
import type { ScreenshotMeta } from "@/lib/screenshot-select";

export const maxDuration = 500; // scraping + resume parse + portfolio analysis (кейсы целиком)

const uploadDir = process.env.UPLOAD_DIR || "./uploads";

export async function POST(req: NextRequest) {
  let savedPath: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File | null;
    const portfolioLink = formData.get("portfolioLink") as string | null;

    if (!file && !portfolioLink?.trim()) {
      return NextResponse.json(
        { error: "Загрузите резюме (PDF/DOCX) или укажите ссылку на портфолио" },
        { status: 400 },
      );
    }

    let text = "";
    let fileType: "pdf" | "docx" = "pdf";
    let buffer: Buffer | undefined;
    let portfolioScreenshots: Buffer[] | undefined;
    let portfolioScreenshotMeta: ScreenshotMeta[] | undefined;
    // Картинки со страниц портфолио — их и покажем в карточке
    let portfolioPageImages:
      | { buffer: Buffer; caseTitle?: string }[]
      | undefined;

    // Обработка файла (если есть)
    if (file) {
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== ".pdf" && ext !== ".docx") {
        return NextResponse.json(
          { error: "Поддерживаются только .pdf и .docx файлы" },
          { status: 400 },
        );
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Файл слишком большой (макс. 10MB)" },
          { status: 400 },
        );
      }

      await mkdir(uploadDir, { recursive: true });
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      savedPath = path.join(uploadDir, filename);
      buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(savedPath, buffer);

      const extracted = await extractText(buffer, file.name);
      text = extracted.text;
      fileType = extracted.fileType;
    }

    // Скрейпинг портфолио (если указана ссылка)
    if (portfolioLink?.trim()) {
      try {
        console.log(`Скрейпинг портфолио: ${portfolioLink.trim()}`);
        const scrapeResult = await scrapePortfolio(portfolioLink.trim());

        // Добавить текст портфолио к тексту резюме
        if (scrapeResult.text) {
          text = text
            ? `${text}\n\n=== ПОРТФОЛИО ===\n${scrapeResult.text}`
            : scrapeResult.text;
        }

        // Сохранить скриншоты для отправки в AI
        if (scrapeResult.screenshots.length > 0) {
          portfolioScreenshots = scrapeResult.screenshots;
          portfolioScreenshotMeta = scrapeResult.screenshotMeta;
          portfolioPageImages = scrapeResult.pageImages;
        }

        console.log(
          `Скрейпинг завершён: ${scrapeResult.text.length} символов, ${scrapeResult.screenshots.length} скриншотов`
        );
      } catch (error) {
        // Если скрейпинг упал — продолжаем без него (если есть файл)
        const msg = error instanceof ScraperError ? error.message : "Ошибка скрейпинга";
        console.error(`Скрейпинг не удался: ${msg}`);

        if (!file) {
          return NextResponse.json(
            { error: `Не удалось загрузить портфолио: ${msg}` },
            { status: 422 },
          );
        }
        // Если есть файл — просто логируем и продолжаем
      }
    }

    // Проверка что есть хоть какие-то данные для AI
    const hasContent = text.trim().length > 50 || buffer || (portfolioScreenshots && portfolioScreenshots.length > 0);
    if (!hasContent) {
      return NextResponse.json(
        { error: "Не удалось извлечь данные. Попробуйте загрузить PDF-резюме." },
        { status: 422 },
      );
    }

    // Парсинг через Gemini
    const candidateData = await parseResume(
      text,
      fileType,
      fileType === "pdf" ? buffer : undefined,
      portfolioScreenshots,
    );

    // Портфолио
    const portfolioLinks = candidateData.portfolioLinks || [];
    if (portfolioLink?.trim() && !portfolioLinks.includes(portfolioLink.trim())) {
      portfolioLinks.push(portfolioLink.trim());
    }

    // ── Определение направления дизайнера ──────────────────────────
    // Продуктовый или коммуникационный рубрик выбирается по роли.
    // Для неоднозначных ролей (ART_DIRECTOR, DESIGN_LEAD, OTHER) —
    // классифицируем по портфолио. Если уверенность < 70% — просим
    // рекрутера уточнить вручную (409 needsDirection).

    // Рекрутер может передать direction явно при повторной отправке
    const explicitDirection = formData.get("direction") as DesignDirection | null;

    let resolvedDirection: DesignDirection = "product";

    if (explicitDirection === "product" || explicitDirection === "communication") {
      resolvedDirection = explicitDirection;
      console.log(`[upload] Направление задано явно: ${resolvedDirection}`);
    } else if (portfolioScreenshots && portfolioScreenshots.length > 0) {
      try {
        const classification = await classifyDirection(
          text,
          portfolioScreenshots,
          candidateData.role ?? "OTHER",
          { grade: candidateData.grade },
        );
        console.log(
          `[upload] Направление: ${classification.direction} (confidence=${classification.confidence}, auto=${classification.isAutoDetected})`,
        );

        if (needsManualClassification(classification)) {
          // Уверенность < 70% для неоднозначной роли — просим уточнить
          return NextResponse.json(
            {
              needsDirection: true,
              suggestedDirection: classification.direction,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              parsedName: candidateData.name,
            },
            { status: 409 },
          );
        }

        resolvedDirection = classification.direction;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Ошибка классификации";
        console.warn(`[upload] Классификация направления не удалась, использую product: ${msg}`);
        resolvedDirection = "product";
      }
    }

    // ── Визуальный анализ портфолио (best-effort) ──────────────────
    // Делаем отдельным шагом — даже если упадёт, кандидат сохранится.
    let portfolioAnalysis: AnyPortfolioAnalysis | null = null;
    if (portfolioScreenshots && portfolioScreenshots.length > 0) {
      try {
        console.log(
          `[upload] Запуск анализа портфолио (direction=${resolvedDirection}, ${portfolioScreenshots.length} скриншотов)`,
        );
        const analysisCtx = { name: candidateData.name, role: candidateData.role, grade: candidateData.grade };

        if (resolvedDirection === "communication") {
          portfolioAnalysis = await analyzePortfolioComm(text, portfolioScreenshots, analysisCtx, portfolioScreenshotMeta);
          console.log(
            `[upload] Comm-анализ готов: visualCraft=${(portfolioAnalysis.scores as { visualCraft: number | null }).visualCraft}`,
          );
        } else {
          portfolioAnalysis = await analyzePortfolio(text, portfolioScreenshots, analysisCtx, portfolioScreenshotMeta);
          const ps = portfolioAnalysis.scores as { visualStrength: number | null; uxStrength: number | null; productMaturity: number | null };
          console.log(
            `[upload] Product-анализ готов: visual=${ps.visualStrength}, ux=${ps.uxStrength}, product=${ps.productMaturity}`,
          );
        }
      } catch (error) {
        const msg = error instanceof PortfolioAnalyzerError ? error.message : "Неизвестная ошибка";
        console.error(`[upload] Анализ портфолио не удался (не критично): ${msg}`);
      }
    }

    // ── Проверка дубликатов ───────────────────────────────────────
    // Пропускаем если рекрутер явно подтвердил создание дубликата
    const forceCreate = formData.get("forceCreate") === "true";

    if (!forceCreate) {
      const orConditions: { email?: string; linkedinUrl?: string }[] = [];
      if (candidateData.email?.trim()) orConditions.push({ email: candidateData.email.trim() });
      if (candidateData.linkedinUrl?.trim()) orConditions.push({ linkedinUrl: candidateData.linkedinUrl.trim() });

      if (orConditions.length > 0) {
        const existing = await prisma.candidate.findFirst({
          where: { OR: orConditions },
          select: { id: true, name: true, role: true, grade: true, email: true, linkedinUrl: true, createdAt: true },
        });

        if (existing) {
          const reason = existing.email === candidateData.email?.trim() ? "email" : "LinkedIn";
          return NextResponse.json(
            {
              duplicate: true,
              reason,
              existing,
              parsedName: candidateData.name,
            },
            { status: 409 },
          );
        }
      }
    }

    // Сохранить в БД
    const candidate = await prisma.candidate.create({
      data: {
        name: candidateData.name,
        role: candidateData.role,
        grade: candidateData.grade,
        yearsOfExperience: candidateData.yearsOfExperience,
        specializations: candidateData.specializations,
        domains: candidateData.domains,
        segment: candidateData.segment,
        platforms: candidateData.platforms,
        skills: candidateData.skills,
        tools: candidateData.tools,
        location: candidateData.location,
        timezone: candidateData.timezone,
        languages: candidateData.languages ?? undefined,
        salaryExpectations: candidateData.salaryExpectations,
        education: candidateData.education,

        hasBigtechExperience: candidateData.hasBigtechExperience,
        hasStudioExperience: candidateData.hasStudioExperience,
        hasInternationalExperience: candidateData.hasInternationalExperience,

        aiSummary: candidateData.aiSummary,
        aiStrengths: candidateData.aiStrengths,
        aiConcerns: candidateData.aiConcerns,
        aiConfidenceScore: candidateData.aiConfidenceScore,

        telegramContact: candidateData.telegramContact,
        email: candidateData.email,
        linkedinUrl: candidateData.linkedinUrl,

        status: portfolioAnalysis ? "PORTFOLIO_ANALYZED" : "PARSED",
        resumeFileUrl: savedPath,
        resumeRawText: text || "[Данные из портфолио]",
        portfolioLinks,

        // Визуальный анализ портфолио (если был выполнен)
        ...(portfolioAnalysis && portfolioAnalysis.direction === "product" && {
          visualStrength: portfolioAnalysis.scores.visualStrength,
          uxStrength: portfolioAnalysis.scores.uxStrength,
          productMaturity: portfolioAnalysis.scores.productMaturity,
          systemThinking: portfolioAnalysis.scores.systemThinking,
          argumentationQuality: portfolioAnalysis.scores.argumentationQuality,
          metricsImpact: portfolioAnalysis.scores.metricsImpact,
          researchDepth: portfolioAnalysis.scores.researchDepth,
          portfolioAnalysis: portfolioAnalysis as unknown as object,
        }),
        // Для коммуникационного направления — только JSON, product-поля остаются null
        ...(portfolioAnalysis && portfolioAnalysis.direction === "communication" && {
          portfolioAnalysis: portfolioAnalysis as unknown as object,
        }),

        experiences: {
          create: (candidateData.experiences || []).map((exp) => ({
            company: exp.company || "Не указано",
            role: exp.role || "Не указано",
            startDate: exp.startDate,
            endDate: exp.endDate,
            duration: exp.duration,
            keyAchievements: exp.keyAchievements || [],
            isBigtech: exp.isBigtech ?? false,
            isStudio: exp.isStudio ?? false,
          })),
        },
      },
      include: { experiences: true },
    });

    // Экраны интерфейсов раскладываем здесь: на момент разбора кандидата
    // ещё не существовало, а путь к файлам строится по его id.
    const кадрыИнтерфейса =
      portfolioAnalysis && "interfaceIndexes" in portfolioAnalysis
        ? portfolioAnalysis.interfaceIndexes
        : undefined;
    if (portfolioPageImages?.length || (кадрыИнтерфейса?.length && portfolioScreenshots?.length)) {
      const shots = portfolioPageImages?.length
        ? savePageImages(candidate.id, portfolioPageImages)
        : saveInterfaceShots(
            candidate.id,
            portfolioScreenshots!,
            portfolioScreenshotMeta,
            кадрыИнтерфейса!,
          );
      if (shots.length > 0) {
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            portfolioAnalysis: {
              ...(portfolioAnalysis as object),
              interfaceShots: shots,
            } as never,
          },
        });
      }
    }

    // ── Семантический эмбеддинг (best-effort) ──────────────────────
    // Не валим upload если не удалось — backfill-скрипт догенерирует позже.
    try {
      const embeddingText = buildCandidateEmbeddingText(candidate);
      const vector = await generateEmbedding(embeddingText, "document");
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          embedding: vector,
          embeddingText,
          embeddingModel: EMBEDDING_MODEL,
          embeddingUpdatedAt: new Date(),
        },
      });
      console.log(`[upload] Эмбеддинг сгенерирован для ${candidate.name} (${vector.length} dims)`);
    } catch (embErr) {
      const msg = embErr instanceof Error ? embErr.message : "неизвестная ошибка";
      console.error(`[upload] Эмбеддинг не сгенерирован (не критично): ${msg}`);
    }

    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    if (savedPath) {
      unlink(savedPath).catch(() => {});
    }

    if (error instanceof FileProcessingError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof ClaudeServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("Upload error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
