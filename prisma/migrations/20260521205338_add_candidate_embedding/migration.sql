-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "embedding" DOUBLE PRECISION[],
ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "embeddingText" TEXT,
ADD COLUMN     "embeddingUpdatedAt" TIMESTAMP(3);
