import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { callGemini, ClaudeServiceError } from "@/server/services/claude";

export const maxDuration = 120;

/**
 * POST /api/vacancies/[id]/regen-messages
 *
 * Regenerates clarificationMessage for all match results of a vacancy
 * without re-scoring. Useful when the message prompt has been updated.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const vacancy = await prisma.vacancy.findUnique({
    where: { id },
    select: { id: true, title: true, role: true, grade: true, productDescription: true },
  });
  if (!vacancy) {
    return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
  }

  const matches = await prisma.matchResult.findMany({
    where: { vacancyId: id },
    select: {
      id: true,
      matchExplanation: true,
      strengthsForVacancy: true,
      clarificationQuestions: true,
      candidate: {
        select: {
          name: true,
          role: true,
          grade: true,
          aiSummary: true,
          experiences: {
            take: 2,
            select: { company: true, role: true, duration: true },
          },
        },
      },
    },
  });

  if (matches.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  let updated = 0;
  const errors: string[] = [];

  for (const match of matches) {
    try {
      const prompt = buildRegenMessagePrompt(vacancy, match);
      const raw = await callGemini([{ text: prompt }]);

      const cleaned = raw
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/, "")
        .trim();

      let msg: string | null = null;
      try {
        const parsed = JSON.parse(cleaned);
        msg = typeof parsed.clarificationMessage === "string"
          ? parsed.clarificationMessage
          : null;
      } catch {
        // If AI returned plain text instead of JSON, use it directly
        if (cleaned.length > 20 && cleaned.length < 800) msg = cleaned;
      }

      if (msg) {
        await prisma.matchResult.update({
          where: { id: match.id },
          data: { clarificationMessage: msg },
        });
        updated++;
      }
    } catch (err) {
      const msg = err instanceof ClaudeServiceError ? err.message : String(err);
      errors.push(`${match.candidate.name}: ${msg}`);
      console.error(`[regen-messages] ${match.candidate.name}: ${msg}`);
    }
  }

  return NextResponse.json({ updated, total: matches.length, errors });
}

interface VacancySnippet {
  title: string;
  role: string;
  grade: string;
  productDescription?: string | null;
}

interface MatchSnippet {
  matchExplanation: string;
  strengthsForVacancy: string[];
  clarificationQuestions: string[];
  candidate: {
    name: string;
    role: string;
    grade: string;
    aiSummary?: string | null;
    experiences: { company: string; role: string; duration?: string | null }[];
  };
}

function buildRegenMessagePrompt(vacancy: VacancySnippet, match: MatchSnippet): string {
  const { candidate } = match;
  const firstName = candidate.name.split(" ")[0];
  const recentExp = candidate.experiences
    .map((e) => `${e.role} в ${e.company}${e.duration ? ` (${e.duration})` : ""}`)
    .join(", ");

  return `Напиши короткое сообщение в мессенджер от рекрутера из студии Pragmatica кандидату ${firstName}.

КОНТЕКСТ:
- Вакансия: ${vacancy.title} (${vacancy.role}, ${vacancy.grade})
${vacancy.productDescription ? `- Продукт: ${vacancy.productDescription}` : ""}
- Кандидат: ${candidate.name}, ${candidate.role}, ${candidate.grade}
${recentExp ? `- Опыт: ${recentExp}` : ""}
${candidate.aiSummary ? `- Summary: ${candidate.aiSummary}` : ""}
- Почему подходит: ${match.strengthsForVacancy.slice(0, 2).join("; ")}

ПРАВИЛА:
- Ровно 2-3 предложения, не больше
- Начать: «Привет, ${firstName}! Меня зовут [имя рекрутера], я из студии Pragmatica.»
- Плейсхолдер [имя рекрутера] оставить буквально как есть — не заменять
- Одно предложение: почему пишем именно этому человеку (1-2 конкретных детали из его опыта)
- Одно предложение: суть вакансии одной фразой + приглашение поговорить
- Никаких нумерованных вопросов — только приглашение пообщаться
- Тон: живой, человеческий, не корпоративный

Верни JSON: {"clarificationMessage": "<текст>"}`;
}
