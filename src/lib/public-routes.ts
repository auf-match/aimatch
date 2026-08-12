/**
 * Какие маршруты особенные — и в чём именно.
 *
 * Здесь ДВА независимых списка, и путать их опасно:
 *
 *   isPublicRoute      — не требует пароля. Открыто всему интернету.
 *   isChromelessRoute  — рисуется без сайдбара приложения.
 *
 * Публичная форма — и то, и другое. А её прототип живёт внутри приложения:
 * выглядит без сайдбара, но пароль спрашивает, иначе черновики страниц
 * утекали бы наружу вместе с рабочими.
 *
 * Общий модуль нужен, чтобы middleware и лейаут не разъехались: список
 * открытых наружу адресов — самое опасное место во всей затее, и он должен
 * быть в одном экземпляре, под тестами.
 */

/** Адреса без пароля. Добавлять сюда — значит открыть страницу миру. */
const PUBLIC_PREFIXES = ["/p/"] as const;

/** Адреса без сайдбара: всё публичное плюс его прототип. */
const CHROMELESS_EXACT = ["/prototype/public-portfolio"] as const;

function normalize(pathname: string): string {
  if (!pathname) return "/";
  // Хвостовой слэш не должен менять решение: /p/portfolio и /p/portfolio/
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return trimmed || "/";
}

export function isPublicRoute(pathname: string): boolean {
  const path = normalize(pathname);
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix),
  );
}

export function isChromelessRoute(pathname: string): boolean {
  const path = normalize(pathname);
  if (isPublicRoute(path)) return true;
  return CHROMELESS_EXACT.some((exact) => path === exact);
}
