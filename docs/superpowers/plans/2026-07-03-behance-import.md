# Импорт из Behance-JSON + порционный AI-анализ — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Залить ~2000 профилей из выгрузки Behance (JSON) в базу без AI одним действием, а полноценный AI-анализ (роль, грейд, навыки, оценки, эмбеддинг) запускать позже порциями по кнопке.

**Architecture:** Импорт — чистый парсер JSON (Vitest) + endpoint с `createMany`, заглушки `role: OTHER` / `grade: MIDDLE`, дедуп по Behance-URL. Анализ — новый сервис `analyzeImportedCandidate`, который **повторяет путь `upload`-роута** (scrape → `parseResume` → `classifyDirection` → `analyzePortfolio` → `update` + эмбеддинг), но обновляет существующего кандидата. Очередь выражается статусом `NEW`; неудачи получают новый статус `ANALYSIS_FAILED`, чтобы не попадать в следующие пачки.

**Tech Stack:** Next.js 15 (App Router, route handlers), Prisma + PostgreSQL, React 19, Tailwind v4, Vitest. Spec: `docs/superpowers/specs/2026-07-03-behance-import-design.md`.

---

## Карта файлов

**Создаются:**
- `src/lib/behance-import.ts` — чистая логика: типы, `extractBehanceProfiles`, `mapProfileToCandidate`, `isDeadBehancePage`.
- `src/lib/behance-import.test.ts` — Vitest.
- `src/server/services/candidate-analysis.ts` — `analyzeImportedCandidate(candidateId)`.
- `src/app/api/candidates/import-json/route.ts` — POST импорта.
- `src/app/api/candidates/analyze-batch/route.ts` — POST запуска пачки.
- `src/app/api/candidates/analyze-batch/status/route.ts` — GET счётчиков.
- `src/app/api/candidates/[id]/analyze-import/route.ts` — POST точечного (пере)анализа.
- `src/app/candidates/upload/import-json-block.tsx` — UI блок импорта.
- `src/app/candidates/analyze-batch-bar.tsx` — UI панель порционного анализа.

**Изменяются:**
- `prisma/schema.prisma` — `ANALYSIS_FAILED` в `CandidateStatus`.
- `src/lib/constants.ts` — подпись статуса.
- `src/app/candidates/page.tsx` — класс бейджа нового статуса + вставка панели анализа.
- `src/app/candidates/upload/page.tsx` — вставка блока импорта.
- `src/app/candidates/[id]/page.tsx` — кнопка «Повторить анализ» для `ANALYSIS_FAILED`.

**Критично — переиспользуемые сигнатуры (проверены в коде):**
- `scrapePortfolio(url)` → `{ text, title, url, screenshots }`.
- `parseResume(fileContent, fileType: "pdf"|"docx", pdfBuffer?, portfolioScreenshots?)`. Для портфолио-only путь `upload` вызывает: `parseResume(text, "pdf", undefined, screenshots)` (buffer не передаётся).
- `classifyDirection(scrapedText, screenshots, role, { grade })` → `DirectionClassification`; `needsManualClassification(c, threshold=70)`.
- `analyzePortfolio(text, screenshots, { name, role, grade })`, `analyzePortfolioComm(...)` — те же аргументы.
- Эмбеддинг (как в `upload`): `buildCandidateEmbeddingText(candidate)` → `generateEmbedding(text, "document")` → `update({ embedding, embeddingText, embeddingModel: EMBEDDING_MODEL, embeddingUpdatedAt })`. Импорты из `@/server/services/embeddings`.

**Существующий `reanalyze-portfolio` НЕ трогаем** — он не обновляет `role`/`grade`, поэтому для импортированных не годится (см. спеку).

---

## Task 1: Схема — статус ANALYSIS_FAILED

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/constants.ts`, `src/app/candidates/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Добавить статус в enum**

В `prisma/schema.prisma`, в `enum CandidateStatus`, после `PORTFOLIO_ANALYZED`:
```prisma
  ANALYSIS_FAILED
```

- [ ] **Step 2: Миграция**

Run: `npx prisma migrate dev --name add_analysis_failed_status`
Expected: аддитивная миграция (`ALTER TYPE ... ADD VALUE`), без DROP. Если Prisma просит reset — НЕ соглашаться,报 BLOCKED.

Run: `npx prisma generate`

