/**
 * Промпт: на вход текущая вакансия (структурированно) + текст уточнения со встречи.
 * На выход — JSON массив предложений по изменениям полей вакансии.
 */
export function buildVacancyUpdateParsePrompt(args: {
  vacancy: Record<string, unknown>;
  updateText: string;
}): string {
  return `Ты помогаешь рекрутёру обновить вакансию по итогам встречи с клиентом.

Текущая структура вакансии (JSON):
${JSON.stringify(args.vacancy, null, 2)}

Текст уточнения со встречи:
"""
${args.updateText}
"""

Твоя задача — предложить точечные изменения полей вакансии на основе того, что РЕАЛЬНО прозвучало в уточнении. Очень важно:

1. НЕ ПРЕДЛАГАЙ изменений, которые уже отражены в текущей вакансии. Если задача "Дизайн-системы" уже в keyTasks — не предлагай её добавить.
2. Не выдумывай и не интерпретируй сверх сказанного. Если в тексте нет информации о зарплате — не трогай salaryRange.
3. Каждое предложение должно соответствовать ОДНОМУ полю и ОДНОЙ операции.
4. Используй только эти операции (op):
   - "set" — для скалярных полей (productDescription, salaryRange, reasonForHiring, clientNotes, teamComposition, needsInternational). proposedValue = новое значение целиком.
   - "add" — добавить элемент в массив (keyTasks, requiredSkills, niceToHaveSkills, preferredDomains, requiredTools, redFlags, specialCompetencies). proposedValue = один добавляемый элемент (строка).
   - "remove" — удалить элемент из массива. proposedValue = существующий элемент массива для точного совпадения (строка).
   - "modify" — заменить элемент массива. proposedValue = { "from": "старый", "to": "новый" }.
   - Для scoringCriteria: "add" — { "criterion": "...", "weight": число 1-100, "type": "required" | "nice_to_have" | "stop_factor" }. "remove" — строка-имя критерия. "modify" — { "from": "имя", "to": { "criterion": ..., "weight": ..., "type": ... } }.
5. Если критерий уже есть, но вес другой — используй modify со scoringCriteria.
6. currentValue — что сейчас в этом поле (для UI). Для add это весь массив или null если поле пустое. Для set — текущее скалярное значение.
7. reason — одно короткое предложение, почему это предлагается (что именно в тексте уточнения это обосновывает).

Верни ТОЛЬКО валидный JSON (без markdown, без backticks) в формате:
{
  "items": [
    { "field": "имя поля", "op": "set|add|remove|modify", "currentValue": ..., "proposedValue": ..., "reason": "..." }
  ]
}

Если в тексте уточнения нет ничего, что меняет вакансию — верни { "items": [] }.`;
}
