/**
 * Общие типы для импорта кандидатов из внешних выгрузок.
 * Используются и Behance-парсером, и Huntflow-парсером, и API-роутами.
 */

/** Источники, которые заводит импорт. Порционный анализ выбирает кандидатов по ним. */
export const IMPORT_SOURCES = ["behance", "huntflow"] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

export interface CandidateImportRow {
  name: string;
  portfolioLinks: string[];
  location?: string;
  telegramContact?: string;
  email?: string;
  linkedinUrl?: string;
  role: "OTHER";
  grade: "MIDDLE";
  status: "NEW";
  source: ImportSource;
}
