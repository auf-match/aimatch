import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { triageStatus, actor } = await req.json();
    if (!triageStatus) {
      return NextResponse.json({ error: "triageStatus обязателен" }, { status: 400 });
    }
    const candidate = await prisma.candidate.update({
      where: { id },
      data: {
        triageStatus,
        triageUpdatedAt: new Date(),
        triageUpdatedBy: actor || "Система",
      },
      select: { id: true, triageStatus: true, triageUpdatedAt: true, triageUpdatedBy: true },
    });
    return NextResponse.json(candidate);
  } catch (error) {
    console.error("PATCH triage error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