- [ ] **Step 3: Подпись статуса**

В `src/lib/constants.ts` найти `STATUS_LABELS` (маппинг статусов кандидата) и добавить:
```ts
  ANALYSIS_FAILED: "Ошибка анализа",
```

- [ ] **Step 4: Токен и класс бейджа в globals.css**

**Важно:** бейджи статусов в этом проекте — НЕ Tailwind-утилиты, а семантические классы из `src/app/globals.css` (`.pill--green`, `.pill--blue`), собранные из токенов `--tint-*`. Красного нет — добавляем.

В `src/app/globals.css`, рядом с `--tint-green-*` / `--tint-blue-*` (~строки 271-274):
```css
    --tint-red-bg:   oklch(0.94 0.05 25);
    --tint-red-fg:   oklch(0.52 0.17 27);
```
И рядом с `.pill--green` / `.pill--blue` (~строки 336-337):
```css
.pill--red   { background: var(--tint-red-bg);   color: var(--tint-red-fg);   box-shadow: none; font-weight: 600; }
```
Если в файле есть тёмная тема с переопределением `--tint-*` — добавить red и туда, по образцу соседних.

- [ ] **Step 5: Бейдж статуса в списке**

В `src/app/candidates/page.tsx` в маппинг `STATUS_PILL` (~строка 399) добавить:
```ts
  ANALYSIS_FAILED: "pill--red",
```

- [ ] **Step 6: Проверка**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → существующие тесты проходят.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/constants.ts src/app/candidates/page.tsx src/app/globals.css
git commit -m "feat(import): статус ANALYSIS_FAILED"
```

---

## Task 2: Чистая логика парсера (TDD)

**Files:**
- Create: `src/lib/behance-import.ts`
- Test: `src/lib/behance-import.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`src/lib/behance-import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  extractBehanceProfiles,
  mapProfileToCandidate,
  isDeadBehancePage,
} from "./behance-import";

const profile = {
  id: 396401679,
  first_name: "Sabina",
  last_name: "Alieva",
  display_name: "Sabina Alieva",
  city: "Москва",
  country: "Russian Federation",
  location: "Москва, Russian Federation",
  company: "",
  occupation: " UX/UI & Graphic Designer",
  url: "https://www.behance.net/mopssia",
  website: "https://t.me/mopssia",
  fields: ["Graphic Design", "Web Design"],
  stats: { followers: 510, views: 51037 },
};

describe("extractBehanceProfiles", () => {
  it("finds profiles at any nesting depth", () => {
    const json = { a: { b: { c: [profile, profile] } } };
    expect(extractBehanceProfiles(json)).toHaveLength(2);
  });

  it("returns empty for unrelated json", () => {
    expect(extractBehanceProfiles({ foo: "bar", arr: [1, 2, 3] })).toEqual([]);
  });

  it("ignores objects without behance url", () => {
    const json = [{ display_name: "X", url: "https://dribbble.com/x" }];
    expect(extractBehanceProfiles(json)).toEqual([]);
  });

  it("ignores objects without a name", () => {
    const json = [{ url: "https://www.behance.net/nobody" }];
    expect(extractBehanceProfiles(json)).toEqual([]);
  });

  it("accepts first_name/last_name when display_name missing", () => {
    const { display_name, ...noDisplay } = profile;
    expect(extractBehanceProfiles([noDisplay])).toHaveLength(1);
  });
});

describe("mapProfileToCandidate", () => {
  it("maps core fields with stub role/grade", () => {
    const r = mapProfileToCandidate(profile)!;
    expect(r).toMatchObject({
      name: "Sabina Alieva",
      portfolioLinks: ["https://www.behance.net/mopssia"],
      location: "Москва, Russian Federation",
      telegramContact: "https://t.me/mopssia",
      role: "OTHER",
      grade: "MIDDLE",
      status: "NEW",
      source: "behance",
    });
  });

  it("does not put t.me into portfolioLinks", () => {
    const r = mapProfileToCandidate(profile)!;
    expect(r.portfolioLinks).not.toContain("https://t.me/mopssia");
  });

  it("adds non-telegram website as a second portfolio link", () => {
    const r = mapProfileToCandidate({ ...profile, website: "https://kskv-dmtr.super.site" })!;
    expect(r.portfolioLinks).toEqual([
      "https://www.behance.net/mopssia",
      "https://kskv-dmtr.super.site",
    ]);
    expect(r.telegramContact).toBeUndefined();
  });

  it("extracts email from company when it looks like an email", () => {
    const r = mapProfileToCandidate({ ...profile, company: "elenadmelena@gmail.com " })!;
    expect(r.email).toBe("elenadmelena@gmail.com");
  });

  it("ignores company when it is not an email", () => {
    const r = mapProfileToCandidate({ ...profile, company: "Yandex" })!;
    expect(r.email).toBeUndefined();
  });

  it("builds name from first/last when display_name missing", () => {
    const { display_name, ...noDisplay } = profile;
    expect(mapProfileToCandidate(noDisplay)!.name).toBe("Sabina Alieva");
  });

  it("falls back to city+country when location missing", () => {
    const { location, ...noLoc } = profile;
    expect(mapProfileToCandidate(noLoc)!.location).toBe("Москва, Russian Federation");
  });

  it("returns null without a name", () => {
    expect(mapProfileToCandidate({ url: "https://www.behance.net/x" })).toBeNull();
  });

  it("returns null without a behance url", () => {
    expect(mapProfileToCandidate({ display_name: "X" })).toBeNull();
  });
});

describe("isDeadBehancePage", () => {
  it("detects the russian 404 title", () => {
    expect(isDeadBehancePage("Не удалось найти эту страницу. :: Behance")).toBe(true);
  });
  it("detects the english 404 title", () => {
    expect(isDeadBehancePage("Page Not Found :: Behance")).toBe(true);
  });
  it("passes a live profile title", () => {
    expect(
      isDeadBehancePage("Sabina Alieva - UX/UI & Graphic Designer in Москва :: Behance"),
    ).toBe(false);
  });
  it("handles empty title", () => {
    expect(isDeadBehancePage("")).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npx vitest run src/lib/behance-import.test.ts`
