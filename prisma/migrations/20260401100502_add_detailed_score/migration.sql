-- CreateTable
CREATE TABLE "DetailedScore" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "criteriaScores" JSONB NOT NULL,
    "matchExplanation" TEXT NOT NULL,
    "strengthsForVacancy" TEXT[],
    "gaps" TEXT[],
    "clarificationQuestions" TEXT[],
    "clarificationMessage" TEXT,

    CONSTRAINT "DetailedScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DetailedScore_candidateId_vacancyId_key" ON "DetailedScore"("candidateId", "vacancyId");

-- AddForeignKey
ALTER TABLE "DetailedScore" ADD CONSTRAINT "DetailedScore_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailedScore" ADD CONSTRAINT "DetailedScore_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
