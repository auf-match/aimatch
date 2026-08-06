export function buildVacancyParsePrompt(text: string): string {
  return `Ты — AI-ассистент рекрутингового агентства, специализирующегося на найме дизайнеров.

Тебе дан документ с описанием вакансии или позиции для дизайнера. Извлеки из него структурированные данные.

${text ? `Текст документа:\n---\n${text}\n---` : "Документ приложен как PDF-файл. Прочитай его."}

Верни чистый JSON (без markdown, без backticks) со следующей структурой:

{
  "title": "название вакансии / позиции",
  "clientName": "компания-клиент (если указана)" | null,
  "clientLead": "контактное лицо со стороны клиента" | null,
  "productDescription": "описание продукта / команды / проекта",
  "reasonForHiring": "почему возникла потребность (расширение, замена и т.д.)" | null,

  "role": одно из: "PRODUCT_DESIGNER", "UX_DESIGNER", "UI_DESIGNER", "COMMUNICATION_DESIGNER", "UX_RESEARCHER", "DESIGN_LEAD", "ART_DIRECTOR", "BRAND_DESIGNER", "MOTION_DESIGNER", "OTHER",
  "grade": одно из: "JUNIOR", "MIDDLE", "MIDDLE_PLUS", "SENIOR", "SENIOR_PLUS", "LEAD", "HEAD",
  "designersNeeded": число (сколько нужно дизайнеров, по умолчанию 1),
  "employmentType": одно из: "FULL_TIME", "PART_TIME", "CONTRACT",
  "workFormat": одно из: "REMOTE", "HYBRID", "OFFICE",
  "location": "город / локация" | null,
  "timezone": "часовой пояс" | null,
  "salaryRange": "зарплатная вилка" | null,
  "desiredStartDate": "когда нужно выйти" | null,
  "duration": "длительность контракта" | null,

  "keyTasks": ["ключевая задача 1", "задача 2", ...],
  "requiredSkills": ["обязательный навык 1", ...],
  "niceToHaveSkills": ["желательный навык 1", ...],
  "preferredDomains": ["предпочтительный домен 1", ...],
  "requiredTools": ["инструмент 1", ...],
  "needsInternational": true/false,
  "specialCompetencies": ["специализированная компетенция 1", ...],
  "redFlags": ["стоп-фактор 1", ...],

  "portfolioReferences": ["ссылка на референс 1", ...],
  "teamComposition": "состав команды" | null,
  "decisionMaker": "кто принимает решение о найме" | null,
  "hiringStages": число (кол-во этапов) | null,
  "testTask": "описание тестового задания" | null,

  "scoringCriteria": [
    { "criterion": "название критерия", "weight": число (процент, сумма всех = 100), "type": "required" | "nice_to_have" | "stop_factor" }
  ],

  "clientNotes": "заметки по клиенту" | null,
  "internalNotes": "внутренние заметки" | null
}

ПРАВИЛА:
1. Если информация отсутствует — ставь null для строк, [] для массивов
2. Определяй role и grade на основе контекста, даже если не указаны явно
3. Разделяй обязательные навыки (requiredSkills) и желательные (niceToHaveSkills)
4. Для scoringCriteria — выдели 5-8 ключевых критериев оценки кандидатов с весами (сумма = 100%)
5. Если видишь стоп-факторы (кого НЕ брать) — добавь в redFlags
6. keyTasks — конкретные задачи, которые будет выполнять дизайнер
7. Возвращай ТОЛЬКО JSON
8. ВСЕ ТЕКСТОВЫЕ ПОЛЯ — ТОЛЬКО НА РУССКОМ ЯЗЫКЕ. Если документ на английском — переводи задачи, навыки, домены, описания, критерии скоринга и прочие текстовые значения на русский. Исключения: названия инструментов (Figma, Notion и т.д.), URL, имена собственные компаний — оставляй как есть.`;
}
