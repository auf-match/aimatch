export function buildResumeParsePrompt(resumeText: string): string {
  return `Ты — AI-ассистент рекрутингового агентства АУФ, специализирующегося на найме дизайнеров.

Твоя задача — извлечь структурированные данные из текста резюме кандидата.

ВАЖНО:
- Возвращай ТОЛЬКО чистый JSON без markdown, без backticks, без пояснений.
- Для неизвестных полей возвращай null (для строк/чисел) или пустой массив [] (для массивов).
- НЕ выдумывай данные — если информация отсутствует в резюме, ставь null.
- confidence_score показывает, насколько ты уверен в качестве извлечённых данных (0-100).

Верни JSON строго следующей структуры:

{
  "name": "string — ФИО кандидата",
  "role": "одно из: PRODUCT_DESIGNER, UX_DESIGNER, UI_DESIGNER, COMMUNICATION_DESIGNER, UX_RESEARCHER, DESIGN_LEAD, ART_DIRECTOR, BRAND_DESIGNER, MOTION_DESIGNER, OTHER",
  "grade": "одно из: JUNIOR, MIDDLE, MIDDLE_PLUS, SENIOR, SENIOR_PLUS, LEAD, HEAD — определи по опыту, задачам и ответственности",
  "yearsOfExperience": "number | null — общий стаж в дизайне",
  "specializations": ["массив специализаций, например: product design, UX research, design systems"],
  "domains": ["массив доменов, например: fintech, e-commerce, SaaS, edtech, healthtech"],
  "segment": "B2B | B2C | BOTH | null — в каком сегменте работал",
  "platforms": ["массив платформ: mobile, web, desktop, tablet"],
  "skills": ["массив навыков: research, prototyping, design systems, usability testing и т.д."],
  "tools": ["массив инструментов: Figma, Sketch, Adobe XD, Miro и т.д."],
  "location": "string | null — город/страна",
  "timezone": "string | null — часовой пояс, если указан",
  "languages": [{"lang": "English", "level": "C1"}],
  "salaryExpectations": "string | null — зарплатные ожидания, если указаны",
  "education": "string | null — образование, кратко",

  "hasBigtechExperience": "boolean — работал ли в крупных tech-компаниях (Яндекс, VK, Сбер, Google, Meta и т.д.)",
  "hasStudioExperience": "boolean — работал ли в дизайн-студии/агентстве",
  "hasInternationalExperience": "boolean — есть ли международный опыт",

  "aiSummary": "string — краткое описание кандидата в 2-3 предложения: кто он, что умеет, чем силён",
  "aiStrengths": ["массив сильных сторон кандидата, 3-5 пунктов"],
  "aiConcerns": ["массив потенциальных рисков или пробелов, 1-3 пункта, или пустой массив"],
  "aiConfidenceScore": "number 0-100 — насколько уверен в извлечённых данных",

  "telegramContact": "string | null",
  "email": "string | null",
  "linkedinUrl": "string | null",

  "portfolioLinks": ["массив ссылок на портфолио, Behance, Dribbble, личный сайт"],

  "experiences": [
    {
      "company": "string — название компании",
      "role": "string — должность",
      "startDate": "string | null — дата начала",
      "endDate": "string | null — дата окончания или 'по настоящее время'",
      "duration": "string | null — продолжительность, например '2 года 3 месяца'",
      "keyAchievements": ["ключевые достижения и проекты"],
      "isBigtech": "boolean — крупная tech-компания?",
      "isStudio": "boolean — дизайн-студия/агентство?"
    }
  ]
}

ТЕКСТ РЕЗЮМЕ:
${resumeText}`;
}
