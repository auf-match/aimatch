import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

interface ScoringCriterion {
  criterion: string;
  weight: number;
  type: "required" | "nice_to_have" | "stop_factor";
}

interface SoftenChange {
  type: "criterion_relaxed" | "stop_factor_removed" | "red_flag_removed" | "skill_moved";
  description: string;
}

/**
 * Soften vacancy requirements to expand the candidate pool.
 *
 * Strategy (one pass, applies all that are possible):
 *   1. Convert the lowest-weight "required" criterion to "nice_to_have" (only if >1 required remains)
 *   2. Remove the smallest "stop_factor" criterion entirely (only if any exist)
 *   3. Move 1-2 requiredSkills to niceToHaveSkills (only if more than 2 required skills exist)
 *   4. Remove 1 redFlag (only if any exist)
 *
 * After softening: weights of remaining criteria are renormalised to sum to 100.
 * Returns the diff so the UI can show what changed.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const vacancy = await prisma.vacancy.findUnique({ where: { id } });
    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    const criteria = (vacancy.scoringCriteria as ScoringCriterion[] | null) || [];
    const requiredSkills = [...vacancy.requiredSkills];
    const niceToHaveSkills = [...vacancy.niceToHaveSkills];
    const redFlags = [...vacancy.redFlags];

    const changes: SoftenChange[] = [];
    let newCriteria = [...criteria];

    // 1. Convert lowest-weight required to nice_to_have
    const required = newCriteria.filter((c) => c.type === "required");
    if (required.length > 1) {
      const lowest = required.reduce((min, c) => (c.weight < min.weight ? c : min), required[0]);
      newCriteria = newCriteria.map((c) =>
        c === lowest ? { ...c, type: "nice_to_have" as const } : c,
      );
      changes.push({
        type: "criterion_relaxed",
        description: `Критерий «${lowest.criterion}» переведён из обязательных в желательные`,
      });
    }

    // 2. Remove smallest stop_factor
    const stopFactors = newCriteria.filter((c) => c.type === "stop_factor");
    if (stopFactors.length > 0) {
      const smallest = stopFactors.reduce(
        (min, c) => (c.weight < min.weight ? c : min),
        stopFactors[0],
      );
      newCriteria = newCriteria.filter((c) => c !== smallest);
      changes.push({
        type: "stop_factor_removed",
        description: `Стоп-фактор «${smallest.criterion}» убран`,
      });
    }

    // Renormalise remaining weights to sum to 100 (preserving relative proportions)
    if (newCriteria.length > 0) {
      const total = newCriteria.reduce((s, c) => s + c.weight, 0);
      if (total > 0 && total !== 100) {
        const factor = 100 / total;
        let runningTotal = 0;
        newCriteria = newCriteria.map((c, i) => {
          if (i === newCriteria.length - 1) {
            // Last one absorbs rounding remainder
            return { ...c, weight: 100 - runningTotal };
          }
          const w = Math.round(c.weight * factor);
          runningTotal += w;
          return { ...c, weight: w };
        });
      }
    }

    // 3. Move some requiredSkills to niceToHaveSkills
    let newRequiredSkills = requiredSkills;
    let newNiceToHaveSkills = niceToHaveSkills;
    if (requiredSkills.length > 2) {
      const moveCount = requiredSkills.length > 4 ? 2 : 1;
      const moved = requiredSkills.slice(-moveCount);
      newRequiredSkills = requiredSkills.slice(0, -moveCount);
      newNiceToHaveSkills = [...niceToHaveSkills, ...moved];
      changes.push({
        type: "skill_moved",
        description: `${moved.length === 1 ? "Навык" : "Навыки"} ${moved.map((s) => `«${s}»`).join(", ")} ${moved.length === 1 ? "переведён" : "переведены"} в желательные`,
      });
    }

    // 4. Remove one redFlag
    let newRedFlags = redFlags;
    if (redFlags.length > 0) {
      const removed = redFlags[redFlags.length - 1];
      newRedFlags = redFlags.slice(0, -1);
      changes.push({
        type: "red_flag_removed",
        description: `Стоп-флаг «${removed}» убран`,
      });
    }

    if (changes.length === 0) {
      return NextResponse.json({
        softened: false,
        changes: [],
        message:
          "Требования уже минимальны — нечего смягчать. Попробуйте добавить больше кандидатов в базу или вручную скорректировать критерии.",
      });
    }

    await prisma.vacancy.update({
      where: { id },
      data: {
        scoringCriteria: newCriteria as unknown as Prisma.InputJsonValue,
        requiredSkills: newRequiredSkills,
        niceToHaveSkills: newNiceToHaveSkills,
        redFlags: newRedFlags,
      },
    });

    return NextResponse.json({
      softened: true,
      changes,
    });
  } catch (error) {
    console.error("POST /api/vacancies/:id/soften error:", error);
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
