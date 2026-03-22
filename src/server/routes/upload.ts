import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { extractText } from "../utils/file-processing";
import { parseResume } from "../services/claude";
import { prisma } from "../db";
import { FileProcessingError } from "../utils/file-processing";
import { ClaudeServiceError } from "../services/claude";

const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".pdf" || ext === ".docx") {
      cb(null, true);
    } else {
      cb(new Error("Поддерживаются только .pdf и .docx файлы"));
    }
  },
});

const router = Router();

router.post(
  "/api/candidates/upload",
  upload.single("resume"),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Файл резюме не загружен" });
      return;
    }

    const portfolioLink = req.body.portfolioLink as string | undefined;

    try {
      // 1. Извлечь текст из файла
      const fileBuffer = fs.readFileSync(file.path);
      const { text, fileType } = await extractText(fileBuffer, file.originalname);

      // 2. Отправить в Claude для парсинга
      const candidateData = await parseResume(text, fileType);

      // 3. Добавить ссылку на портфолио, если передана
      const portfolioLinks = candidateData.portfolioLinks || [];
      if (portfolioLink && !portfolioLinks.includes(portfolioLink)) {
        portfolioLinks.push(portfolioLink);
      }

      // 4. Сохранить в БД
      const candidate = await prisma.candidate.create({
        data: {
          name: candidateData.name,
          role: candidateData.role,
          grade: candidateData.grade,
          yearsOfExperience: candidateData.yearsOfExperience,
          specializations: candidateData.specializations,
          domains: candidateData.domains,
          segment: candidateData.segment,
          platforms: candidateData.platforms,
          skills: candidateData.skills,
          tools: candidateData.tools,
          location: candidateData.location,
          timezone: candidateData.timezone,
          languages: candidateData.languages ?? undefined,
          salaryExpectations: candidateData.salaryExpectations,
          education: candidateData.education,

          hasBigtechExperience: candidateData.hasBigtechExperience,
          hasStudioExperience: candidateData.hasStudioExperience,
          hasInternationalExperience: candidateData.hasInternationalExperience,

          aiSummary: candidateData.aiSummary,
          aiStrengths: candidateData.aiStrengths,
          aiConcerns: candidateData.aiConcerns,
          aiConfidenceScore: candidateData.aiConfidenceScore,

          telegramContact: candidateData.telegramContact,
          email: candidateData.email,
          linkedinUrl: candidateData.linkedinUrl,

          status: "PARSED",
          resumeFileUrl: file.path,
          resumeRawText: text,
          portfolioLinks,

          experiences: {
            create: (candidateData.experiences || []).map((exp) => ({
              company: exp.company,
              role: exp.role,
              startDate: exp.startDate,
              endDate: exp.endDate,
              duration: exp.duration,
              keyAchievements: exp.keyAchievements,
              isBigtech: exp.isBigtech,
              isStudio: exp.isStudio,
            })),
          },
        },
        include: { experiences: true },
      });

      res.status(201).json(candidate);
    } catch (error) {
      // Удалить загруженный файл при ошибке обработки
      fs.unlink(file.path, () => {});

      if (error instanceof FileProcessingError) {
        res.status(422).json({ error: error.message });
        return;
      }
      if (error instanceof ClaudeServiceError) {
        res.status(502).json({ error: error.message });
        return;
      }

      console.error("Upload error:", error);
      res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  },
);

export default router;
