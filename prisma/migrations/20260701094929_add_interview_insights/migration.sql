-- CreateEnum
CREATE TYPE "VacancyInterviewSource" AS ENUM ('TEXT', 'AUDIO');

-- CreateEnum
CREATE TYPE "VacancyInterviewStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN     "interviewInsights" JSONB;

-- CreateTable
CREATE TABLE "VacancyInterview" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "source" "VacancyInterviewSource" NOT NULL,
    "rawText" TEXT,
    "audioFileUrl" TEXT,
    "transcript" TEXT,
    "status" "VacancyInterviewStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,

    CONSTRAINT "VacancyInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyInterview_vacancyId_createdAt_idx" ON "VacancyInterview"("vacancyId", "createdAt");

-- AddForeignKey
ALTER TABLE "VacancyInterview" ADD CONSTRAINT "VacancyInterview_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
