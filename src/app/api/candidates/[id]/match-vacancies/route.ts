import { NextRequest, NextResponse } from "next/server";
import { matchCandidateAgainstVacancies } from "@/server/services/matching-engine";

export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { results, diagnostics } = await matchCandidateAgainstVacancies(id);
    return NextResponse.json({
      matched: results.length,
      results,
      diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка матчинга";
    console.error("match-vacancies error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
