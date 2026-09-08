import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { normalizeSubmission } from "@/lib/public-intake";
import { analyzeImportedCandidate } from "@/server/services/candidate-analysis";
import { makePublicRendition } from "@/server/services/public-rendition";

export const maxDuration = 60;

/**
 * POST /api/public/portfolio — заявка с публичной страницы разбора.
 *
 * Единственный маршрут приложения, открытый интернету без пароля, поэтому
 * ведёт себя осторожно: наружу не уходит ничего, кроме «принято», а причины
 * отказа отдаются только по полям формы — ни имён из базы, ни устройства
 * системы отсюда не видно.
 *
 * По решению дизайн-лида: кандидат попадает в ОБЩУЮ базу с пометкой
 * источника, дубликаты не проверяются, разбор запускается сразу.
 *
 * Разбор пущен вдогонку, без ожидания: он идёт минуты (скрейпинг плюс
 * модель), а человек у формы столько не ждёт. Ему сразу показывается экран
 * ожидания, и это честно — работа действительно уже началась.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const разбор = normalizeSubmission(body);

  if (!разбор.ok) {
    // Боту отвечаем как при успехе: узнав про приманку, он её обойдёт
    if (разбор.бот) return NextResponse.json({ ok: true });
    return NextResponse.json(
      { error: разбор.ошибка, поле: разбор.поле },
      { status: 400 },
    );
  }

  try {
    const кандидат = await prisma.candidate.create({
      data: разбор.row,
      select: { id: true },
    });

    // Разбор, а следом переложение на «ты» — страница ждёт именно его
    void (async () => {
      await analyzeImportedCandidate(кандидат.id);
      await makePublicRendition(кандидат.id);
    })().catch((err) => console.error(`[public] разбор ${кандидат.id} упал:`, err));

    return NextResponse.json({ ok: true, id: кандидат.id });
  } catch (e) {
    console.error("[public] не удалось завести кандидата:", e);
    // Наружу — без подробностей: это открытый маршрут
    return NextResponse.json({ error: "Не удалось принять заявку" }, { status: 500 });
  }
}
