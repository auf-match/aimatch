/**
 * Парсинг выгрузки Huntflow (ATS) в строки для импорта кандидатов.
 * Чистая логика, без I/O — покрыта юнит-тестами.
 *
 * Ссылки на портфолио лежат внутри текста резюме (externals[].data.body),
 * вперемешку с соцсетями, облачными дисками и ссылками на работодателей.
 * Достаём их allowlist'ом известных портфолио-платформ: перечислить все
 * домены-помехи в denylist невозможно, а allowlist даёт чистый результат.
 */

import type { CandidateImportRow } from "./import-types";

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

export interface HuntflowExternal {
  data?: {
    body?: string;
    city?: string;
    area?: { name?: string } | null;
  } | null;
}

export interface HuntflowApplicant {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  email?: string;
  account_source?: unknown;
  externals?: (HuntflowExternal | null)[];
  [k: string]: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Детектор формата. Одного `items` мало — другая выгрузка тоже может иметь
 * такое поле. Проверяем маркерные поля Huntflow на первом элементе.
 */
export function isHuntflowExport(json: unknown): boolean {
  if (!isRecord(json)) return false;
  const items = json.items;
  if (!Array.isArray(items)) return false;
  // Пустой items считаем Huntflow-выгрузкой: иначе роут уйдёт в Behance-ветку
  // и на структурно валидном файле Huntflow выдаст «не найдено профилей Behance».
  if (items.length === 0) return true;
  const first = items[0];
  if (!isRecord(first)) return false;
  return "externals" in first || "account_source" in first;
}

export function extractHuntflowApplicants(json: unknown): HuntflowApplicant[] {
  if (!isHuntflowExport(json)) return [];
  return (json as { items: HuntflowApplicant[] }).items;
}

function applicantName(a: HuntflowApplicant): string {
  return [a.first_name, a.last_name]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

function resumeBody(a: HuntflowApplicant): string {
  return (a.externals ?? [])
    .map((e) => e?.data?.body)
    .filter((b): b is string => typeof b === "string" && b.length > 0)
    .join("\n");
}

function applicantLocation(a: HuntflowApplicant): string | undefined {
  for (const e of a.externals ?? []) {
    const name = e?.data?.area?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  for (const e of a.externals ?? []) {
    const city = e?.data?.city;
    if (typeof city === "string" && city.trim()) return city.trim();
  }
  return undefined;
}

function applicantEmail(a: HuntflowApplicant): string | undefined {
  const email = typeof a.email === "string" ? a.email.trim() : "";
  if (!email) return undefined;
  // office@huntflow.ru — служебный адрес системы, не кандидата
  if (/@huntflow\.ru$/i.test(email)) return undefined;
  return email;
}

/**
 * Маппит applicant в строку импорта.
 * null — если нет имени или нет ни одной ссылки на портфолио
 * (людей без портфолио не импортируем, см. спеку).
 */
export function mapApplicantToCandidate(
  a: HuntflowApplicant,
): CandidateImportRow | null {
  const name = applicantName(a);
  if (!name) return null;

  const { portfolioLinks, telegram, linkedin } = classifyUrls(
    extractUrls(resumeBody(a)),
  );
  if (portfolioLinks.length === 0) return null;

  return {
    name,
    portfolioLinks,
    location: applicantLocation(a),
    telegramContact: telegram,
    email: applicantEmail(a),
    linkedinUrl: linkedin,
    role: "OTHER",
    grade: "MIDDLE",
    status: "NEW",
    source: "huntflow",
  };
}
