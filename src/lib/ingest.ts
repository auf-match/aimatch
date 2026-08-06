/**
 * Приём кандидатов через внешний API (POST /api/candidates/ingest).
 * Чистая логика нормализации входа — покрыта юнит-тестами.
 */

/** Что присылает внешний продукт на одного кандидата (свободный, терпимый формат). */
export interface IngestInput {
  name?: unknown;
  // Ссылки: либо массив, либо одиночные url/portfolioUrl.
  portfolioLinks?: unknown;
  portfolioUrl?: unknown;
  url?: unknown;
  email?: unknown;
  telegram?: unknown;
  telegramContact?: unknown;
  linkedin?: unknown;
  linkedinUrl?: unknown;
  location?: unknown;
  source?: unknown;
}

/** Готовая строка для prisma.candidate.createMany. */
export interface IngestRow {
  name: string;
  portfolioLinks: string[];
  email?: string;
  telegramContact?: string;
  linkedinUrl?: string;
  location?: string;
  role: "OTHER";
  grade: "MIDDLE";
  status: "NEW";
  source: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function collectLinks(input: IngestInput): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = str(v);
    if (s && /^https?:\/\//i.test(s)) out.push(s);
  };
  if (Array.isArray(input.portfolioLinks)) input.portfolioLinks.forEach(push);
  push(input.portfolioUrl);
  push(input.url);
  // Уникализуем, сохраняя порядок.
  return [...new Set(out)];
}

/**
 * Нормализует один вход в строку для вставки.
 * Возвращает null, если нет имени или нет ни одной валидной ссылки на портфолио.
 */
export function normalizeIngestRow(
  input: IngestInput,
  defaultSource: string,
): IngestRow | null {
  const name = str(input.name);
  const portfolioLinks = collectLinks(input);
  if (!name || portfolioLinks.length === 0) return null;

  const email = str(input.email) || undefined;
  const telegramContact = str(input.telegramContact) || str(input.telegram) || undefined;
  const linkedinUrl = str(input.linkedinUrl) || str(input.linkedin) || undefined;
  const location = str(input.location) || undefined;
  const source = str(input.source) || defaultSource;

  return {
    name,
    portfolioLinks,
    ...(email ? { email } : {}),
    ...(telegramContact ? { telegramContact } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    ...(location ? { location } : {}),
    role: "OTHER",
    grade: "MIDDLE",
    status: "NEW",
    source,
  };
}
