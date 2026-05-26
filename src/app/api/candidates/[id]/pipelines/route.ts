import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: candidateId } = await params;
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { candidateId },
      include: {
        vacancy: { select: { id: true, title: true, clientName: true, grade: true } },
        transitions: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(pipelines);
  } catch (error) {
    console.error("GET candidate pipelines error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
