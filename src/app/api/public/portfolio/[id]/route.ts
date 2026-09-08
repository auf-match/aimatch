import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { PUBLIC_SOURCE } from "@/lib/public-intake";
import { toPublicResult } from "@/lib/public-result";
import {
  готовоеПереложение,
  переложениеНеВышло,
} from "@/server/services/public-rendition";

/**
 * GET /api/public/portfolio/[id] — готов ли разбор заявки.
 *
 * Открыт интернету, поэтому две границы соблюдаются строго:
 *
 * 1. Отдаём ТОЛЬКО кандидатов с источником публичной формы. Иначе по
 *    случайно попавшему идентификатору можно было бы вытащить разбор
 *    любого человека из рабочей базы агентства.
 * 2. Наружу уходит ровно то, что собрал toPublicResult: ни контактов, ни
 *    стоп-факторов, ни устройства системы.
 *
 * Идентификатор — cuid, подобрать его перебором нельзя. Ссылка на разбор
 * и есть ключ к нему: у кого ссылка, тот и смотрит.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const кандидат = await prisma.candidate.findFirst({
    where: { id, source: PUBLIC_SOURCE },
    select: { name: true, status: true, portfolioAnalysis: true, portfolioLinks: true },
  });

  // Не найден или чужой — один и тот же ответ: по разнице ответов можно
  // было бы проверять, есть ли такой кандидат в базе
  if (!кандидат) {
    return NextResponse.json({ error: "Разбор не найден" }, { status: 404 });
  }

  if (кандидат.status === "ANALYSIS_FAILED") {
    return NextResponse.json({ состояние: "не получилось" });
  }

  const исходный = toPublicResult(кандидат.portfolioAnalysis);
  if (!исходный) {
    // Разбора ещё нет — значит идёт. Отдельного «в работе» в статусах нет,
    // и наличие самого разбора здесь надёжнее статуса
    return NextResponse.json({ состояние: "идёт" });
  }

  // Человеку показываем переложение на «ты». Пока его нет — разбор ещё не
  // дошёл до этого шага. Но если переложение не вышло, ждать нечего:
  // отдаём исходный текст, он верный, просто написан в третьем лице
  const переложенный = готовоеПереложение(кандидат.portfolioAnalysis);
  if (!переложенный && !переложениеНеВышло(кандидат.portfolioAnalysis)) {
    return NextResponse.json({ состояние: "идёт" });
  }
  const результат = переложенный ?? исходный;

  return NextResponse.json({
    состояние: "готово",
    имя: кандидат.name,
    портфолио: кандидат.portfolioLinks[0] ?? null,
    результат,
  });
}
