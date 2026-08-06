interface ScoringCriterion {
  criterion: string;
  weight: number;
  type: "required" | "nice_to_have" | "stop_factor";
}

interface VacancyForScoring {
  title: string;
  role: string;
  grade: string;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  specialCompetencies: string[];
  redFlags: string[];
  productDescription: string | null;
  teamComposition: string | null;
  scoringCriteria: ScoringCriterion[] | null;
}

interface CandidateForScoring {
  name: string;
  role: string;
  grade: string;
  yearsOfExperience: number | null;
  specializations: string[];
  domains: string[];
  segment: string | null;
  platforms: string[];
  skills: string[];
  tools: string[];
  aiSummary: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  hasBigtechExperience: boolean;
  hasStudioExperience: boolean;
  hasInternationalExperience: boolean;
  experiences: Array<{
    company: string;
    role: string;
    duration: string | null;
    keyAchievements: string[];
    isBigtech: boolean;
    isStudio: boolean;
  }>;
}

export function buildDetailedScoringPrompt(
  vacancy: VacancyForScoring,
  candidate: CandidateForScoring,
): string {
  const criteria = vacancy.scoringCriteria;
  const criteriaBlock = criteria && criteria.length > 0
    ? `## Критерии оценки с весами (заданы клиентом):
${criteria.map((c) => `- "${c.criterion}" — вес ${c.weight}%, тип: ${c.type}`).join("\n")}

Оцени кандидата ПО КАЖДОМУ из этих критериев. overallScore = взвешенная сумма.`
    : `## Критерии оценки
Критерии не заданы явно. Оцени по следующим стандартным критериям (веса распределяй разумно, в сумме 100%):
- Соответствие роли и грейду
- Релевантность навыков задачам вакансии
- Опыт в нужных доменах
- Владение инструментами
- Общая зрелость и потенциал`;

  return `Ты — эксперт по найму дизайнеров. Проведи детальную оценку кандидата для конкретной вакансии.

## Вакансия
- Название: ${vacancy.title}
- Роль: ${vacancy.role}
- Грейд: ${vacancy.grade}
- Продукт: ${vacancy.productDescription || "не описан"}
- Команда: ${vacancy.teamComposition || "не указана"}
- Ключевые задачи: ${vacancy.keyTasks.join("; ") || "не указаны"}
- Обязательные навыки: ${vacancy.requiredSkills.join(", ") || "не указаны"}
- Плюсом будет: ${vacancy.niceToHaveSkills.join(", ") || "не указаны"}
- Предпочтительные домены: ${vacancy.preferredDomains.join(", ") || "не указаны"}
- Инструменты: ${vacancy.requiredTools.join(", ") || "не указаны"}
- Специальные компетенции: ${vacancy.specialCompetencies.join(", ") || "не указаны"}
- Стоп-факторы: ${vacancy.redFlags.join(", ") || "нет"}

${criteriaBlock}

## Кандидат
- Имя: ${candidate.name}
- Роль: ${candidate.role}
- Грейд: ${candidate.grade}
- Опыт: ${candidate.yearsOfExperience != null ? `${candidate.yearsOfExperience} лет` : "не указан"}
- Специализации: ${candidate.specializations.join(", ") || "не указаны"}
- Навыки: ${candidate.skills.join(", ") || "не указаны"}
- Домены: ${candidate.domains.join(", ") || "не указаны"}
- Платформы: ${candidate.platforms.join(", ") || "не указаны"}
- Инструменты: ${candidate.tools.join(", ") || "не указаны"}
- Сегмент: ${candidate.segment || "не указан"}
- BigTech опыт: ${candidate.hasBigtechExperience ? "да" : "нет"}
- Студийный опыт: ${candidate.hasStudioExperience ? "да" : "нет"}
- Международный опыт: ${candidate.hasInternationalExperience ? "да" : "нет"}
- AI-summary: ${candidate.aiSummary || "нет"}
- Сильные стороны (AI): ${candidate.aiStrengths.join("; ") || "не определены"}
- Риски (AI): ${candidate.aiConcerns.join("; ") || "не определены"}

### Опыт работы:
${candidate.experiences
  .map(
    (e) =>
      `- **${e.company}** — ${e.role} (${e.duration || "?"})${e.isBigtech ? " [BigTech]" : ""}${e.isStudio ? " [Studio]" : ""}
  ${e.keyAchievements.length > 0 ? e.keyAchievements.map((a) => `  · ${a}`).join("\n") : "  нет достижений"}`,
  )
  .join("\n")}

## Правила оценки
1. overallScore — это взвешенная сумма criteriaScores (score × weight / 100 по каждому критерию)
2. Если есть стоп-фактор — score по нему 0, и overallScore снижается пропорционально
3. Будь честен: не завышай оценку если данных мало. Лучше 50 с объяснением "мало данных" чем 75 без оснований
4. clarificationQuestions — вопросы для рекрутера, чтобы уточнить то, что непонятно из резюме
5. clarificationMessage — готовое сообщение кандидату в профессиональном тоне (на русском), чтобы уточнить пробелы
6. ВСЕ ТЕКСТОВЫЕ ПОЛЯ ОТВЕТА — ТОЛЬКО НА РУССКОМ ЯЗЫКЕ: matchExplanation, strengthsForVacancy, gaps, clarificationQuestions, clarificationMessage, explanation в criteriaScores. Не используй английский в текстовых значениях.

## Формат ответа
Верни ТОЛЬКО JSON, без markdown, без backticks:
{
  "overallScore": число 0-100,
  "criteriaScores": [
    { "criterion": "название критерия", "score": число 0-100, "weight": число (%), "explanation": "объяснение оценки" }
  ],
  "matchExplanation": "развёрнутое объяснение почему кандидат подходит или не подходит",
  "strengthsForVacancy": ["сильная сторона 1", "..."],
  "gaps": ["пробел 1", "..."],
  "clarificationQuestions": ["вопрос 1", "..."],
  "clarificationMessage": "Привет! Рассматриваем вашу кандидатуру на позицию... Хотели бы уточнить..."
}`;
}
