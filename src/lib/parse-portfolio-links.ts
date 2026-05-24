/**
 * Нормализует и дедуплицирует список портфолио-ссылок.
 * - Обрезает пробелы
 * - Отсеивает пустые строки
 * - Отсеивает невалидные URL (принимает только http/https)
 * - Нормализует: trailing slash, регистр домена
 * - Дедуплицирует
 */
export function parsePortfolioLinks(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      continue; // невалидный URL
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") continue;

    // Нормализация: lowercase hostname, убрать trailing slash из pathname
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.endsWith("/") && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1);
    }

    const normalized = url.toString();
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
