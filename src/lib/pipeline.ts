import type { PipelineStage, TriageStatus, ShortlistStatus } from "@prisma/client";

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "DL_APPROVED",
  "IN_CLIENT_SELECTION",
  "REHEARSAL",
  "CLIENT_INTERVIEW",
  "TEST_TASK",
  "OFFER",
  "REJECTED",
  "HIRED",
];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  DL_APPROVED: "Одобрен ДЛ",
  IN_CLIENT_SELECTION: "В подборке для клиента",
  REHEARSAL: "Репетиция",
  CLIENT_INTERVIEW: "Интервью с клиентом",
  TEST_TASK: "Тестовое задание",
  OFFER: "Оффер",
  REJECTED: "Отказ",
  HIRED: "Нанят",
};

export const PIPELINE_STAGE_COLORS: Record<PipelineStage, string> = {
  DL_APPROVED: "#0d9488",
  IN_CLIENT_SELECTION: "#4338ca",
  REHEARSAL: "#1d4ed8",
  CLIENT_INTERVIEW: "#0891b2",
  TEST_TASK: "#0284c7",
  OFFER: "#e11d48",
  REJECTED: "#3f3f46",
  HIRED: "#059669",
};

export const TRIAGE_STATUS_ORDER: TriageStatus[] = [
  "NEW",
  "NEEDS_CLARIFICATION",
  "CLARIFYING",
  "BASE",
];

export const TRIAGE_STATUS_LABELS: Record<TriageStatus, string> = {
  NEW: "Новый",
  NEEDS_CLARIFICATION: "Нужны уточнения",
  CLARIFYING: "На уточнении",
  BASE: "База",
};

export const TRIAGE_STATUS_COLORS: Record<TriageStatus, string> = {
  NEW: "#3f3f46",
  NEEDS_CLARIFICATION: "#ea580c",
  CLARIFYING: "#d97706",
  BASE: "#0d9488",
};

/** Целое число полных дней между моментом и now (округление вниз, 0 для сегодня). */
export function daysInStage(since: Date, now: Date): number {
  const ms = now.getTime() - since.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Группирует записи по этапу; все этапы присутствуют в каноническом порядке. */
export function groupPipelineByStage<T extends { stage: PipelineStage }>(
  entries: T[],
): Record<PipelineStage, T[]> {
  const grouped = {} as Record<PipelineStage, T[]>;
  for (const stage of PIPELINE_STAGE_ORDER) grouped[stage] = [];
  for (const entry of entries) grouped[entry.stage].push(entry);
  return grouped;
}

/** Маппинг старого ShortlistStatus в PipelineStage (для миграции данных). */
export function mapShortlistStatusToStage(status: ShortlistStatus): PipelineStage {
  switch (status) {
    case "PENDING":
    case "CONTACTED":
    case "INTERESTED":
      return "DL_APPROVED";
    case "NOT_INTERESTED":
    case "REJECTED":
      return "REJECTED";
    case "INTERVIEWING":
      return "CLIENT_INTERVIEW";
    case "OFFERED":
      return "OFFER";
    case "HIRED":
      return "HIRED";
  }
}
