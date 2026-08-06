interface VacancyContext {
  role: string;
  grade: string;
  requiredSkills: string[];
  preferredDomains: string[];
  keyTasks: string[];
  redFlags: string[];
}

interface CandidateSummary {
  candidateId: string;
  name: string;
  role: string;
  grade: string;
  aiSummary: string | null;
  skills: string[];
  domains: string[];
  platforms: string[];
  yearsOfExperience: number | null;
}

export function buildAiScreeningPrompt(
  vacancy: VacancyContext,
  candidates: CandidateSummary[],
): string {
  return `Ты — AI-ассистент рекрутингового агентства, специализирующегося на дизайнерах.

Твоя задача: отсеять ЯВНО нерелевантных кандидатов из списка.
Ты НЕ оцениваешь качество — только грубую релевантность.

## ПРАВИЛО: ЕСЛИ СОМНЕВАЕШЬСЯ — PASS
Отсеивай ТОЛЬКО тех, кто ТОЧНО не подходит. Лучше пропустить слабого, чем отсеять потенциально хорошего.

## Причины для REJECT (только эти):
- Кандидат совершенно другой специализации (например, motion designer на вакансию UX researcher)
- Грейд кандидата ЗНАЧИТЕЛЬНО ниже требуемого (джуниор на позицию лида) — но если разница 1 грейд, ставь PASS
- У кандидата в навыках/доменах есть явное совпадение с redFlags вакансии
- Навыки кандидата ПОЛНОСТЬЮ не пересекаются с требуемыми (ни одного совпадения даже косвенно)

## Причины для PASS (любая из них):
- Есть хотя бы частичное пересечение навыков
- Домены пересекаются или смежные
- Грейд подходит или отличается на 1 ступень
- Кандидат может быть релевантен, но данных мало — PASS

## Вакансия:
- Роль: ${vacancy.role}
- Грейд: ${vacancy.grade}
- Требуемые навыки: ${vacancy.requiredSkills.join(", ") || "не указаны"}
- Предпочтительные домены: ${vacancy.preferredDomains.join(", ") || "не указаны"}
- Ключевые задачи: ${vacancy.keyTasks.join("; ") || "не указаны"}
- Стоп-факторы (redFlags): ${vacancy.redFlags.join(", ") || "нет"}

## Кандидаты:
${candidates
  .map(
    (c, i) => `### Кандидат ${i + 1} (ID: ${c.candidateId})
- Имя: ${c.name}
- Роль: ${c.role}
- Грейд: ${c.grade}
- Опыт: ${c.yearsOfExperience != null ? `${c.yearsOfExperience} лет` : "не указан"}
- Навыки: ${c.skills.join(", ") || "не указаны"}
- Домены: ${c.domains.join(", ") || "не указаны"}
- Платформы: ${c.platforms.join(", ") || "не указаны"}
- AI-summary: ${c.aiSummary || "нет"}`,
  )
  .join("\n\n")}

## Формат ответа
Верни ТОЛЬКО JSON массив, без markdown, без backticks:
[{"candidateId": "...", "decision": "PASS", "reason": "одно предложение почему — на русском языке"}]

Каждый кандидат из списка должен быть в ответе. Не пропускай никого.
Поле reason — ТОЛЬКО на русском языке.`;
}
