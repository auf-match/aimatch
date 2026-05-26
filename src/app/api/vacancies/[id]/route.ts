import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id },
      include: {
        matchResults: {
          include: {
            candidate: {
              select: {
                id: true, name: true, role: true, grade: true, aiSummary: true,
                portfolioLinks: true, telegramContact: true, email: true, linkedinUrl: true,
              },
            },
          },
          orderBy: { overallScore: "desc" },
        },
        pipelines: {
          include: { candidate: { select: { id: true, name: true, role: true, grade: true } } },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            matchResults: true,
            pipelines: true,
          },
        },
      },
    });

    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    return NextResponse.json(vacancy);
  } catch (error) {
    console.error("GET /api/vacancies/:id error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const existing = await prisma.vacancy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    const body = await req.json();

    const editableFields = [
      "title", "status", "clientName", "clientLead", "productDescription", "reasonForHiring",
      "role", "grade", "designersNeeded", "employmentType", "workFormat",
      "location", "timezone", "salaryRange", "desiredStartDate", "duration",
      "keyTasks", "requiredSkills", "niceToHaveSkills", "preferredDomains",
      "requiredTools", "needsInternational", "specialCompetencies", "redFlags",
      "portfolioReferences", "teamComposition", "decisionMaker", "hiringStages", "testTask",
      "scoringCriteria", "clientNotes", "internalNotes", "clientPriorities",
    ];

    const data: Record<string, unknown> = {};

    for (const field of editableFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Нет полей для обновления" }, { status: 400 });
    }

    // Установить closedAt при закрытии вакансии
    if (data.status === "CLOSED" || data.status === "FILLED") {
      data.closedAt = new Date();
    }

    const vacancy = await prisma.vacancy.update({
      where: { id },
      data,
    });

    return NextResponse.json(vacancy);
  } catch (error) {
    console.error("PATCH /api/vacancies/:id error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const existing = await prisma.vacancy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }

    await prisma.vacancy.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/vacancies/:id error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
