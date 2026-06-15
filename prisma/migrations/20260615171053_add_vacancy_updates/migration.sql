-- CreateEnum
CREATE TYPE "VacancyUpdateKind" AS ENUM ('TEXT', 'AUDIO');

-- CreateEnum
CREATE TYPE "VacancyUpdateStatus" AS ENUM ('PROCESSING', 'PENDING', 'APPLIED', 'DISMISSED', 'EMPTY', 'FAILED');

-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN     "criteriaUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VacancyUpdate" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "kind" "VacancyUpdateKind" NOT NULL,
    "rawText" TEXT,
    "audioFileUrl" TEXT,
    "transcript" TEXT,
    "status" "VacancyUpdateStatus" NOT NULL DEFAULT 'PROCESSING',
    "proposedDiff" JSONB,
    "appliedDiff" JSONB,
    "appliedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "VacancyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyUpdate_vacancyId_createdAt_idx" ON "VacancyUpdate"("vacancyId", "createdAt");

-- AddForeignKey
ALTER TABLE "VacancyUpdate" ADD CONSTRAINT "VacancyUpdate_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
