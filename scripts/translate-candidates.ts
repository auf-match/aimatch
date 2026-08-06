/**
 * Переводит текстовые поля всех кандидатов в БД на русский язык.
 * Поля: skills, specializations, domains, platforms, aiSummary, aiStrengths,
 *       aiConcerns, experiences[].role, experiences[].keyAchievements
 *
 * Запуск: npx tsx scripts/translate-candidates.ts
 */

import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ─── Gemini-вызов с fallback ────────────────────────────────────────
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

async function callGemini(prompt: string): Promise<string> {
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (e) {
      console.warn(`[gemini] ${modelName} failed:`, (e as Error).message?.slice(0, 80));
    }
  }
  throw new Error("Все модели Gemini недоступны");
}

// ─── Структура данных кандидата для перевода ──────────────────────
interface CandidateTranslateInput {
  skills: string[];
  specializations: string[];
  domains: string[];
  platforms: string[];
  aiSummary: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  experiences: Array<{
    id: string;
    role: string;
    keyAchievements: string[];
  }>;
}

interface CandidateTranslateOutput {
  skills: string[];
  specializations: string[];
  domains: string[];
  platforms: string[];
  aiSummary: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  experiences: Array<{
    id: string;
    role: string;
    keyAchievements: string[];
  }>;
}

// ─── Проверка: есть ли English текст ───────────────────────────────
function hasEnglishText(candidate: CandidateTranslateInput): boolean {
  const allText = [
    ...candidate.skills,
    ...candidate.specializations,
    ...candidate.domains,
    ...candidate.platforms,
    candidate.aiSummary ?? "",
    ...candidate.aiStrengths,
    ...candidate.aiConcerns,
    ...candidate.experiences.flatMap((e) => [e.role, ...e.keyAchievements]),
  ].join(" ");

  // Считаем долю ASCII-латиницы (грубо но достаточно)
  const latinChars = (allText.match(/[a-zA-Z]/g) ?? []).length;
  const total = allText.replace(/\s/g, "").length;
  return total > 0 && latinChars / total > 0.25;
}

// ─── Перевод одного кандидата через Gemini ──────────────────────
async function translateCandidate(
  input: CandidateTranslateInput,
): Promise<CandidateTranslateOutput> {
  const prompt = `Ты — переводчик для рекрутинговой системы. Переведи все английские текстовые значения на русский язык.

ПРАВИЛА ПЕРЕВОДА:
1. Переводи навыки, специализации, домены, платформы, описания, достижения, роли на русский.
2. Инструменты и собственные названия (Figma, Miro, Notion, A/B testing, UX, UI, SaaS, B2B, B2C, CRM, MVP, JTBD, BigTech) — ОСТАВЬ КАК ЕСТЬ, не переводи.
3. Если значение уже на русском — оставь как есть, не меняй.
4. Верни ТОЛЬКО чистый JSON, без markdown, без комментариев.
5. Сохрани точно ту же структуру и те же массивы, только переведи строки.

Входные данные:
${JSON.stringify(input, null, 2)}

Верни JSON с той же структурой:`;

  let raw = await callGemini(prompt);
  raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();

  try {
    return JSON.parse(raw) as CandidateTranslateOutput;
  } catch {
    throw new Error(`Невалидный JSON от Gemini: ${raw.slice(0, 200)}`);
  }
}

// ─── Основной поток ─────────────────────────────────────────────
async function main() {
  const candidates = await prisma.candidate.findMany({
    include: { experiences: true },
  });

  console.log(`Всего кандидатов: ${candidates.length}`);

  let translated = 0;
  let skipped = 0;
  let errors = 0;

  for (const candidate of candidates) {
    const input: CandidateTranslateInput = {
      skills: candidate.skills,
      specializations: candidate.specializations,
      domains: candidate.domains,
      platforms: candidate.platforms,
      aiSummary: candidate.aiSummary,
      aiStrengths: candidate.aiStrengths,
      aiConcerns: candidate.aiConcerns,
      experiences: candidate.experiences.map((e) => ({
        id: e.id,
        role: e.role,
        keyAchievements: e.keyAchievements,
      })),
    };

    if (!hasEnglishText(input)) {
      console.log(`  ✓ ${candidate.name} — уже на русском, пропускаем`);
      skipped++;
      continue;
    }

    console.log(`  → Переводим: ${candidate.name}...`);

    try {
      const output = await translateCandidate(input);

      // Обновляем кандидата
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          skills: output.skills,
          specializations: output.specializations,
          domains: output.domains,
          platforms: output.platforms,
          aiSummary: output.aiSummary,
          aiStrengths: output.aiStrengths,
          aiConcerns: output.aiConcerns,
        },
      });

      // Обновляем опыт работы
      for (const exp of output.experiences) {
        await prisma.experience.update({
          where: { id: exp.id },
          data: {
            role: exp.role,
            keyAchievements: exp.keyAchievements,
          },
        });
      }

      console.log(`  ✅ ${candidate.name} — переведён`);
      translated++;

      // Небольшая пауза чтобы не сжечь квоту
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  ❌ ${candidate.name} — ошибка:`, (e as Error).message);
      errors++;
    }
  }

  console.log(`\nГотово: переведено ${translated}, пропущено ${skipped}, ошибок ${errors}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
