import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getMatchingPrompt, type FeedbackHistoryItem } from "../prompts/matching";
import { ClaudeServiceError, callGemini } from "./claude";
import type { CandidateRole, Grade } from "@prisma/client";

/**
 * Загружает все match results вакансии, на которые дизайн-лид оставил фидбек.
 * Используется для подмешивания в промпт следующих матчей — чтобы AI
 * учитывал предпочтения и не показывал похожих на отвергнутых.
 */
async function loadFeedbackHistory(vacancyId: string): Promise<FeedbackHistoryItem[]> {
  const matches = await prisma.matchResult.findMany({
    where: {
      vacancyId,
      feedbackRating: { not: null },
    },
    select: {
      feedbackRating: true,
      humanFeedback: true,
      candidate: {
        select: { name: true, aiSummary: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30, // ограничение чтобы промпт не разросся
  });

  return matches.map((m) => ({
    candidateName: m.candidate.name,
    rating: m.feedbackRating as "GOOD" | "BAD" | "NEUTRAL",
    feedback: m.humanFeedback,
    candidateSummary: m.candidate.aiSummary,
  }));
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof ClaudeServiceError) return /квота|quota|429/i.test(err.message);
  if (err instanceof Error) return /quota|429/i.test(err.message);
  return false;
}

// Grade order for +-1 level filtering
const GRADE_ORDER: Grade[] = [
  "JUNIOR",
  "MIDDLE",
  "MIDDLE_PLUS",
  "SENIOR",
  "SENIOR_PLUS",
  "LEAD",
  "HEAD",
];

// Related roles map: vacancy role -> also consider these candidate roles
const RELATED_ROLES: Record<string, CandidateRole[]> = {
  PRODUCT_DESIGNER: ["PRODUCT_DESIGNER", "UX_DESIGNER", "UI_DESIGNER"],
  UX_DESIGNER: ["UX_DESIGNER", "PRODUCT_DESIGNER", "UX_RESEARCHER"],
  UI_DESIGNER: ["UI_DESIGNER", "PRODUCT_DESIGNER"],
  COMMUNICATION_DESIGNER: ["COMMUNICATION_DESIGNER", "BRAND_DESIGNER"],
  UX_RESEARCHER: ["UX_RESEARCHER", "UX_DESIGNER", "PRODUCT_DESIGNER"],
  DESIGN_LEAD: ["DESIGN_LEAD", "PRODUCT_DESIGNER", "UX_DESIGNER"],
  ART_DIRECTOR: ["ART_DIRECTOR", "UI_DESIGNER", "BRAND_DESIGNER"],
  BRAND_DESIGNER: ["BRAND_DESIGNER", "COMMUNICATION_DESIGNER", "ART_DIRECTOR"],
  MOTION_DESIGNER: ["MOTION_DESIGNER"],
  OTHER: ["OTHER", "PRODUCT_DESIGNER", "UX_DESIGNER", "UI_DESIGNER"],
};

function getAcceptableGrades(targetGrade: Grade, tolerance = 1): Grade[] {
  const idx = GRADE_ORDER.indexOf(targetGrade);
  if (idx === -1) return GRADE_ORDER;
  const grades: Grade[] = [];
  for (let i = -tolerance; i <= tolerance; i++) {
    const j = idx + i;
    if (j >= 0 && j < GRADE_ORDER.length) grades.push(GRADE_ORDER[j]);
  }
  return grades;
}

/**
 * Является ли роль кандидата приемлемой для вакансии.
 * OTHER — катч-олл для обеих сторон: кандидат-OTHER подходит к любой вакансии,
 * а вакансия-OTHER принимает любых кандидатов. Это безопаснее молчаливого отсева
 * при странной разметке ролей.
 */
function isRoleCompatible(vacancyRole: string, candidateRole: string): boolean {
  if (vacancyRole === "OTHER" || candidateRole === "OTHER") return true;
  const acceptable = RELATED_ROLES[vacancyRole] || [vacancyRole as CandidateRole];
  return acceptable.includes(candidateRole as CandidateRole);
}

/**
 * Сгенерировать scorecard через AI на основе всех данных вакансии
 * (включая описание продукта, причину найма, задачи — то что извлекается из аудио-брифинга).
 */
async function autoGenerateScoringCriteria(vacancy: {
  role: string;
  grade: string;
  title: string;
  productDescription?: string | null;
  reasonForHiring?: string | null;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  specialCompetencies: string[];
  redFlags: string[];
  teamComposition?: string | null;
}): Promise<ScoringCriterion[]> {
  const contextParts = [
    `Вакансия: ${vacancy.title}`,
    `Роль: ${vacancy.role}, Грейд: ${vacancy.grade}`,
    vacancy.productDescription && `Продукт: ${vacancy.productDescription}`,
    vacancy.reasonForHiring && `Причина найма: ${vacancy.reasonForHiring}`,
    vacancy.keyTasks.length && `Ключевые задачи: ${vacancy.keyTasks.join("; ")}`,
    vacancy.requiredSkills.length && `Обязательные навыки: ${vacancy.requiredSkills.join(", ")}`,
    vacancy.niceToHaveSkills.length && `Желательные навыки: ${vacancy.niceToHaveSkills.join(", ")}`,
    vacancy.preferredDomains.length && `Предпочтительные домены: ${vacancy.preferredDomains.join(", ")}`,
    vacancy.requiredTools.length && `Инструменты: ${vacancy.requiredTools.join(", ")}`,
    vacancy.specialCompetencies.length && `Спец. компетенции: ${vacancy.specialCompetencies.join(", ")}`,
    vacancy.redFlags.length && `Стоп-факторы: ${vacancy.redFlags.join(", ")}`,
    vacancy.teamComposition && `Команда: ${vacancy.teamComposition}`,
  ].filter(Boolean).join("\n");

  const prompt = `Ты — эксперт по рекрутингу дизайнеров. На основе данных вакансии (полученных из брифинга с клиентом) сформируй критерии скоринга для матчинга кандидатов.

Каждый критерий должен содержать:
- "criterion" — краткое название (2-5 слов), отражающее суть требования
- "weight" — вес в процентах (0-100)
- "type" — тип:
  - "required" — обязательный (без этого кандидат не подходит)
  - "nice_to_have" — желательный (повышает рейтинг)
  - "stop_factor" — стоп-фактор (если есть — кандидат не подходит)

ПРАВИЛА:
- Сумма всех weight = РОВНО 100
- 5-8 критериев (не больше)
- Критерии должны отражать конкретные особенности этой вакансии, не общие
- Стоп-факторы имеют weight = 0
- Больший weight = более важный критерий

Верни ТОЛЬКО чистый JSON-массив, без markdown:
[{"criterion": "...", "weight": N, "type": "..."}, ...]

ДАННЫЕ ВАКАНСИИ:
${contextParts}`;

  const raw = await callGemini([{ text: prompt }]);
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI вернул пустой массив критериев");
  }

  const validated: ScoringCriterion[] = parsed
    .filter((c: { criterion?: string; weight?: number; type?: string }) =>
      c.criterion && typeof c.criterion === "string" && typeof c.weight === "number",
    )
    .map((c: { criterion: string; weight: number; type?: string }) => ({
      criterion: c.criterion,
      weight: Math.max(0, Math.min(100, Math.round(c.weight))),
      type: (["required", "nice_to_have", "stop_factor"].includes(c.type || "")
        ? c.type
        : "required") as ScoringCriterion["type"],
    }));

  if (validated.length === 0) {
    throw new Error("После валидации не осталось критериев");
  }

  // Нормализуем сумму весов до 100 (без учёта стоп-факторов)
  const nonStop = validated.filter((c) => c.type !== "stop_factor");
  const total = nonStop.reduce((s, c) => s + c.weight, 0);
  if (total > 0 && total !== 100) {
    const factor = 100 / total;
    nonStop.forEach((c) => { c.weight = Math.round(c.weight * factor); });
    // Поправим остаток на последнем
    const newTotal = nonStop.reduce((s, c) => s + c.weight, 0);
    if (nonStop.length > 0 && newTotal !== 100) {
      nonStop[nonStop.length - 1].weight += 100 - newTotal;
    }
  }

  return validated;
}

/**
 * Сгенерировать дефолтный scorecard для вакансий, у которых критерии не заданы.
 * Лучше прогнать AI с разумным дефолтом, чем молча скипать.
 */
function buildDefaultScoringCriteria(vacancy: {
  role: string;
  grade: string;
  requiredSkills: string[];
  preferredDomains: string[];
}): ScoringCriterion[] {
  const criteria: ScoringCriterion[] = [
    { criterion: `Соответствие роли (${vacancy.role}) и грейду (${vacancy.grade})`, weight: 40, type: "required" },
  ];
  if (vacancy.requiredSkills.length > 0) {
    criteria.push({
      criterion: `Релевантные навыки: ${vacancy.requiredSkills.slice(0, 5).join(", ")}`,
      weight: 35,
      type: "required",
    });
  } else {
    // Дотягиваем вес до 100, если ничего нет
    criteria[0].weight = 60;
  }
  if (vacancy.preferredDomains.length > 0) {
    criteria.push({
      criterion: `Опыт в доменах: ${vacancy.preferredDomains.slice(0, 5).join(", ")}`,
      weight: 25,
      type: "nice_to_have",
    });
  } else {
    // Размазать оставшийся вес
    const total = criteria.reduce((s, c) => s + c.weight, 0);
    if (total < 100 && criteria.length > 0) {
      criteria[criteria.length - 1].weight += 100 - total;
    }
  }
  return criteria;
}

interface CriterionScore {
  criterion: string;
  score: number;
  weight: number;
  type?: string;
  explanation: string;
}

interface MatchingAIResponse {
  criteriaScores: CriterionScore[];
  matchExplanation: string;
  strengthsForVacancy: string[];
  gaps: string[];
  clarificationQuestions: string[];
  clarificationMessage: string | null;
}

interface ScoringCriterion {
  criterion: string;
  weight: number;
  type: "required" | "nice_to_have" | "stop_factor";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CandidateWithExperiences = Prisma.CandidateGetPayload<{ include: { experiences: true } }>;

/** Достаёт текстовый разбор портфолио (overallAssessment) из JSON-анализа, если он есть. */
function extractPortfolioAssessment(portfolioAnalysis: Prisma.JsonValue | null): string | null {
  if (!portfolioAnalysis || typeof portfolioAnalysis !== "object" || Array.isArray(portfolioAnalysis)) {
    return null;
  }
  const a = (portfolioAnalysis as Record<string, unknown>).overallAssessment;
  return typeof a === "string" && a.trim() ? a : null;
}

/**
 * Готовит объект кандидата для промпта матчинга.
 * Включает оценки портфолио (visualStrength и т.д.) — раньше они не доходили до AI,
 * из-за чего визуальные критерии оценивались вслепую по резюме.
 */
function buildCandidateForPrompt(candidate: CandidateWithExperiences) {
  return {
    name: candidate.name,
    role: candidate.role,
    grade: candidate.grade,
    yearsOfExperience: candidate.yearsOfExperience,
    specializations: candidate.specializations,
    domains: candidate.domains,
    segment: candidate.segment,
    platforms: candidate.platforms,
    skills: candidate.skills,
    tools: candidate.tools,
    location: candidate.location,
    hasBigtechExperience: candidate.hasBigtechExperience,
    hasStudioExperience: candidate.hasStudioExperience,
    hasInternationalExperience: candidate.hasInternationalExperience,
    aiSummary: candidate.aiSummary,
    aiStrengths: candidate.aiStrengths,
    aiConcerns: candidate.aiConcerns,
    experiences: candidate.experiences.map((e) => ({
      company: e.company,
      role: e.role,
      duration: e.duration,
      keyAchievements: e.keyAchievements,
      isBigtech: e.isBigtech,
      isStudio: e.isStudio,
    })),
    // Анализ портфолио — null если портфолио не анализировалось
    visualStrength: candidate.visualStrength,
    uxStrength: candidate.uxStrength,
    productMaturity: candidate.productMaturity,
    systemThinking: candidate.systemThinking,
    argumentationQuality: candidate.argumentationQuality,
    metricsImpact: candidate.metricsImpact,
    researchDepth: candidate.researchDepth,
    portfolioAssessment: extractPortfolioAssessment(candidate.portfolioAnalysis),
    portfolioLinks: candidate.portfolioLinks,
  };
}

export interface CandidateMatchDiagnostics {
  totalVacancies: number;
  skippedByRole: number;
  skippedByGrade: number;
  usedDefaultCriteria: number;
  errored: number;
  /** AI квота кончилась — часть результатов могла быть подтянута из кэша БД */
  aiQuotaExhausted: boolean;
  /** Вакансии, по которым показали ранее сохранённый MatchResult из БД */
  servedFromCache: number;
}

/**
 * Match a single candidate against all open vacancies.
 * Used when uploading a new candidate or when user clicks "Проверить по всем вакансиям".
 *
 * Возвращает кортеж [results, diagnostics] чтобы UI мог объяснить, почему пропусков много.
 */
export async function matchCandidateAgainstVacancies(
  candidateId: string,
): Promise<{ results: Awaited<ReturnType<typeof prisma.matchResult.upsert>>[]; diagnostics: CandidateMatchDiagnostics }> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { experiences: true },
  });

  if (!candidate) throw new Error("Кандидат не найден");

  // Все вакансии, кроме окончательно закрытых.
  // Раньше брали только OPEN/IN_PROGRESS — из-за этого DRAFT/PAUSED вакансии,
  // которые матчатся на vacancy-странице, тут молча выпадали и кандидат «не подходил».
  const vacancies = await prisma.vacancy.findMany({
    where: { status: { notIn: ["CLOSED", "FILLED"] } },
  });

  const diagnostics: CandidateMatchDiagnostics = {
    totalVacancies: vacancies.length,
    skippedByRole: 0,
    skippedByGrade: 0,
    usedDefaultCriteria: 0,
    errored: 0,
    aiQuotaExhausted: false,
    servedFromCache: 0,
  };

  if (vacancies.length === 0) return { results: [], diagnostics };

  const results: Awaited<ReturnType<typeof prisma.matchResult.upsert>>[] = [];
  // Вакансии, по которым AI упал — потом подтянем из кэша
  const failedVacancyIds: string[] = [];

  for (const vacancy of vacancies) {
    // Hard filter: role and grade must roughly match (грейд ±2 — мягче, чем было)
    const roleOk = isRoleCompatible(vacancy.role, candidate.role);
    if (!roleOk) {
      diagnostics.skippedByRole += 1;
      console.log(`[match] skip ${vacancy.title}: role ${candidate.role} ≠ ${vacancy.role}`);
      continue;
    }

    const acceptableGrades = getAcceptableGrades(vacancy.grade as Grade, 2);
    if (!acceptableGrades.includes(candidate.grade as Grade)) {
      diagnostics.skippedByGrade += 1;
      console.log(
        `[match] skip ${vacancy.title}: grade ${candidate.grade} not in [${acceptableGrades.join(", ")}]`,
      );
      continue;
    }

    // Если у вакансии нет своих критериев — генерируем дефолтные, чтобы AI хоть что-то оценил
    let scoringCriteria = vacancy.scoringCriteria as ScoringCriterion[] | null;
    if (!scoringCriteria || scoringCriteria.length === 0) {
      scoringCriteria = buildDefaultScoringCriteria(vacancy);
      diagnostics.usedDefaultCriteria += 1;
    }

    try {
      const vacancyForPrompt = {
        title: vacancy.title,
        role: vacancy.role,
        grade: vacancy.grade,
        productDescription: vacancy.productDescription,
        reasonForHiring: vacancy.reasonForHiring,
        keyTasks: vacancy.keyTasks,
        requiredSkills: vacancy.requiredSkills,
        niceToHaveSkills: vacancy.niceToHaveSkills,
        preferredDomains: vacancy.preferredDomains,
        requiredTools: vacancy.requiredTools,
        needsInternational: vacancy.needsInternational,
        specialCompetencies: vacancy.specialCompetencies,
        redFlags: vacancy.redFlags,
        teamComposition: vacancy.teamComposition,
        scoringCriteria,
      };

      const candidateForPrompt = buildCandidateForPrompt(candidate);

      const prompt = getMatchingPrompt(vacancyForPrompt, candidateForPrompt);
      let rawResponse = await callGemini([{ text: prompt }]);
      rawResponse = rawResponse.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");

      const aiResult: MatchingAIResponse = JSON.parse(rawResponse);

      let overallScore = 0;
      const totalWeight = scoringCriteria.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight > 0) {
        for (const cs of aiResult.criteriaScores) {
          overallScore += (cs.score * cs.weight) / totalWeight;
        }
      }
      overallScore = Math.round(overallScore);

      const hasStopFactorFail = aiResult.criteriaScores.some(
        (cs) => cs.type === "stop_factor" && cs.score < 30,
      );
      if (hasStopFactorFail) overallScore = Math.min(overallScore, 20);

      const matchResult = await prisma.matchResult.upsert({
        where: { candidateId_vacancyId: { candidateId: candidate.id, vacancyId: vacancy.id } },
        create: {
          candidateId: candidate.id,
          vacancyId: vacancy.id,
          overallScore,
          criteriaScores: aiResult.criteriaScores as unknown as Prisma.InputJsonValue,
          matchExplanation: aiResult.matchExplanation,
          strengthsForVacancy: aiResult.strengthsForVacancy,
          gaps: aiResult.gaps,
          clarificationQuestions: aiResult.clarificationQuestions,
          clarificationMessage: aiResult.clarificationMessage,
        },
        update: {
          overallScore,
          criteriaScores: aiResult.criteriaScores as unknown as Prisma.InputJsonValue,
          matchExplanation: aiResult.matchExplanation,
          strengthsForVacancy: aiResult.strengthsForVacancy,
          gaps: aiResult.gaps,
          clarificationQuestions: aiResult.clarificationQuestions,
          clarificationMessage: aiResult.clarificationMessage,
        },
        include: {
          vacancy: { select: { id: true, title: true, status: true } },
        },
      });

      results.push(matchResult);
      await delay(500);
    } catch (error) {
      diagnostics.errored += 1;
      if (isQuotaError(error)) diagnostics.aiQuotaExhausted = true;
      failedVacancyIds.push(vacancy.id);
      console.error(`Ошибка матчинга с вакансией ${vacancy.title}:`, error);
    }
  }

  // Если AI упал на каких-то вакансиях — подтягиваем последний сохранённый MatchResult
  // из БД, чтобы кандидат не «терял» уже посчитанные совпадения. Иначе при истощённой
  // дневной квоте Gemini пользователь видел бы 0, хотя в БД лежат 88-балльные матчи.
  if (failedVacancyIds.length > 0) {
    const cached = await prisma.matchResult.findMany({
      where: { candidateId: candidate.id, vacancyId: { in: failedVacancyIds } },
      include: { vacancy: { select: { id: true, title: true, status: true } } },
    });
    for (const c of cached) {
      results.push(c as (typeof results)[number]);
      diagnostics.servedFromCache += 1;
    }
  }

  results.sort((a, b) => b.overallScore - a.overallScore);
  return { results, diagnostics };
}

