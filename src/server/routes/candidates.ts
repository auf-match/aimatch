import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { Prisma, CandidateRole, Grade, CandidateStatus, Segment } from "@prisma/client";

const router = Router();

// GET /api/candidates — список с пагинацией, фильтрами, поиском
router.get("/api/candidates", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const search = (req.query.search as string)?.trim();
    const role = req.query.role as string;
    const grade = req.query.grade as string;
    const status = req.query.status as string;
    const domain = req.query.domain as string;
    const skill = req.query.skill as string;
    const platform = req.query.platform as string;
    const segment = req.query.segment as string;
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string) === "asc" ? "asc" : "desc";

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

    res.json({
      data: candidates,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/candidates error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// GET /api/candidates/:id — полная карточка
router.get("/api/candidates/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: req.params.id as string },
      include: {
        experiences: true,
        notes: { orderBy: { createdAt: "desc" } },
        matchResults: {
          include: { vacancy: { select: { id: true, title: true, status: true } } },
          orderBy: { overallScore: "desc" },
        },
        shortlistEntries: {
          include: { vacancy: { select: { id: true, title: true } } },
        },
      },
    });

    if (!candidate) {
      res.status(404).json({ error: "Кандидат не найден" });
      return;
    }

    res.json(candidate);
  } catch (error) {
    console.error("GET /api/candidates/:id error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// PATCH /api/candidates/:id — ручное редактирование
router.patch("/api/candidates/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await prisma.candidate.findUnique({
      where: { id: req.params.id as string },
    });

    if (!existing) {
      res.status(404).json({ error: "Кандидат не найден" });
      return;
    }

    const editableFields = [
      "name", "role", "grade", "yearsOfExperience",
      "specializations", "domains", "segment", "platforms",
      "skills", "tools", "location", "timezone", "languages",
      "salaryExpectations", "education",
      "hasBigtechExperience", "hasStudioExperience", "hasInternationalExperience",
      "telegramContact", "email", "linkedinUrl",
      "portfolioLinks", "status",
    ] as const;

    const data: Record<string, unknown> = {};
    const overrides: Record<string, unknown> = {};

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
        overrides[field] = req.body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Нет полей для обновления" });
      return;
    }

    // Слить новые overrides с существующими
    const existingOverrides = (existing.manualOverrides as Record<string, unknown>) || {};
    data.manualOverrides = { ...existingOverrides, ...overrides };

    const candidate = await prisma.candidate.update({
      where: { id: req.params.id as string },
      data,
      include: { experiences: true },
    });

    res.json(candidate);
  } catch (error) {
    console.error("PATCH /api/candidates/:id error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// DELETE /api/candidates/:id
router.delete("/api/candidates/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await prisma.candidate.findUnique({
      where: { id: req.params.id as string },
    });

    if (!existing) {
      res.status(404).json({ error: "Кандидат не найден" });
      return;
    }

    await prisma.candidate.delete({ where: { id: req.params.id as string } });

    res.status(204).end();
  } catch (error) {
    console.error("DELETE /api/candidates/:id error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

export default router;
