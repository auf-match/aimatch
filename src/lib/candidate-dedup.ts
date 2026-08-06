/**
 * Канонический ключ для дедупликации кандидатов по ссылке на портфолио.
 *
 * Приводит URL к форме host+path без схемы/www/хвостового слэша, чтобы
 * https://www.behance.net/john/ и behance.net/john считались одним профилем.
 * Применяется к ОБЕИМ сторонам сравнения (и к входящим, и к тем, что в базе).
 *
 * Чистая функция — покрыта юнит-тестами.
 */
export function dedupKey(url: string): string {
  const stripped = url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
  const slashIndex = stripped.indexOf("/");
  const host = (slashIndex === -1 ? stripped : stripped.slice(0, slashIndex)).toLowerCase();
  const path = slashIndex === -1 ? "" : stripped.slice(slashIndex);
  return host + path;
}