Expected: FAIL — `Failed to resolve import "./behance-import"`.

- [ ] **Step 3: Реализовать `src/lib/behance-import.ts`**

```ts
/**
 * Парсинг выгрузки профилей Behance (JSON) в строки для импорта кандидатов.
 * Чистая логика, без I/O — покрыта юнит-тестами.
 */

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

export interface CandidateImportRow {
  name: string;
  portfolioLinks: string[];
  location?: string;
  telegramContact?: string;
  email?: string;
  role: "OTHER";
  grade: "MIDDLE";
  status: "NEW";
  source: "behance";
}

function isBehanceProfileUrl(v: unknown): v is string {
  return typeof v === "string" && v.includes("behance.net/");
}

function profileName(p: BehanceProfile): string {
  const display = (p.display_name ?? "").trim();
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
  return /(^|\/\/)(t\.me)\//.test(url) || url.startsWith("t.me/");
}

function looksLikeEmail(v: string): boolean {
  const s = v.trim();
  return s.includes("@") && s.includes(".") && !s.includes(" ");
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
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run src/lib/behance-import.test.ts`
Expected: PASS (все describe зелёные).

- [ ] **Step 5: Commit**

```bash
git add src/lib/behance-import.ts src/lib/behance-import.test.ts
git commit -m "feat(import): чистая логика парсера Behance-JSON"
```

---

## Task 3: API импорта

**Files:**
- Create: `src/app/api/candidates/import-json/route.ts`

- [ ] **Step 1: Реализовать роут**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  extractBehanceProfiles,
  mapProfileToCandidate,
  type CandidateImportRow,
} from "@/lib/behance-import";

export const maxDuration = 300;

