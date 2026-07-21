/**
 * In-memory трекер «кто сейчас в обработке AI-анализом».
 *
 * Временный инструмент для мониторинга большого прогона. Живёт в памяти
 * процесса (проект — один долгоживущий Node-процесс на VPS). При перезапуске
 * сервера список пустеет — это приемлемо, БД-данные (ошибки/очередь) не теряются.
 *
 * Map кладём в globalThis, чтобы hot-reload в dev не сбрасывал состояние
 * посреди прогона (стандартный Next.js-приём; образца в проекте нет).
 */

export interface ProcessingEntry {
  id: string;
  name: string;
  portfolioLink: string;
  startedAt: number; // Date.now()
}

declare global {
  // eslint-disable-next-line no-var
  var __analysisTracker: Map<string, ProcessingEntry> | undefined;
}

const processing: Map<string, ProcessingEntry> =
  (globalThis.__analysisTracker ??= new Map<string, ProcessingEntry>());

export function markStarted(entry: ProcessingEntry): void {
  processing.set(entry.id, entry);
}

export function markFinished(id: string): void {
  processing.delete(id);
}

/** Снимок, отсортированный по времени старта (раньше — выше). */
export function getProcessing(): ProcessingEntry[] {
  return [...processing.values()].sort((a, b) => a.startedAt - b.startedAt);
}
