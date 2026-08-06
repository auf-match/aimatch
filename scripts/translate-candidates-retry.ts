/**
 * Повторный перевод кандидатов, которые не перевелись из-за квоты.
 * Запуск: npx tsx scripts/translate-candidates-retry.ts
 */
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

async function callGemini(prompt: string): Promise<string> {
  for (const m of MODELS) {
    try {
      const result = await genAI.getGenerativeModel({ model: m }).generateContent(prompt);
      if (m !== MODELS[0]) console.log(`  [fallback: ${m}]`);
      return result.response.text();
    } catch (e) {
      console.warn(`  ${m} failed:`, (e as Error).message?.slice(0, 80));
    }
  }
  throw new Error("Все модели Gemini недоступны");
}

const FAILED = [
  "Ivanova Anastasia",
  "Maria Rafalskaya",
  "Michael Rodionov",
  "Алла Кучинская",
  "Dmitriy Gorbushin",
];

async function main() {
  const candidates = await prisma.candidate.findMany({
    where: { name: { in: FAILED } },
    include: { experiences: true },
  });

  console.log(`Кандидатов для повторного перевода: ${candidates.length}`);

  for (const c of candidates) {
    const input = {
      skills: c.skills,
      specializations: c.specializations,
      domains: c.domains,
      platforms: c.platforms,
      aiSummary: c.aiSummary,
      aiStrengths: c.aiStrengths,
      aiConcerns: c.aiConcerns,
      experiences: c.experiences.map((e) => ({
        id: e.id,
        role: e.role,
        keyAchievements: e.keyAchievements,
      })),
    };

    console.log(`→ Переводим: ${c.name}...`);

    const prompt = `Переведи все английские текстовые значения на русский язык.
ПРАВИЛА:
- Технические названия инструментов (Figma, Miro, Notion, A/B testing, UX, UI, SaaS, B2B, B2C, CRM, MVP, JTBD, BigTech, Web3) — не переводи.
- Если значение уже на русском — оставь как есть.
- Верни ТОЛЬКО чистый JSON, без markdown, без пояснений, с той же структурой.

${JSON.stringify(input)}`;

    try {
      let raw = await callGemini(prompt);
      raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
      const out = JSON.parse(raw);

      await prisma.candidate.update({
        where: { id: c.id },
        data: {
          skills: out.skills,
          specializations: out.specializations,
          domains: out.domains,
          platforms: out.platforms,
          aiSummary: out.aiSummary,
          aiStrengths: out.aiStrengths,
          aiConcerns: out.aiConcerns,
        },
      });

      for (const exp of out.experiences) {
        await prisma.experience.update({
          where: { id: exp.id },
          data: { role: exp.role, keyAchievements: exp.keyAchievements },
        });
      }

      console.log(`✅ ${c.name}`);
      await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error(`❌ ${c.name}:`, (e as Error).message);
    }
  }

  console.log("\nГотово");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
