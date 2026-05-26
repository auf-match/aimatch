import type { PipelineStage } from "@prisma/client";
import { prisma } from "@/server/db";

/**
 * Идемпотентно создаёт запись Pipeline на этапе DL_APPROVED при одобрении ДЛ.
 * Если запись уже есть — возвращает её без изменений и без нового перехода.
 */
export async function approveToVacancy(
  candidateId: string,
  vacancyId: string,
  actor: string,
) {
  const existing = await prisma.pipeline.findUnique({
    where: { candidateId_vacancyId: { candidateId, vacancyId } },
  });
  if (existing) return existing;

  return prisma.pipeline.create({
    data: {
      candidateId,
      vacancyId,
      stage: "DL_APPROVED",
      transitions: {
        create: { fromStage: null, toStage: "DL_APPROVED", actor: actor || "Система" },
      },
    },
  });
}

/**
 * Перемещает кандидата на новый этап по вакансии и пишет переход в историю.
 * Бросает Error("NOT_FOUND"), если записи нет (создание — только через approveToVacancy).
 */
export async function movePipelineStage(
  candidateId: string,
  vacancyId: string,
  toStage: PipelineStage,
  actor: string,
  note?: string,
) {
  const existing = await prisma.pipeline.findUnique({
    where: { candidateId_vacancyId: { candidateId, vacancyId } },
  });
  if (!existing) throw new Error("NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.pipeline.update({
      where: { id: existing.id },
      data: { stage: toStage },
    });
    await tx.stageTransition.create({
      data: {
        pipelineId: existing.id,
        fromStage: existing.stage,
        toStage,
        actor: actor || "Система",
        note: note || null,
      },
    });
    return updated;
  });
}
