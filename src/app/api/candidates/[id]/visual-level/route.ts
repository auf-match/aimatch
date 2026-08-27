import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { levelToScore, parseLevel } from "@/lib/visual-level";

/**
 * Ручная ступень визуала от дизайн-лида.
 *
 * Зачем: машинная оценка визуала не работает — проверено на семи портфолио,
 * на двух моделях, со ступенями и эталонами. Слабое портфолио стабильно
 * получало «сильный». Поэтому решение остаётся за человеком, а система
 * лишь показывает ему работы и запоминает вердикт.
 *
 * Вердикт кладём в manualOverrides — поле для того и заведено, — а в
 * visualStrength пишем число, чтобы сортировка и фильтры в списке
 * кандидатов работали по мнению человека, а не модели.
 *
 * Побочная польза: со временем накопится размеченная вручную выборка.
 * Сейчас калибровать не на чем — у нас семь портфолио; сотня вердиктов
 * позволит проверить, совпадает ли машинная оценка с человеческой.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { level?: unknown; author?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидался JSON" }, { status: 400 });
  }

  // null — снять ручную оценку и вернуться к машинной
  const снять = body.level === null;
  const level = снять ? null : parseLevel(body.level);
  if (!снять && !level) {
    return NextResponse.json(
      { error: "Ступень должна быть: сильный, средний или слабый" },
      { status: 400 },
    );
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { manualOverrides: true, portfolioAnalysis: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 });
  }

  const overrides = {
    ...((candidate.manualOverrides as Record<string, unknown>) ?? {}),
  };

  if (снять) {
    delete overrides.visualLevel;
    delete overrides.visualLevelBy;
    delete overrides.visualLevelAt;
  } else {
    overrides.visualLevel = level;
    overrides.visualLevelBy =
      typeof body.author === "string" && body.author.trim()
        ? body.author.trim()
        : "дизайн-лид";
    overrides.visualLevelAt = new Date().toISOString();
  }

  // Возвращаемся к машинной оценке, если ручную сняли
  const машинная = (
    candidate.portfolioAnalysis as { scores?: { visualStrength?: number | null } } | null
  )?.scores?.visualStrength;

  await prisma.candidate.update({
    where: { id },
    data: {
      manualOverrides: overrides as never,
      visualStrength: level ? levelToScore(level) : (машинная ?? null),
    },
  });

  return NextResponse.json({ ok: true, level });
}
