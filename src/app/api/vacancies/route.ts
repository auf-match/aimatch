import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { Prisma, CandidateRole, Grade, VacancyStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const page = Math.max(1, parseInt(params.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const search = params.get("search")?.trim();
    const role = params.get("role");
    const grade = params.get("grade");
    const status = params.get("status");
    const sortBy = params.get("sortBy") || "createdAt";
    const sortOrder = params.get("sortOrder") === "asc" ? "asc" : "desc";

    const where: Prisma.VacancyWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
        { productDescription: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role) where.role = role as CandidateRole;
    if (grade) where.grade = grade as Grade;
    if (status) where.status = status as VacancyStatus;

    const allowedSortFields = [
      "createdAt", "updatedAt", "title", "grade", "status",
    ];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";

    const [vacancies, total] = await Promise.all([
      prisma.vacancy.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder },
        include: {
          _count: {
            select: {
              matchResults: true,
              pipelines: true,
            },
          },
        },
      }),
      prisma.vacancy.count({ where }),
    ]);

    return NextResponse.json({
      data: vacancies,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/vacancies error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.title || !body.role || !body.grade) {
      return NextResponse.json(
        { error: "Поля title, role и grade обязательны" },
        { status: 400 },
      );
    }

    const vacancy = await prisma.vacancy.create({
      data: {
        title: body.title,
        status: body.status || "OPEN",
        clientName: body.clientName,
        clientLead: body.clientLead,
        productDescription: body.productDescription,
        reasonForHiring: body.reasonForHiring,

        role: body.role,
        grade: body.grade,
        designersNeeded: body.designersNeeded ?? 1,
        employmentType: body.employmentType ?? "FULL_TIME",
        workFormat: body.workFormat ?? "REMOTE",
        location: body.location,
        timezone: body.timezone,
        salaryRange: body.salaryRange,
        desiredStartDate: body.desiredStartDate,
        duration: body.duration,

        keyTasks: body.keyTasks || [],
        requiredSkills: body.requiredSkills || [],
        niceToHaveSkills: body.niceToHaveSkills || [],
        preferredDomains: body.preferredDomains || [],
        requiredTools: body.requiredTools || [],
        needsInternational: body.needsInternational ?? false,
        specialCompetencies: body.specialCompetencies || [],
        redFlags: body.redFlags || [],

        portfolioReferences: body.portfolioReferences || [],
        teamComposition: body.teamComposition,
        decisionMaker: body.decisionMaker,
        hiringStages: body.hiringStages,
        testTask: body.testTask,

        scoringCriteria: body.scoringCriteria ?? undefined,
        clientNotes: body.clientNotes,
        internalNotes: body.internalNotes,
        clientPriorities: body.clientPriorities ?? undefined,

        // Брифинг (если вакансия создана из записи Zoom)
        briefingTranscript: body.briefingTranscript ?? null,
        briefingSummary: body.briefingSummary ?? null,
      },
    });

    return NextResponse.json(vacancy, { status: 201 });
  } catch (error) {
    console.error("POST /api/vacancies error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
