import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/server/db";
import { buildAiScreeningPrompt } from "@/server/prompts/ai-screening";
import type { Vacancy, Candidate, ScreeningDecision } from "@prisma/client";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const AI_SCREENING_BATCH_SIZE = parseInt(
  process.env.AI_SCREENING_BATCH_SIZE || "15",
  10,
);
const AI_SCREENING_PARALLEL_REQUESTS = parseInt(
  process.env.AI_SCREENING_PARALLEL_REQUESTS || "3",
  10,
);

export interface ScreeningResultItem {
  candidateId: string;
  decision: ScreeningDecision;
  reason: string;
}

/**
 * AI-скрининг: отсеивает явно нерелевантных кандидатов.
 * Принцип: если сомневается — PASS.
 */
export async function aiScreen(
  vacancy: Vacancy,
  candidates: Candidate[],
): Promise<ScreeningResultItem[]> {
  if (candidates.length === 0) {
    console.log("AI screening: 0 → 0 PASS, 0 REJECT");
    return [];
  }

  // Разбить на батчи
  const batches: Candidate[][] = [];
  for (let i = 0; i < candidates.length; i += AI_SCREENING_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + AI_SCREENING_BATCH_SIZE));
  }

  const allResults: ScreeningResultItem[] = [];

  // Обработать батчи параллельно (с ограничением)
  for (
    let i = 0;
    i < batches.length;
    i += AI_SCREENING_PARALLEL_REQUESTS
  ) {
    const chunk = batches.slice(i, i + AI_SCREENING_PARALLEL_REQUESTS);
    const chunkResults = await Promise.all(
      chunk.map((batch) => screenBatch(vacancy, batch)),
    );
    allResults.push(...chunkResults.flat());
  }

  // Сохранить результаты в БД
  for (const result of allResults) {
    await prisma.screeningResult.upsert({
      where: {
        candidateId_vacancyId: {
          candidateId: result.candidateId,
          vacancyId: vacancy.id,
        },
      },
      update: {
        decision: result.decision,
        reason: result.reason,
      },
      create: {
        candidateId: result.candidateId,
        vacancyId: vacancy.id,
        decision: result.decision,
        reason: result.reason,
      },
    });
  }

  const passCount = allResults.filter((r) => r.decision === "PASS").length;
  const rejectCount = allResults.filter((r) => r.decision === "REJECT").length;
  console.log(
    `AI screening: ${candidates.length} → ${passCount} PASS, ${rejectCount} REJECT`,
  );

  return allResults;
}

async function screenBatch(
  vacancy: Vacancy,
  candidates: Candidate[],
): Promise<ScreeningResultItem[]> {
  const vacancyContext = {
    role: vacancy.role,
    grade: vacancy.grade,
    requiredSkills: vacancy.requiredSkills,
    preferredDomains: vacancy.preferredDomains,
    keyTasks: vacancy.keyTasks,
    redFlags: vacancy.redFlags,
  };

  const candidateSummaries = candidates.map((c) => ({
    candidateId: c.id,
    name: c.name,
    role: c.role,
    grade: c.grade,
    aiSummary: c.aiSummary,
    skills: c.skills,
    domains: c.domains,
    platforms: c.platforms,
    yearsOfExperience: c.yearsOfExperience,
  }));

  const prompt = buildAiScreeningPrompt(vacancyContext, candidateSummaries);

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  let rawResponse = result.response.text();

  // Убрать markdown обёртку
  rawResponse = rawResponse
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "");

  let parsed: Array<{
    candidateId: string;
    decision: string;
    reason: string;
  }>;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    console.error("AI screening: невалидный JSON:", rawResponse.slice(0, 300));
    // Если AI не смог ответить — пропускаем всех (PASS по умолчанию)
    return candidates.map((c) => ({
      candidateId: c.id,
      decision: "PASS" as ScreeningDecision,
      reason: "AI не смог оценить — пропускаем",
    }));
  }

  // Маппинг ответа с защитой: неизвестные кандидаты или невалидные решения → PASS
  const candidateIds = new Set(candidates.map((c) => c.id));
  const resultsMap = new Map<string, ScreeningResultItem>();

  for (const item of parsed) {
    if (!candidateIds.has(item.candidateId)) continue;
    const decision: ScreeningDecision =
      item.decision === "REJECT" ? "REJECT" : "PASS";
    resultsMap.set(item.candidateId, {
      candidateId: item.candidateId,
      decision,
      reason: item.reason || "Без объяснения",
    });
  }

  // Кандидаты без ответа от AI → PASS
  for (const c of candidates) {
    if (!resultsMap.has(c.id)) {
      resultsMap.set(c.id, {
        candidateId: c.id,
        decision: "PASS",
        reason: "AI не дал оценку — пропускаем",
      });
    }
  }

  return Array.from(resultsMap.values());
}
