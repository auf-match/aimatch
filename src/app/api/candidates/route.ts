import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { Prisma, CandidateRole, Grade, CandidateStatus, Segment } from "@prisma/client";

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
    const domain = params.get("domain");
    const skill = params.get("skill");
    const platform = params.get("platform");
    const segment = params.get("segment");
    const sortBy = params.get("sortBy") || "createdAt";
    const sortOrder = params.get("sortOrder") === "asc" ? "asc" : "desc";

    const where: Prisma.CandidateWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { aiSummary: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role) where.role = role as CandidateRole;
    if (grade) where.grade = grade as Grade;
    if (status) where.status = status as CandidateStatus;
    if (segment) where.segment = segment as Segment;
    if (domain) where.domains = { has: domain };
    if (skill) where.skills = { has: skill };
    if (platform) where.platforms = { has: platform };

    const allowedSortFields = [
      "createdAt", "updatedAt", "name", "grade", "yearsOfExperience", "aiConfidenceScore",
    ];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder },
        include: { experiences: true },
      }),
      prisma.candidate.count({ where }),
    ]);

    return NextResponse.json({
      data: candidates,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/candidates error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
