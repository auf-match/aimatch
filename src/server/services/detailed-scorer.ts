import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/server/db";
import { buildDetailedScoringPrompt } from "@/server/prompts/detailed-scoring";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface DetailedScoreResult {
  overallScore: number;
  criteriaScores: Array<{
    criterion: string;
    score: number;
    weight: number;
    explanation: string;
  }>;
  matchExplanation: string;
  strengthsForVacancy: string[];
  gaps: string[];
  clarificationQuestions: string[];
  clarificationMessage: string | null;
}

export async function detailedScore(
  vacancyId: string,
  candidateId: string,
): Promise<DetailedScoreResult> {
  const [vacancy, candidate] = await Promise.all([
    prisma.vacancy.findUnique({ where: { id: vacancyId } }),
    prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { experiences: true },
    }),
  ]);

  if (!vacancy) throw new Error("Вакансия не найдена");
  if (!candidate) throw new Error("Кандидат не найден");

  // Подготовить scoringCriteria
  let scoringCriteria = null;
  if (vacancy.scoringCriteria) {
    try {
      scoringCriteria = vacancy.scoringCriteria as Array<{
        criterion: string;
        weight: number;
        type: "required" | "nice_to_have" | "stop_factor";
      }>;
    } catch {
      scoringCriteria = null;
    }
  }

  const prompt = buildDetailedScoringPrompt(
    {
      title: vacancy.title,
      role: vacancy.role,
      grade: vacancy.grade,
      keyTasks: vacancy.keyTasks,
      requiredSkills: vacancy.requiredSkills,
      niceToHaveSkills: vacancy.niceToHaveSkills,
      preferredDomains: vacancy.preferredDomains,
      requiredTools: vacancy.requiredTools,
      specialCompetencies: vacancy.specialCompetencies,
      redFlags: vacancy.redFlags,
      productDescription: vacancy.productDescription,
      teamComposition: vacancy.teamComposition,
      scoringCriteria,
    },
    {
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
      aiSummary: candidate.aiSummary,
      aiStrengths: candidate.aiStrengths,
      aiConcerns: candidate.aiConcerns,
      hasBigtechExperience: candidate.hasBigtechExperience,
      hasStudioExperience: candidate.hasStudioExperience,
      hasInternationalExperience: candidate.hasInternationalExperience,
      experiences: candidate.experiences.map((e) => ({
        company: e.company,
        role: e.role,
        duration: e.duration,
        keyAchievements: e.keyAchievements,
        isBigtech: e.isBigtech,
        isStudio: e.isStudio,
      })),
    },
  );

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  let rawResponse = result.response.text();

  // Убрать markdown обёртку
  rawResponse = rawResponse
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "");

  let parsed: DetailedScoreResult;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    throw new Error(
      `AI вернул невалидный JSON для скоринга: ${rawResponse.slice(0, 300)}`,
    );
  }

  // Сохранить в БД
  await prisma.detailedScore.upsert({
    where: {
      candidateId_vacancyId: { candidateId, vacancyId },
    },
    update: {
      overallScore: parsed.overallScore,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      criteriaScores: parsed.criteriaScores as any,
      matchExplanation: parsed.matchExplanation,
      strengthsForVacancy: parsed.strengthsForVacancy,
      gaps: parsed.gaps,
      clarificationQuestions: parsed.clarificationQuestions,
      clarificationMessage: parsed.clarificationMessage,
    },
    create: {
      candidateId,
      vacancyId,
      overallScore: parsed.overallScore,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      criteriaScores: parsed.criteriaScores as any,
      matchExplanation: parsed.matchExplanation,
      strengthsForVacancy: parsed.strengthsForVacancy,
      gaps: parsed.gaps,
      clarificationQuestions: parsed.clarificationQuestions,
      clarificationMessage: parsed.clarificationMessage,
    },
  });

  return parsed;
}
