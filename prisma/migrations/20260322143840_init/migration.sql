-- CreateEnum
CREATE TYPE "CandidateRole" AS ENUM ('PRODUCT_DESIGNER', 'UX_DESIGNER', 'UI_DESIGNER', 'COMMUNICATION_DESIGNER', 'UX_RESEARCHER', 'DESIGN_LEAD', 'ART_DIRECTOR', 'BRAND_DESIGNER', 'MOTION_DESIGNER', 'OTHER');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('JUNIOR', 'MIDDLE', 'MIDDLE_PLUS', 'SENIOR', 'SENIOR_PLUS', 'LEAD', 'HEAD');

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('B2B', 'B2C', 'BOTH');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'PARSED', 'PORTFOLIO_ANALYZED', 'ACTIVE', 'IN_PROCESS', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'PAUSED', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT');

-- CreateEnum
CREATE TYPE "WorkFormat" AS ENUM ('REMOTE', 'HYBRID', 'OFFICE');

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('GOOD', 'BAD', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "ShortlistStatus" AS ENUM ('PENDING', 'CONTACTED', 'INTERESTED', 'NOT_INTERESTED', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CandidateRole" NOT NULL,
    "grade" "Grade" NOT NULL,
    "yearsOfExperience" INTEGER,
    "specializations" TEXT[],
    "domains" TEXT[],
    "segment" "Segment",
    "platforms" TEXT[],
    "skills" TEXT[],
    "tools" TEXT[],
    "location" TEXT,
    "timezone" TEXT,
    "languages" JSONB,
    "salaryExpectations" TEXT,
    "education" TEXT,
    "hasBigtechExperience" BOOLEAN NOT NULL DEFAULT false,
    "hasStudioExperience" BOOLEAN NOT NULL DEFAULT false,
    "hasInternationalExperience" BOOLEAN NOT NULL DEFAULT false,
    "aiSummary" TEXT,
    "aiStrengths" TEXT[],
    "aiConcerns" TEXT[],
    "aiConfidenceScore" INTEGER,
    "systemThinking" INTEGER,
    "productMaturity" INTEGER,
    "visualStrength" INTEGER,
    "uxStrength" INTEGER,
    "argumentationQuality" INTEGER,
    "metricsImpact" INTEGER,
    "researchDepth" INTEGER,
    "telegramContact" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "resumeFileUrl" TEXT,
    "resumeRawText" TEXT,
    "portfolioLinks" TEXT[],
    "portfolioAnalysis" JSONB,
    "manualOverrides" JSONB,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "duration" TEXT,
    "keyAchievements" TEXT[],
    "isBigtech" BOOLEAN NOT NULL DEFAULT false,
    "isStudio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateNote" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "status" "VacancyStatus" NOT NULL DEFAULT 'OPEN',
    "clientName" TEXT,
    "clientLead" TEXT,
    "productDescription" TEXT,
    "reasonForHiring" TEXT,
    "role" "CandidateRole" NOT NULL,
    "grade" "Grade" NOT NULL,
    "designersNeeded" INTEGER NOT NULL DEFAULT 1,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "workFormat" "WorkFormat" NOT NULL DEFAULT 'REMOTE',
    "location" TEXT,
    "timezone" TEXT,
    "salaryRange" TEXT,
    "desiredStartDate" TEXT,
    "duration" TEXT,
    "keyTasks" TEXT[],
    "requiredSkills" TEXT[],
    "niceToHaveSkills" TEXT[],
    "preferredDomains" TEXT[],
    "requiredTools" TEXT[],
    "needsInternational" BOOLEAN NOT NULL DEFAULT false,
    "specialCompetencies" TEXT[],
    "redFlags" TEXT[],
    "portfolioReferences" TEXT[],
    "teamComposition" TEXT,
    "decisionMaker" TEXT,
    "hiringStages" INTEGER,
    "testTask" TEXT,
    "scoringCriteria" JSONB,
    "clientNotes" TEXT,
    "internalNotes" TEXT,
    "clientPriorities" JSONB,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
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
    "manualScoreOverride" INTEGER,
    "humanFeedback" TEXT,
    "feedbackRating" "FeedbackRating",

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortlistEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candidateId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ShortlistStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ShortlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_candidateId_vacancyId_key" ON "MatchResult"("candidateId", "vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistEntry_candidateId_vacancyId_key" ON "ShortlistEntry"("candidateId", "vacancyId");

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateNote" ADD CONSTRAINT "CandidateNote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
