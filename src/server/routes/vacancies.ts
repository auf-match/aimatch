import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { Prisma, CandidateRole, Grade, VacancyStatus } from "@prisma/client";

const router = Router();

// POST /api/vacancies — создание вакансии
router.post("/api/vacancies", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body;

    if (!body.title || !body.role || !body.grade) {
      res.status(400).json({ error: "Поля title, role и grade обязательны" });
      return;
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
      },
    });

    res.status(201).json(vacancy);
  } catch (error) {
    console.error("POST /api/vacancies error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// GET /api/vacancies — список с пагинацией, фильтрами, поиском
router.get("/api/vacancies", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const search = (req.query.search as string)?.trim();
    const role = req.query.role as string;
    const grade = req.query.grade as string;
    const status = req.query.status as string;
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string) === "asc" ? "asc" : "desc";

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

    res.json({
      data: vacancies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/vacancies error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// GET /api/vacancies/:id — полная карточка вакансии
router.get("/api/vacancies/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: req.params.id as string },
      include: {
        matchResults: {
          include: { candidate: { select: { id: true, name: true, role: true, grade: true } } },
          orderBy: { overallScore: "desc" },
        },
        pipelines: {
          include: { candidate: { select: { id: true, name: true, role: true, grade: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!vacancy) {
      res.status(404).json({ error: "Вакансия не найдена" });
      return;
    }

    res.json(vacancy);
  } catch (error) {
    console.error("GET /api/vacancies/:id error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// PATCH /api/vacancies/:id — обновление вакансии
router.patch("/api/vacancies/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await prisma.vacancy.findUnique({
      where: { id: req.params.id as string },
    });

    if (!existing) {
      res.status(404).json({ error: "Вакансия не найдена" });
      return;
    }

    const editableFields = [
      "title", "status", "clientName", "clientLead", "productDescription", "reasonForHiring",
      "role", "grade", "designersNeeded", "employmentType", "workFormat",
      "location", "timezone", "salaryRange", "desiredStartDate", "duration",
      "keyTasks", "requiredSkills", "niceToHaveSkills", "preferredDomains",
      "requiredTools", "needsInternational", "specialCompetencies", "redFlags",
      "portfolioReferences", "teamComposition", "decisionMaker", "hiringStages", "testTask",
      "scoringCriteria", "clientNotes", "internalNotes", "clientPriorities",
    ] as const;

    const data: Record<string, unknown> = {};

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Нет полей для обновления" });
      return;
    }

    // Установить closedAt при закрытии вакансии
    if (data.status === "CLOSED" || data.status === "FILLED") {
      data.closedAt = new Date();
    }

    const vacancy = await prisma.vacancy.update({
      where: { id: req.params.id as string },
      data,
    });

    res.json(vacancy);
  } catch (error) {
    console.error("PATCH /api/vacancies/:id error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// DELETE /api/vacancies/:id
router.delete("/api/vacancies/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await prisma.vacancy.findUnique({
      where: { id: req.params.id as string },
    });

    if (!existing) {
      res.status(404).json({ error: "Вакансия не найдена" });
      return;
    }

    await prisma.vacancy.delete({ where: { id: req.params.id as string } });

    res.status(204).end();
  } catch (error) {
    console.error("DELETE /api/vacancies/:id error:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

export default router;
