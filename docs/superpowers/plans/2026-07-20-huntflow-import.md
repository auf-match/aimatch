# Импорт из выгрузки Huntflow — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять охват импорта со 144 до ~2230 кандидатов, научив систему читать выгрузку Huntflow (ATS) — вытаскивать ссылки на портфолио из текста резюме, а не искать `behance.net` в поле `url`.

**Architecture:** Новый чистый парсер `huntflow-import.ts` (allowlist портфолио-хостов + нормализация URL + ранжирование), покрытый Vitest. Общий тип `CandidateImportRow` выносится в отдельный модуль и расширяется (`source` — union, добавляется `linkedinUrl`). Роут импорта авто-детектит формат и выбирает парсер; логика дедупа и заливки остаётся общей. Пайплайн AI-анализа не меняется.

**Tech Stack:** Next.js 15 (App Router, route handlers), Prisma + PostgreSQL, TypeScript, Vitest. Спека: `docs/superpowers/specs/2026-07-20-huntflow-import-design.md`.

---

## Карта файлов

**Создаются:**
- `src/lib/import-types.ts` — общие `ImportSource`, `IMPORT_SOURCES`, `CandidateImportRow`. Один источник истины для обоих парсеров и API-роутов.
- `src/lib/huntflow-import.ts` — парсер Huntflow: детектор формата, извлечение, классификация URL, маппинг.
- `src/lib/huntflow-import.test.ts` — Vitest.

**Изменяются:**
- `src/lib/behance-import.ts` — локальный `CandidateImportRow` заменяется импортом из `import-types`.
- `src/app/api/candidates/import-json/route.ts` — авто-детект формата, дедуп с учётом `www`-варианта.
- `src/app/api/candidates/analyze-batch/route.ts` — фильтр `source` → `IMPORT_SOURCES`.
- `src/app/api/candidates/analyze-batch/status/route.ts` — то же (фильтр там **дважды**).
- `src/app/candidates/upload/import-json-block.tsx` — текст описания.

**Не трогаем:** `src/server/services/candidate-analysis.ts`, схему Prisma, эмбеддинги, матчинг.

**Тестовые данные:** реальный файл лежит в `scripts/data/applicants.json` (94 МБ, в `.gitignore`). Используется только для финальной проверки, в юнит-тестах — синтетические записи.

---

## Task 1: Общий модуль типов импорта

Механическая задача: вынести тип, чтобы Huntflow-парсер мог его использовать. Сейчас `CandidateImportRow` живёт в `behance-import.ts` с литералом `source: "behance"` и без поля `linkedinUrl` — Huntflow-строка в нём не выражается.

**Files:**
- Create: `src/lib/import-types.ts`
- Modify: `src/lib/behance-import.ts`, `src/app/api/candidates/import-json/route.ts`

- [ ] **Step 1: Создать `src/lib/import-types.ts`**

```ts
/**
 * Общие типы для импорта кандидатов из внешних выгрузок.
 * Используются и Behance-парсером, и Huntflow-парсером, и API-роутами.
 */

/** Источники, которые заводит импорт. Порционный анализ выбирает кандидатов по ним. */
export const IMPORT_SOURCES = ["behance", "huntflow"] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

export interface CandidateImportRow {
  name: string;
  portfolioLinks: string[];
  location?: string;
  telegramContact?: string;
  email?: string;
  linkedinUrl?: string;
  role: "OTHER";
  grade: "MIDDLE";
  status: "NEW";
  source: ImportSource;
}
```

- [ ] **Step 2: Переключить `behance-import.ts` на общий тип**

В `src/lib/behance-import.ts` удалить локальное объявление `export interface CandidateImportRow { ... }` (строки ~19-29) и добавить вверху файла, после доккоммента:

```ts
import type { CandidateImportRow } from "./import-types";
```

Тело `mapProfileToCandidate` не меняется — `source: "behance"` по-прежнему присваивается (литерал входит в union).

**Ре-экспорт не добавляем.** Единственный потребитель типа — `import-json/route.ts`, его импорт переключаем сразу (следующий шаг), иначе в `behance-import.ts` останется мёртвая строка, которую потом примут за нужную.

- [ ] **Step 2a: Переключить импорт в роуте**

В `src/app/api/candidates/import-json/route.ts` (строки 3-7) убрать `type CandidateImportRow` из импорта `@/lib/behance-import` и добавить отдельной строкой:

