import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { FeedbackRating } from "@prisma/client";

/**
 * PATCH /api/match-results/[id]/feedback
 * Body: { rating: "GOOD" | "BAD" | "NEUTRAL" | null, feedback?: string }
 *
 * Сохраняет фидбек дизайн-лида по матчу. Используется в матчинге следующих
 * прогонов для калибровки AI («не показывай похожих на этого, потому что Y»).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const data: { feedbackRating?: FeedbackRating | null; humanFeedback?: string | null } = {};

  if (body.rating === null) {
    data.feedbackRating = null;
  } else if (body.rating && ["GOOD", "BAD", "NEUTRAL"].includes(body.rating)) {
    data.feedbackRating = body.rating as FeedbackRating;
  }

  if (typeof body.feedback === "string") {
    data.humanFeedback = body.feedback.trim() || null;
  } else if (body.feedback === null) {
    data.humanFeedback = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
  }

  try {
    const updated = await prisma.matchResult.update({
      where: { id },
      data,
      select: { id: true, feedbackRating: true, humanFeedback: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[match-feedback] error:", err);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}

/**
 * DELETE /api/match-results/[id]/feedback
 * Сбрасывает фидбек.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.matchResult.update({
      where: { id },
      data: { feedbackRating: null, humanFeedback: null },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[match-feedback] delete error:", err);
    return NextResponse.json({ error: "Не удалось сбросить" }, { status: 500 });
  }
}
