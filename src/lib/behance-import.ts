/**
 * Парсинг выгрузки профилей Behance (JSON) в строки для импорта кандидатов.
 * Чистая логика, без I/O — покрыта юнит-тестами.
 */

import type { CandidateImportRow } from "./import-types";

export interface BehanceProfile {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  url?: string;
  website?: string;
  company?: string;
  location?: string;
  city?: string;
  country?: string;
  [k: string]: unknown;
}

function isBehanceProfileUrl(v: unknown): v is string {
  return typeof v === "string" && v.includes("behance.net/");
}

function profileName(p: BehanceProfile): string {
  const display = typeof p.display_name === "string" ? p.display_name.trim() : "";
  if (display) return display;
  const composed = [p.first_name, p.last_name]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return composed;
}

function looksLikeProfile(v: unknown): v is BehanceProfile {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as BehanceProfile;
  return isBehanceProfileUrl(p.url) && profileName(p).length > 0;
}

/** Рекурсивно обходит произвольную вложенность и собирает профили Behance. */
export function extractBehanceProfiles(json: unknown): BehanceProfile[] {
  const out: BehanceProfile[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      if (looksLikeProfile(node)) {
        out.push(node as BehanceProfile);
        return; // внутрь найденного профиля не спускаемся
      }
      for (const v of Object.values(node as Record<string, unknown>)) walk(v);
    }
  };
  walk(json);
  return out;
}

function isTelegram(url: string): boolean {
  return /(^|\/\/)(t\.me)\//.test(url);
}

function looksLikeEmail(v: string): boolean {
  const s = v.trim();
  return s.includes("@") && s.includes(".") && !/\s/.test(s);
}

/** Маппит профиль в строку импорта. null — если нет имени или behance-url. */
export function mapProfileToCandidate(p: BehanceProfile): CandidateImportRow | null {
  const name = profileName(p);
  const url = p.url;
  if (!name || !isBehanceProfileUrl(url)) return null;

  const portfolioLinks: string[] = [url];
  let telegramContact: string | undefined;

  const website = typeof p.website === "string" ? p.website.trim() : "";
  if (website) {
    if (isTelegram(website)) telegramContact = website;
    else portfolioLinks.push(website);
  }

  const location =
    (typeof p.location === "string" && p.location.trim()) ||
    [p.city, p.country]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .join(", ") ||
    undefined;

  const company = typeof p.company === "string" ? p.company.trim() : "";
  const email = company && looksLikeEmail(company) ? company : undefined;

  return {
    name,
    portfolioLinks,
    location: location || undefined,
    telegramContact,
    email,
    role: "OTHER",
    grade: "MIDDLE",
    status: "NEW",
    source: "behance",
  };
}

/**
 * Behance на удалённом профиле отдаёт 200 со страницей-заглушкой; скрейпер
 * этого не замечает и возвращает мусор. Ловим по заголовку, чтобы не платить AI.
 */
export function isDeadBehancePage(title: string): boolean {
  const t = (title ?? "").toLowerCase();
  if (!t) return false;
  return (
    t.includes("не удалось найти эту страницу") ||
    t.includes("page not found") ||
    t.includes("страница не найдена")
  );
}
