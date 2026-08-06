import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        experiences: true,
        notes: { orderBy: { createdAt: "desc" } },
        matchResults: {
          include: { vacancy: { select: { id: true, title: true, status: true } } },
          orderBy: { overallScore: "desc" },
        },
        pipelines: {
          include: { vacancy: { select: { id: true, title: true } } },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 });
    }

    return NextResponse.json(candidate);
  } catch (error) {
    console.error("GET /api/candidates/:id error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const existing = await prisma.candidate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 });
    }

    const body = await req.json();

    const editableFields = [
      "name", "role", "grade", "yearsOfExperience",
      "specializations", "domains", "segment", "platforms",
      "skills", "tools", "location", "timezone", "languages",
      "salaryExpectations", "education",
      "hasBigtechExperience", "hasStudioExperience", "hasInternationalExperience",
      "aiSummary", "aiStrengths", "aiConcerns",
      "telegramContact", "email", "linkedinUrl",
      "portfolioLinks", "status", "source",
    ];

    const data: Record<string, unknown> = {};
    const overrides: Record<string, unknown> = {};

    for (const field of editableFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
        overrides[field] = body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }

    const existingOverrides = (existing.manualOverrides as Record<string, unknown>) || {};
    data.manualOverrides = { ...existingOverrides, ...overrides };

    const candidate = await prisma.candidate.update({
      where: { id },
      data,
      include: { experiences: true, notes: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json(candidate);
  } catch (error) {
    console.error("PATCH /api/candidates/:id error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
