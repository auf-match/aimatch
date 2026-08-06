interface ScoringCriterion {
  criterion: string;
  weight: number;
  type: "required" | "nice_to_have" | "stop_factor";
}

interface VacancyForMatching {
  title: string;
  role: string;
  grade: string;
  productDescription?: string | null;
  reasonForHiring?: string | null;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  needsInternational: boolean;
  specialCompetencies: string[];
  redFlags: string[];
  teamComposition?: string | null;
  scoringCriteria: ScoringCriterion[];
}

interface CandidateForMatching {
  name: string;
  role: string;
  grade: string;
  yearsOfExperience?: number | null;
  specializations: string[];
  domains: string[];
  segment?: string | null;
  platforms: string[];
  skills: string[];
  tools: string[];
  location?: string | null;
  hasBigtechExperience: boolean;
  hasStudioExperience: boolean;
  hasInternationalExperience: boolean;
  aiSummary?: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  experiences: {
    company: string;
    role: string;
    duration?: string | null;
    keyAchievements: string[];
    isBigtech: boolean;
    isStudio: boolean;
  }[];
  // --- Анализ портфолио (0-100; null = портфолио не анализировалось) ---
  visualStrength?: number | null;
  uxStrength?: number | null;
  productMaturity?: number | null;
  systemThinking?: number | null;
  argumentationQuality?: number | null;
  metricsImpact?: number | null;
  researchDepth?: number | null;
  portfolioAssessment?: string | null; // текстовый разбор портфолио от дизайн-лида
  portfolioLinks?: string[];
}

export interface FeedbackHistoryItem {
  candidateName: string;
  rating: "GOOD" | "BAD" | "NEUTRAL";
  feedback: string | null;
  // Краткий профиль чтобы AI понимал «на кого похожих не показывать»
  candidateSummary?: string | null;
}

export function getMatchingPrompt(
  vacancy: VacancyForMatching,
  candidate: CandidateForMatching,
  feedbackHistory: FeedbackHistoryItem[] = [],
): string {
  const feedbackBlock = feedbackHistory.length === 0 ? "" : `

ИСТОРИЯ ФИДБЕКА ДИЗАЙН-ЛИДА ПО ЭТОЙ ВАКАНСИИ (КРИТИЧЕСКИ ВАЖНО):
Дизайн-лид уже оценил предыдущих кандидатов на эту вакансию. Используй это для калибровки:
${feedbackHistory.map((f) => {
  const label = f.rating === "GOOD" ? "ПОДХОДИТ ✓" : f.rating === "BAD" ? "НЕ ПОДХОДИТ ✗" : "ПОД ВОПРОСОМ ⚠";
  const reason = f.feedback ? ` — причина: «${f.feedback}»` : "";
  const summary = f.candidateSummary ? ` (профиль: ${f.candidateSummary.slice(0, 200)})` : "";
  return `- ${f.candidateName}: ${label}${reason}${summary}`;
}).join("\n")}

ИНСТРУКЦИИ ПО УЧЁТУ ФИДБЕКА:
- Если кандидат ПОХОЖ профилем на тех, кого уже отметили как НЕ ПОДХОДИТ — снижай оценку и объясняй это в matchExplanation
- Если похож на тех, кого отметили ПОДХОДИТ — повышай оценку и отметь это в strengthsForVacancy
- Учитывай конкретные причины из фидбека (если сказали «слабый визуал» — пристальнее смотри на visual signals)
- НЕ копируй слова из фидбека дословно в свой ответ — переформулируй
`;

  return `Ты — AI-ассистент рекрутингового агентства, специализирующегося на найме дизайнеров. Ты помогаешь дизайн-лиду из студии Pragmatica.

Твоя задача — оценить, насколько кандидат подходит под конкретную вакансию, по каждому критерию скоринга.

ВАЖНО:
- Возвращай ТОЛЬКО чистый JSON без markdown, без backticks, без пояснений.
- Будь честным и точным. Не завышай оценки.
- Если информации о кандидате недостаточно для оценки критерия, ставь score 40-50 и укажи это в explanation.
- Для стоп-факторов: если кандидат явно не проходит — ставь score ниже 30.

ДАННЫЕ ПОРТФОЛИО (поля visualStrength, uxStrength, productMaturity, systemThinking, argumentationQuality, metricsImpact, researchDepth — шкала 0-100, и portfolioAssessment — текстовый разбор от дизайн-лида):
- Это результат глубокого анализа портфолио. Опирайся на эти оценки В ПЕРВУЮ ОЧЕРЕДЬ для критериев про визуал, UI, UX, продуктовое мышление, системность, метрики и исследования — не угадывай по резюме, если есть данные портфолио.
- Если эти поля = null или отсутствуют — портфолио НЕ анализировалось. Тогда для визуальных критериев ставь score 40-50 и ЯВНО напиши в explanation, что портфолио не проанализировано (не выдумывай оценку визуала по тексту резюме).
- ВСЕ ТЕКСТОВЫЕ ПОЛЯ ОТВЕТА — ТОЛЬКО НА РУССКОМ ЯЗЫКЕ: matchExplanation, strengthsForVacancy, gaps, clarificationQuestions, clarificationMessage, explanation в criteriaScores. Не используй английский в текстовых значениях.
${feedbackBlock}
ВАКАНСИЯ:
${JSON.stringify(vacancy, null, 2)}

КАНДИДАТ:
${JSON.stringify(candidate, null, 2)}

КРИТЕРИИ СКОРИНГА (оцени кандидата по КАЖДОМУ):
${vacancy.scoringCriteria.map((c, i) => `${i + 1}. "${c.criterion}" — вес: ${c.weight}%, тип: ${c.type}`).join("\n")}

Верни JSON строго следующей структуры:

{
  "criteriaScores": [
    {
      "criterion": "название критерия (точно как в списке выше)",
      "score": 0-100,
      "weight": число (вес из вакансии),
      "type": "required | nice_to_have | stop_factor",
      "explanation": "почему такой score — конкретно, с примерами из опыта кандидата"
    }
  ],
  "matchExplanation": "общее объяснение, почему кандидат подходит или не подходит — 2-3 предложения",
  "strengthsForVacancy": ["сильные стороны кандидата именно для этой вакансии, 2-4 пункта"],
  "gaps": ["чего не хватает кандидату для этой вакансии, 1-3 пункта, или пустой массив"],
  "clarificationQuestions": ["вопросы, которые стоит задать кандидату для уточнения, 1-3 шт"],
  "clarificationMessage": "Короткое сообщение в мессенджер, которое рекрутер из студии Pragmatica отправит кандидату. Строгие правила:\n- ТОЛЬКО 2-3 предложения, не больше\n- Начать с: «Привет, [имя кандидата]! Меня зовут [имя рекрутера], я из студии Pragmatica.» — плейсхолдер [имя рекрутера] оставить БУКВАЛЬНО как есть, не заменять\n- Одно предложение: почему пишем именно этому человеку (1-2 конкретных детали из его опыта)\n- Одно предложение: суть вакансии одной фразой\n- Никаких вопросов в тексте — только приглашение пообщаться\n- Завершить: «Есть пара минут созвониться?» или «Интересно?\"\n- Тон: живой, как от человека, не корпоративный\n- Если уточнять нечего — всё равно написать короткое знакомство"
}`;
}
