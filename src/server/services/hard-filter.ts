import { prisma } from "@/server/db";
import type { Vacancy, Candidate, Grade, Prisma } from "@prisma/client";

const GRADE_ORDER: Grade[] = [
  "JUNIOR",
  "MIDDLE",
  "MIDDLE_PLUS",
  "SENIOR",
  "SENIOR_PLUS",
  "LEAD",
  "HEAD",
];

function gradeIndex(grade: Grade): number {
  return GRADE_ORDER.indexOf(grade);
}

/** Грейды, которые >= указанного */
function gradesAtOrAbove(minGrade: Grade): Grade[] {
  const minIdx = gradeIndex(minGrade);
  return GRADE_ORDER.filter((_, i) => i >= minIdx);
}

export interface HardFilterResult {
  candidates: Candidate[];
  stats: {
    total: number;
    passed: number;
  };
}

/**
 * Предфильтрация кандидатов по жёстким критериям вакансии.
 * - role = vacancy.role
 * - grade >= vacancy.grade
 * - redFlags: исключить кандидатов с совпадениями в skills/domains
 * - OFFICE + location: фильтр по локации
 */
export async function hardFilter(vacancy: Vacancy): Promise<HardFilterResult> {
  const total = await prisma.candidate.count();

  const allowedGrades = gradesAtOrAbove(vacancy.grade);

  // Базовый фильтр: роль + грейд
  const where: Prisma.CandidateWhereInput = {
    role: vacancy.role,
    grade: { in: allowedGrades },
  };

  // Офис + локация
  if (vacancy.workFormat === "OFFICE" && vacancy.location) {
    where.location = {
      contains: vacancy.location,
      mode: "insensitive",
    };
  }

  let candidates = await prisma.candidate.findMany({ where });

  // RedFlags: исключить кандидатов у которых skills или domains пересекаются с redFlags
  if (vacancy.redFlags.length > 0) {
    const redFlagsLower = vacancy.redFlags.map((f) => f.toLowerCase());

    candidates = candidates.filter((c) => {
      const candidateTerms = [...c.skills, ...c.domains].map((t) =>
        t.toLowerCase(),
      );
      return !redFlagsLower.some((flag) =>
        candidateTerms.some((term) => term.includes(flag) || flag.includes(term)),
      );
    });
  }

  const passed = candidates.length;
  console.log(`Hard filter: ${total} → ${passed}`);

  return { candidates, stats: { total, passed } };
}
