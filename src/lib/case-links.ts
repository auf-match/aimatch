/**
 * Умный отбор ссылок на кейсы из портфолио.
 *
 * Проблема: раньше брали первые 3 внутренние ссылки в порядке DOM — туда часто
 * попадали служебные страницы (About/Contacts/Home), а сильные кейсы ниже по
 * странице терялись. Здесь — чистая функция, которая отсеивает служебное,
 * ранжирует «похожее на кейс» и возвращает топ-N.
 *
 * Чистая и детерминированная — покрыта юнит-тестами, без сети/DOM.
 */

export interface LinkCandidate {
  /** Абсолютный URL ссылки. */
  href: string;
  /** Текст ссылки (для сигнала «описательный заголовок кейса»). */
  text: string;
  /** Ссылка внутри header/nav/footer/aside — навигация, не контент. */
  nav: boolean;
}

// Служебные/не-кейсовые страницы — по сегменту пути или тексту ссылки.
const UTILITY =
  /(^|[/\-_ ])(about(-me|-us)?|bio|contacts?|home|index|resume|cv|blog|news|feed|pricing|prices?|login|log-in|sign-?in|sign-?up|register|privacy|terms|imprint|legal|cookies?|search|tags?|category|categories|archive|shop|store|cart|checkout|faq|services?|team|clients?|testimonials?|subscribe|newsletter)([/\-_ .?]|$)/i;

// Файлы-ассеты — не страницы кейсов.
const ASSET_EXT =
  /\.(pdf|zip|rar|7z|png|jpe?g|gif|svg|webp|avif|mp4|mov|webm|doc|docx|ppt|pptx|xls|xlsx)(\?|#|$)/i;

// Явные маркеры кейса в пути (личные сайты + Behance/Dribbble).
const CASE_PATH =
  /\/(projects?|case|case-stud(?:y|ies)|works?|gallery|shots?|portfolio|showcase)(?:\/|$)/i;

function lastSegment(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** «Слаг-подобный» сегмент: длинный, со словами/цифрами/дефисами — как у кейса. */
function isSlugLike(seg: string): boolean {
  if (seg.length < 6) return false;
  if (/-/.test(seg)) return true; // my-fintech-redesign, Redesign-a1b2c3
  if (/\d{3,}/.test(seg)) return true; // behance /gallery/123456/...
  if (/[a-f0-9]{12,}/i.test(seg)) return true; // notion hash
  return false;
}

/** Нормализация для дедупликации: без хеша, без завершающего слэша, lowercase host. */
function normalizeForDedup(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    let p = u.pathname.replace(/\/+$/, "");
    if (p === "") p = "/";
    return `${u.protocol}//${u.host.toLowerCase()}${p}${u.search}`;
  } catch {
    return href;
  }
}

function scoreLink(c: LinkCandidate, basePath: string): number {
  let url: URL;
  try {
    url = new URL(c.href);
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
  const path = url.pathname;
  const seg = lastSegment(path);
  const text = (c.text || "").trim();
  const utilityHit = UTILITY.test(path) || UTILITY.test(text);
  const caseHit = CASE_PATH.test(path);

  // Служебная страница без явных признаков кейса — выкидываем жёстко.
  if (utilityHit && !caseHit) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (caseHit) score += 3;
  if (isSlugLike(seg)) score += 2;
  if (text.length >= 12) score += 2; // описательный заголовок кейса
  else if (text.length > 0 && text.length <= 3) score -= 1; // «→», «01» и т.п.
  if (c.nav) score -= 2; // из навигации/футера
  // Глубина пути: кейсы обычно на 1–2 уровня глубже, а не в корне.
  const depth = path.split("/").filter(Boolean).length;
  if (depth >= 1) score += 1;

  return score;
}

/**
 * Выбирает до `limit` наиболее «кейсовых» ссылок.
 * Никогда не работает хуже старого поведения: если после фильтра ничего не
 * осталось, возвращает исходные (не-ассеты) ссылки в DOM-порядке.
 */
export function selectCaseLinks(
  candidates: LinkCandidate[],
  baseUrl: string,
  limit = 5,
): string[] {
  let basePath = "/";
  try {
    basePath = new URL(baseUrl).pathname.replace(/\/+$/, "") || "/";
  } catch {
    /* ignore */
  }

  // Дедуп по нормализованному URL, отбрасываем ассеты и ссылку на саму себя.
  const seen = new Set<string>();
  const cleaned: { c: LinkCandidate; order: number }[] = [];
  candidates.forEach((c, order) => {
    if (!c || typeof c.href !== "string") return;
    if (ASSET_EXT.test(c.href)) return;
    let path = "";
    try {
      path = new URL(c.href).pathname.replace(/\/+$/, "") || "/";
    } catch {
      return; // невалидный URL
    }
    if (path === basePath) return; // ссылка на текущую страницу
    const key = normalizeForDedup(c.href);
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push({ c, order });
  });

  // Считаем скор; стабильная сортировка: скор ↓, при равенстве — DOM-порядок ↑.
  const scored = cleaned
    .map(({ c, order }) => ({ href: c.href, score: scoreLink(c, basePath), order }))
    .filter((x) => x.score > Number.NEGATIVE_INFINITY)
    .sort((a, b) => (b.score - a.score) || (a.order - b.order));

  if (scored.length > 0) {
    return scored.slice(0, limit).map((x) => x.href);
  }

  // Фолбэк — не хуже прежнего: не-ассеты в DOM-порядке (уже без дублей).
  return cleaned.slice(0, limit).map(({ c }) => c.href);
}
