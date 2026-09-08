import { prisma } from "@/server/db";
import { callGemini } from "@/server/services/claude";
import { buildPublicRenditionPrompt } from "@/server/prompts/public-rendition";
import { toPublicResult, type PublicResult } from "@/lib/public-result";
import { applyRendition } from "@/lib/public-rendition";

/**
 * Готовит текст разбора для самого человека: тот же смысл, но обращение
 * напрямую, на «ты».
 *
 * Отдельным проходом, а не правкой основного промпта, потому что разбор
 * один на двоих. Дизайн-лиду нужен рабочий документ в третьем лице, и
 * менять его ради публичной страницы нельзя. Поэтому берём готовый
 * результат и перекладываем.
 *
 * Кладём в сам разбор, под ключ public. Отдельного поля в таблице нет, а
 * заводить его ради одного текста — лишняя миграция.
 */

/** Что дописываем в portfolioAnalysis */
interface СРазбором {
  public?: PublicResult;
  publicFailed?: boolean;
}

/** Достаёт готовое переложение, если оно уже сделано. */
export function готовоеПереложение(разбор: unknown): PublicResult | null {
  if (!разбор || typeof разбор !== "object") return null;
  const p = (разбор as СРазбором).public;
  return p && typeof p === "object" ? p : null;
}

/** Переложение уже пробовали и не вышло — показываем исходный текст. */
export function переложениеНеВышло(разбор: unknown): boolean {
  if (!разбор || typeof разбор !== "object") return false;
  return (разбор as СРазбором).publicFailed === true;
}

/**
 * Делает переложение и сохраняет его. Вызывать после того, как разбор
 * готов. Молча ничего не делает, если разбора нет или он уже переложен.
 */
export async function makePublicRendition(candidateId: string): Promise<void> {
  const кандидат = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { portfolioAnalysis: true },
  });
  const разбор = кандидат?.portfolioAnalysis;
  if (!разбор || готовоеПереложение(разбор)) return;

  const исходный = toPublicResult(разбор);
  if (!исходный) return; // показывать нечего — и перекладывать нечего

  let наложенное: PublicResult | null = null;
  try {
    const raw = await callGemini([{ text: buildPublicRenditionPrompt(исходный) }]);
    const чистый = raw
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    наложенное = applyRendition(исходный, JSON.parse(чистый));
  } catch (e) {
    console.warn(
      `[public-rendition] ${candidateId}: не вышло —`,
      (e as Error).message.slice(0, 120),
    );
  }

  // Пометку о неудаче ставим обязательно: без неё страница будет вечно
  // ждать переложения, которого не будет, и человек не увидит разбора
  const дополнение: СРазбором = наложенное
    ? { public: наложенное }
    : { publicFailed: true };

  await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      portfolioAnalysis: {
        ...(разбор as Record<string, unknown>),
        ...дополнение,
      } as never,
    },
  });
}