```ts
import { extractBehanceProfiles, mapProfileToCandidate } from "@/lib/behance-import";
import type { CandidateImportRow } from "@/lib/import-types";
```

(Task 4 всё равно перепишет этот роут целиком — здесь правка минимальная, чтобы репозиторий остался зелёным после Task 1.)

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit`
Expected: без ошибок.

Run: `npx vitest run`
Expected: все существующие тесты зелёные (68 шт.).

- [ ] **Step 4: Commit**

```bash
git add src/lib/import-types.ts src/lib/behance-import.ts
git commit -m "refactor(import): общий модуль типов импорта"
```

---

## Task 2: Классификация и нормализация URL (TDD)

Ядро фичи и главный источник риска. Пишем тесты первыми.

**Files:**
- Create: `src/lib/huntflow-import.ts`, `src/lib/huntflow-import.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`src/lib/huntflow-import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyUrls } from "./huntflow-import";

describe("classifyUrls — allowlist", () => {
  it("keeps known portfolio platforms", () => {
    const r = classifyUrls([
      "https://www.behance.net/ivanov",
      "https://dribbble.com/ivanov",
      "https://ivanov.notion.site/Portfolio-123",
      "https://readymag.website/u123/456",
    ]);
    expect(r.portfolioLinks).toHaveLength(4);
  });

  it("drops noise: job boards, clouds, socials", () => {
    const r = classifyUrls([
      "https://spb.hh.ru/resume/abc",
      "https://hh.ru/resume/abc",
      "https://drive.google.com/file/d/xyz",
      "https://disk.yandex.ru/d/xyz",
      "https://www.instagram.com/ivanov",
      "https://vk.com/ivanov",
      "https://api.hh.ru/areas/1",
    ]);
    expect(r.portfolioLinks).toEqual([]);
  });

  it("matches by host, not substring", () => {
    // подстрочное совпадение по behance.net поймало бы CDN-хост
    const r = classifyUrls(["https://mir-s3-cdn-cf.behance.net/projects/img.jpg"]);
    expect(r.portfolioLinks).toEqual([]);
  });
});

describe("classifyUrls — telegram & linkedin", () => {
  it("routes t.me to telegram, not portfolio", () => {
    const r = classifyUrls(["https://t.me/ivanov"]);
    expect(r.telegram).toBe("https://t.me/ivanov");
    expect(r.portfolioLinks).toEqual([]);
  });

  it("routes linkedin to linkedin, not portfolio", () => {
    const r = classifyUrls(["https://www.linkedin.com/in/ivanov/"]);
    expect(r.linkedin).toBe("https://linkedin.com/in/ivanov");
    expect(r.portfolioLinks).toEqual([]);
  });

  it("keeps the first of each when several", () => {
    const r = classifyUrls(["https://t.me/one", "https://t.me/two"]);
    expect(r.telegram).toBe("https://t.me/one");
  });
});

describe("classifyUrls — normalization", () => {
  it("strips trailing slash and canonicalizes to https without www", () => {
    const r = classifyUrls(["http://www.behance.net/ivanov/"]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
  });

  it("strips trailing punctuation glued from resume text", () => {
    const r = classifyUrls(["https://behance.net/ivanov."]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
  });

  it("truncates behance profile tabs to the profile root", () => {
    for (const tab of ["projects", "resume", "moodboards", "info", "appreciated"]) {
      const r = classifyUrls([`https://www.behance.net/ivanov/${tab}`]);
      expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
    }
  });

  it("leaves behance gallery links alone (profile root not derivable)", () => {
    const r = classifyUrls(["https://www.behance.net/gallery/123/My-Project"]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/gallery/123/My-Project"]);
  });

  it("drops empty path for exact hosts (platform homepage, not a portfolio)", () => {
    const r = classifyUrls(["https://www.behance.net", "https://dribbble.com/"]);
    expect(r.portfolioLinks).toEqual([]);
  });

  // РЕГРЕССИЯ: правило «отбрасывать пустой путь везде» теряло 355 человек (16%).
  // У конструкторов сайтов портфолио — это сам поддомен, путь пустой.
  it("KEEPS empty path for subdomain platforms", () => {
    const r = classifyUrls([
      "https://ivanov.tilda.ws",
      "https://ivanov.framer.website/",
      "http://ivanov.webflow.io",
      "https://ivanov.super.site/",
      "https://ivanov.myportfolio.com",
    ]);
    expect(r.portfolioLinks).toHaveLength(5);
    expect(r.portfolioLinks).toContain("https://ivanov.tilda.ws");
    expect(r.portfolioLinks).toContain("https://ivanov.framer.website");
  });

  it("dedups after normalization", () => {
    const r = classifyUrls([
      "https://www.behance.net/ivanov",
      "http://behance.net/ivanov/",
      "https://behance.net/ivanov/projects",
    ]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
  });

  it("ignores malformed urls without throwing", () => {
    const r = classifyUrls(["not-a-url", "http://", "https://behance.net/ok"]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ok"]);
  });
});

describe("classifyUrls — ranking", () => {
  it("orders behance > dribbble > other platforms > figma", () => {
    const r = classifyUrls([
      "https://figma.com/file/abc",
      "https://ivanov.tilda.ws",
      "https://dribbble.com/ivanov",
      "https://behance.net/ivanov",
    ]);
    expect(r.portfolioLinks).toEqual([
      "https://behance.net/ivanov",
      "https://dribbble.com/ivanov",
      "https://ivanov.tilda.ws",
      "https://figma.com/file/abc",
    ]);
  });

  it("is stable within a tier (resume order preserved)", () => {
    const r = classifyUrls([
      "https://readymag.com/u1/a",
      "https://ivanov.notion.site/b",
      "https://designer.ru/user/1",
    ]);
    expect(r.portfolioLinks).toEqual([
      "https://readymag.com/u1/a",
      "https://ivanov.notion.site/b",
      "https://designer.ru/user/1",
    ]);
  });
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npx vitest run src/lib/huntflow-import.test.ts`
Expected: FAIL — `Failed to resolve import "./huntflow-import"`.

- [ ] **Step 3: Реализовать классификатор в `src/lib/huntflow-import.ts`**

```ts
/**
 * Парсинг выгрузки Huntflow (ATS) в строки для импорта кандидатов.
 * Чистая логика, без I/O — покрыта юнит-тестами.
 *
 * Ссылки на портфолио лежат внутри текста резюме (externals[].data.body),
 * вперемешку с соцсетями, облачными дисками и ссылками на работодателей.
 * Достаём их allowlist'ом известных портфолио-платформ: перечислить все
 * домены-помехи в denylist невозможно, а allowlist даёт чистый результат.
 */

const URL_RE = /https?:\/\/[^\s"',)<>\]]+/gi;

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
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run src/lib/huntflow-import.test.ts`
Expected: PASS, все describe зелёные.

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/lib/huntflow-import.ts src/lib/huntflow-import.test.ts
git commit -m "feat(import): классификация и нормализация URL из резюме Huntflow"
```

---

## Task 3: Детектор формата, извлечение и маппинг (TDD)

**Files:**
- Modify: `src/lib/huntflow-import.ts`, `src/lib/huntflow-import.test.ts`

- [ ] **Step 1: Дописать падающие тесты**

Добавить в `src/lib/huntflow-import.test.ts` (импорт вверху расширить):

```ts
import {
  classifyUrls,
  isHuntflowExport,
  extractHuntflowApplicants,
  mapApplicantToCandidate,
} from "./huntflow-import";

const applicant = {
  id: 30378852,
  account_source: 422647,
  first_name: "Иван",
  last_name: "Иванов",
  middle_name: "Петрович",
  position: "Product Designer",
  email: "ivan@example.com",
  phone: "+79991234567",
  externals: [
    {
      data: {
        body: [
          "Портфолио: https://www.behance.net/ivanov/projects",
          "Телеграм https://t.me/ivanov",
          "Резюме на https://spb.hh.ru/resume/abc",
          "LinkedIn https://www.linkedin.com/in/ivanov",
        ].join("\n"),
        area: { name: "Санкт-Петербург" },
      },
    },
  ],
};

describe("isHuntflowExport", () => {
  it("detects a huntflow export by marker fields", () => {
    expect(isHuntflowExport({ items: [applicant] })).toBe(true);
  });

  it("rejects a behance-shaped export", () => {
    expect(
      isHuntflowExport([{ display_name: "X", url: "https://behance.net/x" }]),
    ).toBe(false);
  });

  it("rejects an items array without huntflow markers", () => {
    expect(isHuntflowExport({ items: [{ foo: "bar" }] })).toBe(false);
  });

  // Пустой файл уходит в Huntflow-ветку намеренно: там пользователь получит
  // осмысленное сообщение, а не «не найдено профилей Behance».
  it("accepts an empty items array", () => {
    expect(isHuntflowExport({ items: [] })).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isHuntflowExport(null)).toBe(false);
    expect(isHuntflowExport({})).toBe(false);
    expect(isHuntflowExport({ items: "nope" })).toBe(false);
  });
});

describe("extractHuntflowApplicants", () => {
  it("returns items array", () => {
    expect(extractHuntflowApplicants({ items: [applicant, applicant] })).toHaveLength(2);
  });

  it("returns empty for non-huntflow input", () => {
    expect(extractHuntflowApplicants({ foo: 1 })).toEqual([]);
    expect(extractHuntflowApplicants(null)).toEqual([]);
  });
});

describe("mapApplicantToCandidate", () => {
  it("maps a full applicant", () => {
    const r = mapApplicantToCandidate(applicant)!;
    expect(r).toMatchObject({
      name: "Иван Иванов",
      portfolioLinks: ["https://behance.net/ivanov"],
      telegramContact: "https://t.me/ivanov",
      linkedinUrl: "https://linkedin.com/in/ivanov",
      email: "ivan@example.com",
      location: "Санкт-Петербург",
      role: "OTHER",
      grade: "MIDDLE",
      status: "NEW",
      source: "huntflow",
    });
  });

  it("returns null without a portfolio link", () => {
    const noPf = {
      ...applicant,
      externals: [{ data: { body: "Резюме https://hh.ru/resume/abc" } }],
    };
    expect(mapApplicantToCandidate(noPf)).toBeNull();
  });

  it("returns null without a name", () => {
    const noName = { ...applicant, first_name: "", last_name: "" };
    expect(mapApplicantToCandidate(noName)).toBeNull();
  });

  it("collects links across several externals", () => {
    const multi = {
      ...applicant,
      externals: [
        { data: { body: "https://behance.net/ivanov" } },
        { data: { body: "https://dribbble.com/ivanov" } },
      ],
    };
    expect(mapApplicantToCandidate(multi)!.portfolioLinks).toEqual([
      "https://behance.net/ivanov",
      "https://dribbble.com/ivanov",
    ]);
  });

  it("drops the huntflow placeholder email", () => {
    const r = mapApplicantToCandidate({ ...applicant, email: "office@huntflow.ru" })!;
    expect(r.email).toBeUndefined();
  });

  it("falls back from area.name to city for location", () => {
    const cityOnly = {
      ...applicant,
      externals: [{ data: { body: "https://behance.net/ivanov", city: "Тюмень" } }],
    };
    expect(mapApplicantToCandidate(cityOnly)!.location).toBe("Тюмень");
  });

  it("leaves location undefined when absent", () => {
    const noLoc = {
      ...applicant,
      externals: [{ data: { body: "https://behance.net/ivanov" } }],
    };
    expect(mapApplicantToCandidate(noLoc)!.location).toBeUndefined();
  });

  it("survives missing or malformed externals", () => {
    expect(mapApplicantToCandidate({ ...applicant, externals: [] })).toBeNull();
    expect(mapApplicantToCandidate({ ...applicant, externals: undefined })).toBeNull();
    expect(
      mapApplicantToCandidate({ ...applicant, externals: [null, { data: null }] }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run src/lib/huntflow-import.test.ts`
Expected: FAIL — `isHuntflowExport is not a function` (и соседние).

- [ ] **Step 3: Дописать реализацию в `src/lib/huntflow-import.ts`**

Добавить в начало файла (после `URL_RE` и списков хостов) типы:

```ts
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
```

И в конец файла:

```ts
import type { CandidateImportRow } from "./import-types";

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
```

**Примечание для имплементера:** `import type { CandidateImportRow }` перенести наверх файла к остальным импортам — здесь он показан рядом с использованием только для читаемости диффа.

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run src/lib/huntflow-import.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/lib/huntflow-import.ts src/lib/huntflow-import.test.ts
git commit -m "feat(import): детектор формата, извлечение и маппинг Huntflow"
```

---

## Task 4: Авто-детект формата в роуте импорта

**Files:**
- Modify: `src/app/api/candidates/import-json/route.ts`

Логика дедупа и заливки в роуте уже универсальна — она работает с `row.portfolioLinks[0]`. Меняем только выбор парсера, названия и дедуп с учётом `www`.

- [ ] **Step 1: Переписать роут**

Заменить содержимое `src/app/api/candidates/import-json/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { extractBehanceProfiles, mapProfileToCandidate } from "@/lib/behance-import";
import {
  isHuntflowExport,
  extractHuntflowApplicants,
  mapApplicantToCandidate,
} from "@/lib/huntflow-import";
import type { CandidateImportRow } from "@/lib/import-types";

export const maxDuration = 300;

/** Первая ссылка — самая содержательная (парсеры сортируют по тиру). */
function primaryUrlOf(row: CandidateImportRow): string {
  return row.portfolioLinks[0];
}

/**
 * Канонический ключ для дедупа. Huntflow-парсер отдаёт канон (https, без www,
 * без хвостового слэша), а Behance-парсер пишет URL как есть из выгрузки —
 * поэтому в базе один и тот же профиль может лежать в любой форме.
 *
 * Ключ применяется к ОБЕИМ сторонам сравнения. Перебирать варианты нельзя:
 * такой перебор односторонний (добавляет www, но не убирает) и не покрывает
 * хвостовой слэш — повторная загрузка Behance-файла после Huntflow-импорта
 * продублировала бы всех пересекающихся людей.
 */
function dedupKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
    }

    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return NextResponse.json({ error: "Не удалось разобрать файл" }, { status: 400 });
    }

    // Авто-детект формата выгрузки
    const huntflow = isHuntflowExport(json);

    let found: number;
    const mapped: CandidateImportRow[] = [];
    let skippedInvalid = 0;

    if (huntflow) {
      const applicants = extractHuntflowApplicants(json);
      found = applicants.length;
      for (const a of applicants) {
        const row = mapApplicantToCandidate(a);
        if (row) mapped.push(row);
        else skippedInvalid++;
      }
      if (mapped.length === 0) {
        return NextResponse.json(
          { error: "В выгрузке Huntflow не найдено кандидатов со ссылкой на портфолио" },
          { status: 400 },
        );
      }
    } else {
      const profiles = extractBehanceProfiles(json);
      found = profiles.length;
      if (profiles.length === 0) {
        return NextResponse.json(
          { error: "Не найдено профилей Behance в файле" },
          { status: 400 },
        );
      }
      for (const p of profiles) {
        const row = mapProfileToCandidate(p);
        if (row) mapped.push(row);
        else skippedInvalid++;
      }
    }

    // Дедуп внутри файла по каноническому ключу основной ссылки
    const seen = new Set<string>();
    const unique: CandidateImportRow[] = [];
    for (const row of mapped) {
      const key = dedupKey(primaryUrlOf(row));
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    // Дедуп против базы. Забираем ссылки всех кандидатов и сравниваем по
    // каноническому ключу: `hasSome` требует точного совпадения строк, а формы
    // в базе разные (www / http / хвостовой слэш), поэтому фильтровать запросом
    // нельзя — промахнёмся. Таблица кандидатов на порядки меньше лимитов
    // (тысячи строк, короткие массивы ссылок), разовый импорт это выдержит.
    const existing = await prisma.candidate.findMany({
      select: { portfolioLinks: true },
    });
    const existingKeys = new Set<string>();
    for (const c of existing) {
      for (const link of c.portfolioLinks) existingKeys.add(dedupKey(link));
    }
    const toCreate = unique.filter((r) => !existingKeys.has(dedupKey(primaryUrlOf(r))));
    const skippedExisting = unique.length - toCreate.length;

    // Заливка. skipDuplicates не используем: уникального индекса на portfolioLinks
    // нет, флаг был бы no-op — реальный дедуп сделан выше.
    if (toCreate.length > 0) {
      await prisma.candidate.createMany({ data: toCreate });
    }

    return NextResponse.json({
      found,
      imported: toCreate.length,
      skippedExisting,
      skippedInvalid,
    });
  } catch (error) {
    console.error("POST import-json error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit`
Expected: без ошибок.

Run: `npm run build`
Expected: успех, роут `ƒ /api/candidates/import-json` в списке.

Run: `npx vitest run`
Expected: все тесты зелёные.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/candidates/import-json/route.ts
git commit -m "feat(import): авто-детект формата выгрузки в роуте импорта"
```

---

## Task 5: Порционный анализ подхватывает Huntflow

Без этого импортированные Huntflow-кандидаты никогда не попадут в анализ: фильтр жёстко прибит к `source: "behance"`.

**Files:**
- Modify: `src/app/api/candidates/analyze-batch/route.ts`, `src/app/api/candidates/analyze-batch/status/route.ts`

- [ ] **Step 1: `analyze-batch/route.ts`**

Добавить импорт:

```ts
import { IMPORT_SOURCES } from "@/lib/import-types";
```

Заменить блок строк 23-33 целиком (вместе со **старевшим комментарием** `// source: "behance" обязателен…` — его легко забыть и оставить) на:

```ts
    // Фильтр по источникам импорта обязателен — иначе пачка захватит любых
    // прочих кандидатов со статусом NEW и перезапишет им role/grade.
    const candidates = await prisma.candidate.findMany({
      where: {
        status: "NEW",
        source: { in: [...IMPORT_SOURCES] },
        portfolioLinks: { isEmpty: false },
      },
      select: { id: true },
      take: limit,
    });
```

**Важно:** `[...IMPORT_SOURCES]` — спред обязателен, `IMPORT_SOURCES` объявлен `as const` (readonly tuple), Prisma ждёт мутабельный массив.

- [ ] **Step 2: `analyze-batch/status/route.ts`**

Фильтр здесь встречается **дважды** — заменить оба. Полное содержимое файла:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { IMPORT_SOURCES } from "@/lib/import-types";

export async function GET() {
  try {
    // Фильтры должны совпадать с выборкой в analyze-batch.
    const sources = { in: [...IMPORT_SOURCES] };
    const [pending, failed] = await Promise.all([
      prisma.candidate.count({
        where: { status: "NEW", source: sources, portfolioLinks: { isEmpty: false } },
      }),
      prisma.candidate.count({
        where: { status: "ANALYSIS_FAILED", source: sources },
      }),
    ]);
    return NextResponse.json({ pending, failed });
  } catch (error) {
    console.error("GET analyze-batch status error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit`
Expected: без ошибок.

Run: `npm run build`
Expected: успех.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/candidates/analyze-batch
git commit -m "feat(import): порционный анализ подхватывает оба источника импорта"
```

---

## Task 6: Текст блока импорта

**Files:**
- Modify: `src/app/candidates/upload/import-json-block.tsx`

- [ ] **Step 1: Заменить описание**

Найти (строки 83-86):

```tsx
        <p className="mt-1 text-[13px] text-muted-foreground">
          Выгрузка профилей Behance. Карточки создаются без AI-анализа —
          запустить его можно позже на странице кандидатов.
        </p>
```

Заменить на:

```tsx
        <p className="mt-1 text-[13px] text-muted-foreground">
          Выгрузка Huntflow или профилей Behance — формат определится
          автоматически. Карточки создаются без AI-анализа: запустить его
          можно позже на странице кандидатов.
        </p>
```

- [ ] **Step 2: Исправить строку результата**

Это не косметика. Сейчас (строки 132-137):

```tsx
        <p className="text-xs text-muted-foreground">
          Импортировано {result.imported}. Пропущено: уже в базе{" "}
          {result.skippedExisting}, без имени/ссылки {result.skippedInvalid}.
          Всего найдено {result.found}.
        </p>
```

На реальном файле это отрендерится как «**без имени/ссылки 1704**» из 3934 — читается как массовый сбой парсинга. На самом деле это здоровые записи, сознательно не импортируемые из-за отсутствия ссылки на портфолио (решение из спеки). Заменить на:

```tsx
        <p className="text-xs text-muted-foreground">
          Импортировано {result.imported}. Пропущено: {result.skippedExisting}{" "}
          уже в базе, {result.skippedInvalid} без ссылки на портфолио. Всего
          в файле: {result.found}.
        </p>
```

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/app/candidates/upload/import-json-block.tsx
git commit -m "feat(import): текст блока импорта под оба формата"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx vitest run` — все тесты зелёные (68 существующих + новые).
- [ ] `npx tsc --noEmit && npm run build` — чисто.

- [ ] **Сухой прогон парсера на реальном файле (без записи в базу).**

Это главная проверка: подтверждает охват до того, как что-то попадёт в прод-базу. Файл `scripts/data/applicants.json` (94 МБ, в `.gitignore`) должен лежать на месте.

```bash
npx tsx -e '
import { readFileSync } from "fs";
import { extractHuntflowApplicants, mapApplicantToCandidate, isHuntflowExport } from "./src/lib/huntflow-import";
const json = JSON.parse(readFileSync("scripts/data/applicants.json", "utf8"));
console.log("detected as huntflow:", isHuntflowExport(json));
const applicants = extractHuntflowApplicants(json);
const rows = applicants.map(mapApplicantToCandidate).filter(Boolean);
console.log("applicants:", applicants.length, "| mapped:", rows.length);
const multi = rows.filter((r: any) => r.portfolioLinks.length > 1).length;
console.log("with multiple links:", multi);
console.log("with telegram:", rows.filter((r: any) => r.telegramContact).length);
console.log("with linkedin:", rows.filter((r: any) => r.linkedinUrl).length);
console.log("with location:", rows.filter((r: any) => r.location).length);
console.log("sample:", rows.slice(0, 5).map((r: any) => r.name + " -> " + r.portfolioLinks[0]));
'
```

Ожидаемо (код из этого плана прогнан на реальном файле, цифры точные):
- `detected as huntflow: true`
- `applicants: 3934`, `mapped: 2230` — **если сильно меньше (напр. 1875), сломано правило пустого пути для поддоменов**
- `with multiple links: 447`
- `with linkedin: 333`, `with telegram: 112`, `with email: 471`
- `with location: 18` — **это нормально, не баг.** Локация и портфолио в этой выгрузке почти не пересекаются: всего людей с локацией 320, но у 302 из них нет ссылки на портфолио, и они не импортируются. Не ищите здесь ошибку маппинга.
- в `sample` — чистые ссылки на профили вида `https://behance.net/username`, без `hh.ru`/`drive.google.com`

- [ ] **Пилот через UI на маленьком файле.** Сделать срез из реального файла, чтобы не заливать 2230 человек сразу:

```bash
npx tsx -e '
import { readFileSync, writeFileSync } from "fs";
const j = JSON.parse(readFileSync("scripts/data/applicants.json", "utf8"));
writeFileSync("scripts/data/applicants-sample.json", JSON.stringify({ items: j.items.slice(0, 200) }));
console.log("sample written");
'
```

Затем `npm run dev` → `/candidates/upload` → блок «Импорт из JSON» → загрузить `applicants-sample.json`:
  1. Импортируется ненулевое число, `skippedInvalid` — это люди без портфолио (норма, их большинство).
  2. Повторная загрузка того же файла → `imported: 0`, всё в `skippedExisting` (дедуп работает).
  3. Загрузить старый Behance-файл, если сохранился → отрабатывает Behance-ветка (регрессии нет).

- [ ] **Проверить главное — кандидат доходит до матчинга:**
  1. `/candidates` → панель показывает «N кандидатов без AI-анализа» (Huntflow-кандидаты попали в очередь — значит `IMPORT_SOURCES` работает).
  2. Запустить пачку на 10 → дождаться.
  3. У обработанных `role`/`grade` — реальные, не `OTHER`/`MIDDLE`.
  4. Открыть вакансию с подходящей ролью, запустить матчинг, убедиться, что кандидат попадает в пул.

- [ ] **Полный прогон** — только после успешного пилота: загрузить весь `applicants.json`, затем анализировать порциями по 20 с контролем расхода AI.

---

## Известные ограничения (осознанные, вне scope)

- **`ANALYSIS_FAILED` вырастет.** Ссылки на Notion/Tilda/Figma скрейпятся хуже Behance, а `isDeadBehancePage` ловит только мёртвые страницы Behance. Ожидаем больше неудач анализа, чем на чисто Behance-базе. Чинить преждевременно — сначала нужны реальные цифры с пилота.
- **Кандидаты в статусе `PARSED`** (парсинг прошёл, оценка портфолио упала) не имеют кнопки восстановления в UI — известный пробел из предыдущей фичи, на Huntflow-объёмах их станет заметно больше.
- **Матчинг может «затопиться»** свежеимпортированными: префильтр берёт топ-50 по `updatedAt` и не исключает `status: NEW`. На 2230 записях это реально — стоит запускать матчинг после анализа, а не во время.