export async function matchCandidates(vacancyId: string) {
  // 1. Load vacancy
  const vacancy = await prisma.vacancy.findUnique({
    where: { id: vacancyId },
  });

  if (!vacancy) {
    throw new Error("Вакансия не найдена");
  }

  let scoringCriteria = vacancy.scoringCriteria as ScoringCriterion[] | null;
  if (!scoringCriteria || !Array.isArray(scoringCriteria) || scoringCriteria.length === 0) {
    // Авто-генерация критериев из данных вакансии (включая то что извлечено из аудио-брифинга)
    console.log(`[matching] У вакансии ${vacancyId} нет критериев — генерируем из данных`);
    try {
      scoringCriteria = await autoGenerateScoringCriteria(vacancy);
      await prisma.vacancy.update({
        where: { id: vacancyId },
        data: { scoringCriteria: scoringCriteria as unknown as Prisma.InputJsonValue },
      });
      console.log(`[matching] Сгенерировано ${scoringCriteria.length} критериев`);
    } catch (err) {
      console.warn(`[matching] AI-генерация критериев упала, используем дефолтные:`, err);
      scoringCriteria = buildDefaultScoringCriteria(vacancy);
      await prisma.vacancy.update({
        where: { id: vacancyId },
        data: { scoringCriteria: scoringCriteria as unknown as Prisma.InputJsonValue },
      });
    }
  }

  // 1.5. Загружаем историю фидбека дизайн-лида по этой вакансии
  // (для калибровки AI: «не показывай похожих на тех, кого уже отвергли»)
  const feedbackHistory = await loadFeedbackHistory(vacancyId);
  if (feedbackHistory.length > 0) {
    console.log(`[matching] Учитываем ${feedbackHistory.length} фидбек-записей при матчинге`);
  }

  // 2. Pre-filter candidates: грейд ±2, роли через RELATED_ROLES + OTHER как катч-олл
  const acceptableRoles = RELATED_ROLES[vacancy.role] || [vacancy.role as CandidateRole];
  const rolesWithCatchall: CandidateRole[] =
    vacancy.role === "OTHER"
      ? (Object.keys(RELATED_ROLES) as CandidateRole[]) // OTHER-вакансия → принимаем любых
      : Array.from(new Set<CandidateRole>([...acceptableRoles, "OTHER"]));
  const acceptableGrades = getAcceptableGrades(vacancy.grade as Grade, 2);

  const candidates = await prisma.candidate.findMany({
    where: {
      status: { not: "ARCHIVED" },
      role: { in: rolesWithCatchall },
      grade: { in: acceptableGrades },
    },
    include: {
      experiences: true,
    },
    take: 50,
    orderBy: { updatedAt: "desc" },
  });

  console.log(
    `[match] vacancy ${vacancy.title}: prefilter ${candidates.length} candidates (roles=${rolesWithCatchall.join(",")}, grades=${acceptableGrades.join(",")})`,
  );

  if (candidates.length === 0) {
    return [];
  }

  // 3. Prepare vacancy data for prompt
  const vacancyForPrompt = {
    title: vacancy.title,
    role: vacancy.role,
    grade: vacancy.grade,
    productDescription: vacancy.productDescription,
    reasonForHiring: vacancy.reasonForHiring,
    keyTasks: vacancy.keyTasks,
    requiredSkills: vacancy.requiredSkills,
    niceToHaveSkills: vacancy.niceToHaveSkills,
    preferredDomains: vacancy.preferredDomains,
    requiredTools: vacancy.requiredTools,
    needsInternational: vacancy.needsInternational,
    specialCompetencies: vacancy.specialCompetencies,
    redFlags: vacancy.redFlags,
    teamComposition: vacancy.teamComposition,
    scoringCriteria,
  };

  const results = [];

  // 4. Process candidates sequentially
  for (const candidate of candidates) {
    try {
      const candidateForPrompt = buildCandidateForPrompt(candidate);

      const prompt = getMatchingPrompt(vacancyForPrompt, candidateForPrompt, feedbackHistory);

      // Call Gemini через callGemini — он умеет фолбэчиться на gemini-2.5-flash-lite
      // когда у основной модели кончилась дневная квота
      let rawResponse = await callGemini([{ text: prompt }]);

      // Strip markdown wrapper
      rawResponse = rawResponse
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/, "");

      const aiResult: MatchingAIResponse = JSON.parse(rawResponse);

      // Calculate overall score as weighted sum
      let overallScore = 0;
      const totalWeight = scoringCriteria.reduce((sum, c) => sum + c.weight, 0);

      if (totalWeight > 0) {
        for (const cs of aiResult.criteriaScores) {
          overallScore += (cs.score * cs.weight) / totalWeight;
        }
      }
      overallScore = Math.round(overallScore);

      // Check stop_factor criteria: if any scores below 30, cap overall at 20
      const hasStopFactorFail = aiResult.criteriaScores.some(
        (cs) => cs.type === "stop_factor" && cs.score < 30,
      );
      if (hasStopFactorFail) {
        overallScore = Math.min(overallScore, 20);
      }

      // Upsert into MatchResult
      const matchResult = await prisma.matchResult.upsert({
        where: {
          candidateId_vacancyId: {
            candidateId: candidate.id,
            vacancyId: vacancy.id,
          },
        },
        create: {
          candidateId: candidate.id,
          vacancyId: vacancy.id,
          overallScore,
          criteriaScores: aiResult.criteriaScores as unknown as Prisma.InputJsonValue,
          matchExplanation: aiResult.matchExplanation,
          strengthsForVacancy: aiResult.strengthsForVacancy,
          gaps: aiResult.gaps,
          clarificationQuestions: aiResult.clarificationQuestions,
          clarificationMessage: aiResult.clarificationMessage,
        },
        update: {
          overallScore,
          criteriaScores: aiResult.criteriaScores as unknown as Prisma.InputJsonValue,
          matchExplanation: aiResult.matchExplanation,
          strengthsForVacancy: aiResult.strengthsForVacancy,
          gaps: aiResult.gaps,
          clarificationQuestions: aiResult.clarificationQuestions,
          clarificationMessage: aiResult.clarificationMessage,
        },
        include: {
          candidate: {
            select: {
              id: true,
              name: true,
              role: true,
              grade: true,
              aiSummary: true,
            },
          },
        },
      });

      results.push(matchResult);

      // Delay between API calls
      await delay(500);
    } catch (error) {
      console.error(
        `Ошибка матчинга кандидата ${candidate.name} (${candidate.id}):`,
        error,
      );
      // Continue with next candidate
    }
  }

  // 5. Return sorted by overallScore desc
  results.sort((a, b) => b.overallScore - a.overallScore);
  return results;
}
