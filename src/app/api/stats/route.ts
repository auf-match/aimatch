import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const [candidatesCount, openVacanciesCount] = await Promise.all([
      prisma.candidate.count(),
      prisma.vacancy.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    ]);

    return NextResponse.json({
      candidatesCount,
      openVacanciesCount,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке статистики" },
      { status: 500 },
    );
  }
}
