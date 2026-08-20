/**
 * Какой пункт сайдбара подсвечивать для текущего адреса.
 *
 * Правило одно: побеждает самое длинное совпадение по началу пути, и
 * побеждает оно ровно один раз на весь сайдбар. Иначе на странице
 * /candidates/upload подсвечиваются сразу два пункта — «Кандидаты» по
 * началу пути и «Новый кандидат» точным совпадением, — и непонятно,
 * где ты находишься.
 *
 * Считать надо по ВСЕМ пунктам сразу, включая быстрые действия: если
 * сравнивать только внутри своей группы, каждая группа найдёт себе
 * победителя и подсветок снова будет две.
 */

/** Корень совпадает только сам с собой: иначе он подходит под любой путь. */
function matches(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  // Только по границе сегмента: /vacancies не должен подсвечиваться
  // на /vacancies-archive.
  return pathname.startsWith(href.endsWith("/") ? href : `${href}/`);
}

/**
 * Возвращает href пункта, который нужно подсветить, или null.
 * @param hrefs все адреса сайдбара — и навигация, и быстрые действия
 */
export function activeHref(hrefs: string[], pathname: string): string | null {
  const hit = hrefs
    .filter((href) => matches(href, pathname))
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
}
