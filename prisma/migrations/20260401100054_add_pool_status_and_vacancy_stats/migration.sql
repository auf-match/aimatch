-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('NEW', 'REVIEWED', 'APPROVED', 'REJECTED_MANUAL', 'MAYBE');

-- AlterTable
ALTER TABLE "ScreeningResult" ADD COLUMN     "poolStatus" "PoolStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT;

-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN     "afterAiScreening" INTEGER,
ADD COLUMN     "afterHardFilter" INTEGER,
ADD COLUMN     "lastScreeningAt" TIMESTAMP(3),
ADD COLUMN     "totalCandidates" INTEGER;
