import { PrismaClient } from "@prisma/client";
import { mapShortlistStatusToStage } from "../src/lib/pipeline";

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.shortlistEntry.findMany();
  console.log(`Найдено ShortlistEntry: ${entries.length}`);

  let created = 0;
  for (const e of entries) {
    const stage = mapShortlistStatusToStage(e.status);

    // Идемпотентно: пропускаем, если Pipeline уже есть
    const existing = await prisma.pipeline.findUnique({
      where: { candidateId_vacancyId: { candidateId: e.candidateId, vacancyId: e.vacancyId } },
    });
    if (existing) continue;

    await prisma.pipeline.create({
      data: {
        candidateId: e.candidateId,
        vacancyId: e.vacancyId,
        stage,
        notes: e.notes,
        transitions: {
          create: { fromStage: null, toStage: stage, actor: e.addedBy || "Система" },
        },
      },
    });
    created++;
  }
  console.log(`Создано Pipeline: ${created}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
