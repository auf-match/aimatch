/*
  Warnings:

  - You are about to drop the `ShortlistEntry` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ShortlistEntry" DROP CONSTRAINT "ShortlistEntry_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "ShortlistEntry" DROP CONSTRAINT "ShortlistEntry_vacancyId_fkey";

-- DropTable
DROP TABLE "ShortlistEntry";

-- DropEnum
DROP TYPE "ShortlistStatus";
