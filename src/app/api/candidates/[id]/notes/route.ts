import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const candidate = await prisma.candidate.findUnique({ where: { id } });
    if (!candidate) {
      return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 });
    }

    const body = await req.json();
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Текст заметки обязателен" }, { status: 400 });
    }

    const note = await prisma.candidateNote.create({
      data: {
        candidateId: id,
        authorName: body.authorName?.trim() || "Аноним",
        content: body.content.trim(),
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("POST notes error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
