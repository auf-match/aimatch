/**
 * Парсинг выгрузки Huntflow (ATS) в строки для импорта кандидатов.
 * Чистая логика, без I/O — покрыта юнит-тестами.
 *
 * Ссылки на портфолио лежат внутри текста резюме (externals[].data.body),
 * вперемешку с соцсетями, облачными дисками и ссылками на работодателей.
 * Достаём их allowlist'ом известных портфолио-платформ: перечислить все
 * домены-помехи в denylist невозможно, а allowlist даёт чистый результат.
 */

const URL_RE = /https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&()*+,;=%']+/g;

/**
 * Хосты, где портфолио всегда лежит В ПУТИ, а корень — главная страница
 * платформы. Пустой путь у них отбрасывается.
 */
const EXACT_PORTFOLIO_HOSTS: RegExp[] = [
  /^behance\.net$/,
  /^dribbble\.com$/,
  /^readymag\.com$/,
  /^readymag\.website$/,
  /^notion\.so$/,
  /^figma\.com$/,
  /^designer\.ru$/,
  /^dprofile\.ru$/,
  /^buildin\.ai$/,
  /^setka\.ru$/,
  /^lookzine\.com$/,
  /^hsedesign\.ru$/,
  /^coroflot\.com$/,
  /^artstation\.com$/,
  /^cargocollective\.com$/,
];

/**
 * Конструкторы сайтов, где портфолио — САМ ПОДДОМЕН.
 * Пустой путь здесь легитимен и встречается массово: у framer.website
 * 219 из 232 ссылок — голый корень. Отбрасывать их нельзя.
 */
const SUBDOMAIN_PORTFOLIO_HOSTS: RegExp[] = [
  /\.notion\.site$/,
  /\.tilda\.(ws|cc|ru)$/,
  /\.super\.site$/,
  /\.framer\.(website|ai|app)$/,
  /\.webflow\.io$/,
  /\.myportfolio\.com$/,
  /\.github\.io$/,
];

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isExactPortfolioHost(host: string): boolean {
  return EXACT_PORTFOLIO_HOSTS.some((re) => re.test(host));
}

function isSubdomainPortfolioHost(host: string): boolean {
  return SUBDOMAIN_PORTFOLIO_HOSTS.some((re) => re.test(host));
}

/** Тир сортировки: меньше — содержательнее. Скрейпится portfolioLinks[0]. */
function portfolioRank(host: string): number {
  if (host === "behance.net") return 0;
  if (host === "dribbble.com") return 1;
  // Figma последняя: обычно один файл или прототип, а не портфолио целиком.
  if (host === "figma.com") return 3;
  return 2;
}

/** Достаёт все URL из произвольного текста. */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  return text.match(URL_RE) ?? [];
}

export interface ClassifiedUrls {
  portfolioLinks: string[];
  telegram?: string;
  linkedin?: string;
}

/**
 * Классифицирует и нормализует ссылки из текста резюме.
 * Канонизация (https, без www, без хвостового слэша) нужна для дедупа:
 * в резюме одна и та же ссылка встречается в разных формах.
 */
export function classifyUrls(urls: string[]): ClassifiedUrls {
  const portfolio: Array<{ url: string; rank: number }> = [];
  const seen = new Set<string>();
  let telegram: string | undefined;
  let linkedin: string | undefined;

  for (const raw of urls) {
    const trimmed = raw.replace(/[.,;:]+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue; // битый URL — молча пропускаем, запись не роняем
    }

    const host = normalizeHost(parsed.hostname);
    if (!host) continue;
    const path = parsed.pathname.replace(/\/+$/, "");

    if (host === "t.me") {
      telegram ??= `https://${host}${path}`;
      continue;
    }
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      linkedin ??= `https://${host}${path}`;
      continue;
    }

    const exact = isExactPortfolioHost(host);
    if (!exact && !isSubdomainPortfolioHost(host)) continue;

    let finalPath = path;

    // Behance: вкладки профиля (/projects, /resume, /moodboards, /info,
    // /appreciated) режем до профиля — скрейпить надо портфолио, а не вкладку.
    // /gallery/... — отдельный проект, корень профиля из него не вывести.
    if (host === "behance.net") {
      const seg = finalPath.split("/").filter(Boolean);
      if (seg.length > 0 && seg[0] !== "gallery") finalPath = `/${seg[0]}`;
    }

    // Пустой путь отбрасываем ТОЛЬКО у exact-хостов (там это главная страница
    // платформы). У поддоменов-конструкторов корень и ЕСТЬ портфолио.
    if (finalPath === "" && exact) continue;

    const clean = `https://${host}${finalPath}`;
    if (seen.has(clean)) continue;
    seen.add(clean);
    portfolio.push({ url: clean, rank: portfolioRank(host) });
  }

  // Стабильная сортировка: при равном тире сохраняется порядок из резюме.
  const portfolioLinks = portfolio
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.url);

  return { portfolioLinks, telegram, linkedin };
}
