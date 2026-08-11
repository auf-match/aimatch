/**
 * POST /api/vacancies/[id]/portrait — поисковое задание для внешнего агентства.
 *
 * Конфиденциальность держится на срезе данных, а не на промпте: в модель
 * уходит только результат buildVacancyPortrait, а его тип PortraitVacancy
 * не содержит клиента, вилки, состава команды, ЛПР, критериев скоринга и
 * внутренних заметок. Раскрыть то, чего не видел, невозможно.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { callGemini } from "@/server/services/claude";
import { buildVacancyPortrait, type PortraitVacancy } from "@/lib/vacancy-portrait";
import { buildVacancyPortraitPrompt } from "@/server/prompts/vacancy-portrait";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    // select, а не include: перечисляем поля поимённо, чтобы новое
    // чувствительное поле в схеме не начало утекать сюда само собой.
    const vacancy = await prisma.vacancy.findUnique({
      where: { id },
      select: {
        title: true,
        role: true,
        grade: true,
        designersNeeded: true,
        employmentType: true,
        workFormat: true,
        location: true,
        timezone: true,
        desiredStartDate: true,
        duration: true,
        productDescription: true,
        reasonForHiring: true,
        keyTasks: true,
        requiredSkills: true,
        niceToHaveSkills: true,
        preferredDomains: true,
        requiredTools: true,
        needsInternational: true,
        specialCompetencies: true,
        redFlags: true,
        portfolioReferences: true,
      },
    });

    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    const safeText = buildVacancyPortrait(vacancy as PortraitVacancy);
    const raw = await callGemini([{ text: buildVacancyPortraitPrompt(safeText) }]);
    const brief = raw
      .replace(/^```(?:markdown)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    if (!brief) {
      return NextResponse.json(
        { error: "Модель вернула пустой ответ" },
        { status: 502 },
      );
    }

    return NextResponse.json({ brief });
  } catch (error) {
    console.error("[portrait] error:", error);
    const msg = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
