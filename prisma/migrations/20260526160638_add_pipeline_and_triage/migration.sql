-- CreateEnum
CREATE TYPE "TriageStatus" AS ENUM ('NEW', 'NEEDS_CLARIFICATION', 'CLARIFYING', 'BASE');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('DL_APPROVED', 'IN_CLIENT_SELECTION', 'REHEARSAL', 'CLIENT_INTERVIEW', 'TEST_TASK', 'OFFER', 'REJECTED', 'HIRED');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "triageStatus" "TriageStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "triageUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "triageUpdatedBy" TEXT;

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "candidateId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL DEFAULT 'DL_APPROVED',
    "notes" TEXT,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pipelineId" TEXT NOT NULL,
    "fromStage" "PipelineStage",
    "toStage" "PipelineStage" NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_candidateId_vacancyId_key" ON "Pipeline"("candidateId", "vacancyId");

-- CreateIndex
CREATE INDEX "StageTransition_pipelineId_idx" ON "StageTransition"("pipelineId");

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