function behanceUrlOf(row: CandidateImportRow): string {
  return row.portfolioLinks[0]; // по построению первый — behance-профиль
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Файл не загружен" }, { status: 400 });
    }

    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return NextResponse.json({ error: "Не удалось разобрать файл" }, { status: 400 });
    }

    const profiles = extractBehanceProfiles(json);
    if (profiles.length === 0) {
      return NextResponse.json(
        { error: "Не найдено профилей Behance в файле" },
        { status: 400 },
      );
    }

    // Маппинг + отбраковка невалидных
    const mapped: CandidateImportRow[] = [];
    let skippedInvalid = 0;
    for (const p of profiles) {
      const row = mapProfileToCandidate(p);
      if (row) mapped.push(row);
      else skippedInvalid++;
    }

    // Дедуп внутри файла по behance-url
    const seen = new Set<string>();
    const unique: CandidateImportRow[] = [];
    for (const row of mapped) {
      const key = behanceUrlOf(row);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    // Дедуп против базы — сравниваем ТОЛЬКО по behance-url профиля.
    const behanceUrls = unique.map(behanceUrlOf);
    const existing = await prisma.candidate.findMany({
      where: { portfolioLinks: { hasSome: behanceUrls } },
      select: { portfolioLinks: true },
    });
    const existingUrls = new Set<string>();
    for (const c of existing) {
      for (const link of c.portfolioLinks) {
        if (behanceUrls.includes(link)) existingUrls.add(link);
      }
    }
    const toCreate = unique.filter((r) => !existingUrls.has(behanceUrlOf(r)));
    const skippedExisting = unique.length - toCreate.length;

    // Заливка. skipDuplicates не используем: уникального индекса на portfolioLinks
    // нет, флаг был бы no-op — реальный дедуп сделан выше.
    if (toCreate.length > 0) {
      await prisma.candidate.createMany({ data: toCreate });
    }

    return NextResponse.json({
      found: profiles.length,
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

- [ ] **Step 2: Типчек + билд**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npm run build` → успех, роут `ƒ /api/candidates/import-json` в списке.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/candidates/import-json/route.ts
git commit -m "feat(import): API импорта Behance-JSON"
```

---

## Task 4: Сервис анализа импортированного кандидата

**Files:**
- Create: `src/server/services/candidate-analysis.ts`

Это ядро фичи. Повторяет путь `upload`-роута, но `update` вместо `create`.

- [ ] **Step 1: Реализовать сервис**

```ts
/**
 * Анализ импортированного кандидата (у которого есть только имя + ссылка).
 *
 * Повторяет путь upload-роута для случая «только портфолио»:
 *   scrape → parseResume(текст портфолио) → classifyDirection →
 *   analyzePortfolio(+Comm) → update(role/grade/...) → embedding.
 *
 * Почему не reanalyze-portfolio: тот роут role/grade только читает и не
 * обновляет — импортированный остался бы role: OTHER и невидимым для матчинга.
 *
 * Обработка ошибок по стадиям (важно для бюджета на 2000 профилей):
 *   - скрейп/мёртвая страница упали → ANALYSIS_FAILED (не платили, терять нечего)
 *   - parseResume упал → ANALYSIS_FAILED (role/grade не получены)
 *   - parseResume прошёл, но classify/analyze упали → СОХРАНЯЕМ парсинг
 *     (role/grade/skills + эмбеддинг), portfolioAnalysis: null, status: PARSED.
 *     Иначе транзиентный 503 от Gemini заставит платить за parseResume заново.
 *     Оценки портфолио потом добираются точечно кнопкой «Переанализировать
 *     портфолио» (reanalyze-portfolio) — ей как раз нужны уже готовые role/grade.
 *   - эмбеддинг упал → best-effort, статус не понижаем (как в upload)
 *
 * Никогда не бросает наружу — fire-and-forget безопасен.
 */
import { prisma } from "@/server/db";
import { scrapePortfolio } from "@/server/services/scraper";
import { parseResume } from "@/server/services/claude";
import { classifyDirection } from "@/server/services/direction-classifier";
import { analyzePortfolio, analyzePortfolioComm } from "@/server/services/portfolio-analyzer";
import {
  generateEmbedding,
  buildCandidateEmbeddingText,
  EMBEDDING_MODEL,
} from "@/server/services/embeddings";
import { isDeadBehancePage } from "@/lib/behance-import";
import type { Prisma } from "@prisma/client";

export async function analyzeImportedCandidate(candidateId: string): Promise<void> {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, name: true, portfolioLinks: true },
    });
    if (!candidate) return;

    const link = candidate.portfolioLinks[0];
    if (!link) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "ANALYSIS_FAILED" },
      });
      return;
    }

    // 1. Скрейпинг
    const scrape = await scrapePortfolio(link);

    // 2. Отсечка мёртвого профиля ДО вызова AI (экономия бюджета)
    if (isDeadBehancePage(scrape.title ?? "")) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "ANALYSIS_FAILED" },
      });
      return;
    }

    // 3. Парсинг «резюме» из текста портфолио — отсюда role/grade/навыки.
    //    fileType "pdf" + без buffer — как в upload для портфолио-only.
    const data = await parseResume(scrape.text, "pdf", undefined, scrape.screenshots);

    // 4-5. Направление + анализ портфолио — BEST-EFFORT.
    //      Если упадут, сохраним хотя бы результат parseResume (он уже оплачен
    //      и даёт главное: role/grade → кандидат виден матчингу).
    let analysis: unknown = null;
    try {
      // В batch спрашивать некому — берём предложенное направление как есть.
      const classification = await classifyDirection(
        scrape.text,
        scrape.screenshots,
        data.role ?? "OTHER",
        { grade: data.grade },
      );
      const ctx = { name: candidate.name, role: data.role, grade: data.grade };
      analysis =
        classification.direction === "communication"
          ? await analyzePortfolioComm(scrape.text, scrape.screenshots, ctx)
          : await analyzePortfolio(scrape.text, scrape.screenshots, ctx);
    } catch (err) {
      console.error(`portfolio analysis failed for ${candidateId} (keeping parse):`, err);
      analysis = null;
    }

    // 6. Обновление кандидата. Имя НЕ трогаем — из JSON оно достовернее.
    //    status: PORTFOLIO_ANALYZED если оценки есть, иначе PARSED (не FAILED —
    //    role/grade получены, кандидат уже полезен; оценки доберём точечно).
    const updated = await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        role: data.role,
        grade: data.grade,
        yearsOfExperience: data.yearsOfExperience,
        specializations: data.specializations,
        domains: data.domains,
        segment: data.segment,
        platforms: data.platforms,
        skills: data.skills,
        tools: data.tools,
        timezone: data.timezone,
        languages: data.languages ?? undefined,
        salaryExpectations: data.salaryExpectations,
        education: data.education,
        aiSummary: data.aiSummary,
        aiStrengths: data.aiStrengths,
        aiConcerns: data.aiConcerns,
        aiConfidenceScore: data.aiConfidenceScore,
        resumeRawText: scrape.text,
        portfolioAnalysis: analysis
          ? (analysis as unknown as Prisma.InputJsonValue)
          : undefined, // не затираем существующее, если анализ не вышел
        status: analysis ? "PORTFOLIO_ANALYZED" : "PARSED",
      },
    });

    // 7. Эмбеддинг (best-effort — как в upload, не валим анализ)
    try {
      const embeddingText = buildCandidateEmbeddingText(updated);
      const vector = await generateEmbedding(embeddingText, "document");
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          embedding: vector,
          embeddingText,
          embeddingModel: EMBEDDING_MODEL,
          embeddingUpdatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`embedding failed for ${candidateId}:`, err);
    }
  } catch (err) {
    console.error(`analyzeImportedCandidate failed for ${candidateId}:`, err);
    try {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "ANALYSIS_FAILED" },
      });
    } catch (inner) {
      console.error(`failed to mark ANALYSIS_FAILED for ${candidateId}:`, inner);
    }
  }
}
```

- [ ] **Step 2: Сверить поля с реальным `CandidateData`**

Прочитать тип `CandidateData` (возвращает `parseResume`, объявлен в `src/server/services/claude.ts`) и `create`-payload в `src/app/api/candidates/upload/route.ts` (~строки 244-262). Убедиться, что все поля в `update` существуют и называются так же. Лишние/несуществующие — убрать. НЕ добавлять `experiences` (в upload они создаются вложенно при `create`; для `update` это отдельная история — в scope не входит).

Run: `npx tsc --noEmit`
Expected: без ошибок. Если тип `CandidateData` не совпал — поправить по факту, а не по плану.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/candidate-analysis.ts
git commit -m "feat(import): сервис анализа импортированного кандидата"
```

---

## Task 5: API анализа (batch + status + точечный)

**Files:**
- Create: `src/app/api/candidates/analyze-batch/route.ts`
- Create: `src/app/api/candidates/analyze-batch/status/route.ts`
- Create: `src/app/api/candidates/[id]/analyze-import/route.ts`

- [ ] **Step 1: batch route**

`src/app/api/candidates/analyze-batch/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { analyzeImportedCandidate } from "@/server/services/candidate-analysis";

export const maxDuration = 300;

const ALLOWED_LIMITS = [10, 20, 50];
const CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  try {
    const { limit } = (await req.json()) as { limit?: number };
    if (!limit || !ALLOWED_LIMITS.includes(limit)) {
      return NextResponse.json({ error: "limit должен быть 10, 20 или 50" }, { status: 400 });
    }

    // source: "behance" обязателен — иначе пачка захватит любых прочих
    // кандидатов со статусом NEW и перезапишет им role/grade.
    const candidates = await prisma.candidate.findMany({
      where: {
        status: "NEW",
        source: "behance",
        portfolioLinks: { isEmpty: false },
      },
      select: { id: true },
      take: limit,
    });

    // Fire-and-forget: обрабатываем пачками по CONCURRENCY.
    // Рассчитано на долгоживущий Node-процесс (VPS/Railway).
    void (async () => {
      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const chunk = candidates.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((c) => analyzeImportedCandidate(c.id)));
      }
    })().catch((err) => console.error("analyze-batch background threw:", err));

    return NextResponse.json({ started: candidates.length });
  } catch (error) {
    console.error("POST analyze-batch error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: status route**

`src/app/api/candidates/analyze-batch/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    // Фильтры должны совпадать с выборкой в analyze-batch.
    const [pending, failed] = await Promise.all([
      prisma.candidate.count({
        where: { status: "NEW", source: "behance", portfolioLinks: { isEmpty: false } },
      }),
      prisma.candidate.count({
        where: { status: "ANALYSIS_FAILED", source: "behance" },
      }),
    ]);
    return NextResponse.json({ pending, failed });
  } catch (error) {
    console.error("GET analyze-batch status error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 3: точечный retry route**

`src/app/api/candidates/[id]/analyze-import/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { analyzeImportedCandidate } from "@/server/services/candidate-analysis";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Кандидат не найден" }, { status: 404 });
    }
    // Вернуть в очередь, чтобы UI сразу показал «в работе»
    await prisma.candidate.update({ where: { id }, data: { status: "NEW" } });

    void analyzeImportedCandidate(id).catch((err) =>
      console.error("analyze-import background threw:", err),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST analyze-import error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Типчек + билд**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npm run build` → успех; в списке появляются `ƒ /api/candidates/analyze-batch`, `ƒ /api/candidates/analyze-batch/status`, `ƒ /api/candidates/[id]/analyze-import`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/candidates/analyze-batch src/app/api/candidates/\[id\]/analyze-import
git commit -m "feat(import): API порционного и точечного анализа"
```

---

## Task 6: UI импорта на странице загрузки

**Files:**
- Create: `src/app/candidates/upload/import-json-block.tsx`
- Modify: `src/app/candidates/upload/page.tsx`

- [ ] **Step 1: Компонент блока**

`src/app/candidates/upload/import-json-block.tsx` — `"use client"`, без props.

Контракт:
- Заголовок «Импорт из JSON» + пояснение «Выгрузка профилей Behance. Карточки создаются без AI-анализа — запустить его можно позже на странице кандидатов.»
- File picker `accept=".json"`, показ имени выбранного файла + возможность очистить.
- Кнопка «Импортировать» (дизейбл без файла / во время запроса; текст «Импортирую…» в процессе).
- Submit → `FormData` с `file` → `POST /api/candidates/import-json`.
- Успех → блок результата: «Импортировано M. Пропущено: уже в базе K, без имени/ссылки L. Всего найдено N.»
- Ошибка → inline красный текст с `error` из ответа (или «Не удалось импортировать»).
- Стили — как у соседних блоков на этой же странице (посмотреть `src/app/candidates/upload/page.tsx` и повторить используемые там классы контейнера/заголовков).

- [ ] **Step 2: Встроить в страницу**

В `src/app/candidates/upload/page.tsx` — прочитать структуру, добавить `import ImportJsonBlock from "./import-json-block";` и отрендерить блок под существующей формой ручной загрузки, в том же контейнере/ритме отступов. Существующий флоу не трогать.

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → существующие тесты проходят.
НЕ запускать dev/build — контроллер проверит визуально.

- [ ] **Step 4: Commit**

```bash
git add src/app/candidates/upload/import-json-block.tsx src/app/candidates/upload/page.tsx
git commit -m "feat(import): UI блока импорта JSON"
```

---

## Task 7: UI порционного анализа + повтор в карточке

**Files:**
- Create: `src/app/candidates/analyze-batch-bar.tsx`
- Modify: `src/app/candidates/page.tsx`, `src/app/candidates/[id]/page.tsx`

- [ ] **Step 1: Компонент панели**

`src/app/candidates/analyze-batch-bar.tsx` — `"use client"`, без props.

Контракт:
- На mount `GET /api/candidates/analyze-batch/status` → `{ pending, failed }`. Fetch с ignore-guard (`let active = true` + cleanup).
- Если `pending === 0 && failed === 0` → не рендерить ничего.
- Иначе строка: «{pending} кандидатов без AI-анализа» + `<select>` (10 / 20 / **20 по умолчанию** / 50) + кнопка «Проанализировать». Если `failed > 0` — приглушённо «, {failed} с ошибкой анализа».
- Клик → `POST /api/candidates/analyze-batch` `{ limit }` → на время запроса кнопка дизейблится; после ответа запускается поллинг `GET .../status` каждые 5с.
- Поллинг останавливается, когда `pending` перестал меняться N раз подряд ИЛИ достиг 0; интервал чистится на unmount. Простой рабочий вариант: поллить, пока `pending > 0`, но не дольше 10 минут; кнопка при этом активна (можно запустить следующую пачку).
- Ошибка → inline красный текст, поллинг не стартует.
- Примечание в подсказке к селекту: «50 может не успеть за один заход — недообработанные останутся в очереди».

- [ ] **Step 2: Встроить панель в список кандидатов**

В `src/app/candidates/page.tsx` — добавить `import AnalyzeBatchBar from "./analyze-batch-bar";` и отрендерить в шапке страницы (рядом с заголовком/счётчиком), не ломая существующую разметку.

- [ ] **Step 3: Кнопка повтора в карточке**

В `src/app/candidates/[id]/page.tsx`:
- Найти, где рендерятся действия карточки (рядом с существующей «Переанализировать портфолио»).
- Добавить кнопку «Повторить анализ», показывать **только если** `candidate.status === "ANALYSIS_FAILED"`.
- Клик → `POST /api/candidates/${id}/analyze-import` → на успех обновить страницу/рефетч кандидата (как делают соседние действия). Дизейбл во время запроса.
- **Не менять** существующую кнопку «Переанализировать портфолио» — она бьёт в `reanalyze-portfolio` и остаётся для обычных кандидатов.

- [ ] **Step 4: Проверка**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → тесты проходят.
НЕ запускать dev/build.

- [ ] **Step 5: Commit**

```bash
git add src/app/candidates/analyze-batch-bar.tsx src/app/candidates/page.tsx src/app/candidates/\[id\]/page.tsx
git commit -m "feat(import): UI порционного анализа и повтора"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx vitest run` — все тесты зелёные (включая новые из Task 2).
- [ ] `npx tsc --noEmit && npm run build` — чисто.
- [ ] Ручной сквозной сценарий (dev-сервер; при подозрительном кэше — `rm -rf .next && npm run dev`):
  1. Подготовить маленький тестовый JSON (5-10 профилей из реальной выгрузки, положить в `scripts/data/` — папка уже в `.gitignore`).
  2. `/candidates/upload` → блок «Импорт из JSON» → загрузить файл → «Импортировано N».
  3. Повторно загрузить тот же файл → «Импортировано 0, пропущено (уже в базе) N» (дедуп работает).
  4. `/candidates` → панель «N кандидатов без AI-анализа» → выбрать 10 → «Проанализировать».
  5. Дождаться: `pending` уменьшается; у обработанных `role`/`grade` заполнились реальными значениями (не `OTHER`/`MIDDLE`), появился AI-summary и оценки.
  6. **Проверить главное:** проанализированный кандидат теперь проходит хард-фильтр — открыть вакансию с подходящей ролью, запустить матчинг, убедиться, что он попадает в пул.
  7. Если среди тестовых был мёртвый профиль — у него `ANALYSIS_FAILED`, и в логах видно, что AI не вызывался.
  8. В карточке кандидата с `ANALYSIS_FAILED` — кнопка «Повторить анализ» работает.
- [ ] Прогон на полном файле (2000) — **только после успеха пилота**, порциями по 20, с контролем расхода AI.
