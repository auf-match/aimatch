import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const PROMPT = `Ты — эксперт по рекрутингу дизайнеров. Тебе дан свободный текст с описанием требований к кандидату на дизайнерскую позицию.

Твоя задача — извлечь из текста структурированные критерии скоринга для матчинга кандидатов.

Каждый критерий должен содержать:
- "criterion" — краткое название критерия (2-5 слов)
- "weight" — вес в процентах (число от 0 до 100)
- "type" — тип критерия:
  - "required" — обязательный (без этого кандидат не подходит)
  - "nice_to_have" — желательный (повышает рейтинг)
  - "stop_factor" — стоп-фактор (если есть — кандидат не подходит)

ВАЖНО:
- Сумма всех weight должна быть ровно 100
- Обычно 5-10 критериев
- Стоп-факторы обычно имеют weight 0 (они бинарные)
- Больший weight = более важный критерий

Верни ТОЛЬКО чистый JSON массив, без markdown, без пояснений. Формат:
[{"criterion": "...", "weight": N, "type": "required|nice_to_have|stop_factor"}, ...]`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body.text;

    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return NextResponse.json(
        { error: "Текст слишком короткий" },
        { status: 400 },
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      { text: PROMPT },
      { text: `Текст описания:\n\n${text.trim()}` },
    ]);

    let rawResponse = result.response.text();

    // Remove markdown wrapper if present
    rawResponse = rawResponse
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");

    let criteria;
    try {
      criteria = JSON.parse(rawResponse);
    } catch {
      return NextResponse.json(
        { error: "AI вернул невалидный ответ" },
        { status: 500 },
      );
    }

    if (!Array.isArray(criteria)) {
      return NextResponse.json(
        { error: "AI вернул неверный формат" },
        { status: 500 },
      );
    }

    // Validate and normalize
    const validated = criteria
      .filter(
        (c: { criterion?: string; weight?: number; type?: string }) =>
          c.criterion && typeof c.criterion === "string" && typeof c.weight === "number",
      )
      .map((c: { criterion: string; weight: number; type?: string }) => ({
        criterion: c.criterion,
        weight: Math.max(0, Math.min(100, Math.round(c.weight))),
        type: ["required", "nice_to_have", "stop_factor"].includes(c.type || "")
          ? c.type
          : "required",
      }));

    return NextResponse.json({ criteria: validated });
  } catch (error) {
    console.error("POST /api/vacancies/parse-criteria error:", error);
    return NextResponse.json(
      { error: "Ошибка при анализе критериев" },
      { status: 500 },
    );
  }
}
