/**
 * Источник кандидата («откуда пришёл»).
 *
 * - detectSourceFromUrl — авто-определение по ссылке на портфолио (при анализе).
 * - sourceLabel — нормализация значения для отображения (legacy lowercase →
 *   человекочитаемый ярлык), чтобы в списке не плодились "behance"/"Behance".
 *
 * Обе функции чистые и детерминированные — покрыты юнит-тестами.
 */

// Известные хосты → каноничный ярлык.
const HOST_LABELS: { test: RegExp; label: string }[] = [
  { test: /(^|\.)behance\.net$/i, label: "Behance" },
  { test: /(^|\.)dribbble\.com$/i, label: "Dribbble" },
  { test: /(^|\.)notion\.(so|site)$/i, label: "Notion" },
  { test: /(^|\.)figma\.com$/i, label: "Figma" },
  { test: /(^|\.)linkedin\.com$/i, label: "LinkedIn" },
  { test: /(^|\.)read\.cv$/i, label: "Read.cv" },
  { test: /(^|\.)instagram\.com$/i, label: "Instagram" },
  { test: /(^|\.)t\.me$/i, label: "Telegram" },
  { test: /(^|\.)pinterest\.[a-z.]+$/i, label: "Pinterest" },
];

/** Определяет источник по URL портфолио. Неизвестный сайт → «Личный сайт». */
export function detectSourceFromUrl(url: string): string {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./i, "");
    for (const { test, label } of HOST_LABELS) if (test.test(host)) return label;
    return "Личный сайт";
  } catch {
    return "Другое";
  }
}

// Отображаемые ярлыки для известных «машинных» значений.
const DISPLAY: Record<string, string> = {
  behance: "Behance",
  huntflow: "Huntflow",
  dribbble: "Dribbble",
  notion: "Notion",
  figma: "Figma",
  linkedin: "LinkedIn",
  manual: "Вручную",
};

/** Значение источника → ярлык для UI. Пусто → «—». */
export function sourceLabel(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "—";
  const key = raw.trim().toLowerCase();
  return DISPLAY[key] ?? raw.trim();
}

/** Нормализует список значений в уникальные ярлыки (case-insensitive), отсортированные. */
export function normalizeSourceList(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    if (!v || !v.trim()) continue;
    const label = sourceLabel(v);
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "ru"));
}
