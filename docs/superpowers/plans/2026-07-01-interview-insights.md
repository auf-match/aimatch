# Инсайты с интервью — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На странице вакансии — секция «Инсайты с интервью»: несколько записей встреч (текст или аудио) с лидом, AI по каждой извлекает 4 списка инсайтов; результаты накапливаются с дедупом, пользователь может помечать важные (★), скрывать (👁), редактировать текст и добавлять свои.

**Architecture:** Аддитивная схема (`VacancyInterview` + JSON-поле `interviewInsights` на `Vacancy`). Fire-and-forget обработка новых записей — реюзаем `briefing-audio.ts` для транскрибации и `callGemini` для парсинга через новый промпт. Мерж инсайтов — чистая функция под Vitest. UI — сплошной компонент с timeline записей + 4 карточками категорий; попапов нет.

**Tech Stack:** Next.js 15 (App Router, `maxDuration=300`), Prisma + PostgreSQL, React 19, Tailwind, Vitest. Spec: `docs/superpowers/specs/2026-07-01-interview-insights-design.md`.

---

## Карта файлов

**Создаются:**
- `src/lib/interview-insights.ts` — типы `InsightItem`, `Insights`, `AiSuggestions`; чистые функции `mergeInsights`, `sortForDisplay`, `countForBadge`, `emptyInsights`, `normalizeText`; константа `INSIGHT_CATEGORIES` + подписи.
- `src/lib/interview-insights.test.ts` — Vitest.
- `src/server/prompts/interview-insights-parse.ts` — билдер промпта.
- `src/server/services/interview-insights.ts` — оркестрация: `processVacancyInterview(interviewId)` с двумя фазами (транскрипт → парсинг), поддержкой retry.
- `src/app/api/vacancies/[id]/interviews/route.ts` — POST (создать + запустить), GET (список записей + текущие `interviewInsights`).
- `src/app/api/vacancies/[id]/interviews/[interviewId]/retry/route.ts` — POST перезапуска.
- `src/app/api/vacancies/[id]/interview-insights/items/route.ts` — POST добавления ручного item'а.
- `src/app/api/vacancies/[id]/interview-insights/items/[itemId]/route.ts` — PATCH одного item'а.
- `src/app/vacancies/[id]/interview-insights.tsx` — клиентский компонент.

**Изменяются:**
- `prisma/schema.prisma` — модель `VacancyInterview`, enums, поле `interviewInsights` на `Vacancy`.
- `src/app/vacancies/[id]/page.tsx` — встроить `<InterviewInsights vacancyId={id} />` между «Уточнениями» и «Воронкой».

---

## Task 1: Схема — VacancyInterview + interviewInsights

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить enums**

В конец секции enums, после `VacancyUpdateStatus`:

```prisma
enum VacancyInterviewSource {
  TEXT
  AUDIO
}

enum VacancyInterviewStatus {
  PROCESSING
  READY
  FAILED
}
```

- [ ] **Step 2: Добавить поле и relation на `Vacancy`**

После блока «Журнал уточнений» в `model Vacancy`:

```prisma
  // --- Инсайты с интервью ---
  interviewInsights Json?
  interviews        VacancyInterview[]
```

- [ ] **Step 3: Добавить модель `VacancyInterview`**

После `model VacancyUpdate { ... }`:

```prisma
model VacancyInterview {
  id            String                  @id @default(cuid())
  vacancyId     String
  vacancy       Vacancy                 @relation(fields: [vacancyId], references: [id], onDelete: Cascade)
  createdAt     DateTime                @default(now())
  actor         String

  source        VacancyInterviewSource
  rawText       String?
  audioFileUrl  String?
  transcript    String?

  status        VacancyInterviewStatus  @default(PROCESSING)
  errorMessage  String?

  @@index([vacancyId, createdAt])
}
```

- [ ] **Step 4: Применить миграцию**

Run: `npx prisma migrate dev --name add_interview_insights`
Expected: аддитивная миграция без DROP, «Your database is now in sync».

- [ ] **Step 5: Перегенерировать клиент и проверить типы**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(interview-insights): схема VacancyInterview и interviewInsights"
```

---

## Task 2: Чистая логика + Vitest

**Files:**
- Create: `src/lib/interview-insights.ts`
- Test: `src/lib/interview-insights.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`src/lib/interview-insights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  mergeInsights,
  sortForDisplay,
  countForBadge,
  emptyInsights,
  normalizeText,
  INSIGHT_CATEGORIES,
  type InsightItem,
  type AiSuggestions,
} from "./interview-insights";

const now = new Date("2026-07-01T12:00:00Z");

describe("normalizeText", () => {
  it("trims and lowercases", () => {
    expect(normalizeText("  Hello World  ")).toBe("hello world");
  });
});

describe("emptyInsights", () => {
  it("returns object with all 4 empty arrays", () => {
    const e = emptyInsights();
    expect(Object.keys(e).sort()).toEqual([...INSIGHT_CATEGORIES].sort());
    for (const k of INSIGHT_CATEGORIES) expect(e[k]).toEqual([]);
  });
});

describe("mergeInsights", () => {
  const src = "src-interview-1";

  it("adds new items when current is empty", () => {
    const suggestions: AiSuggestions = {
      leadFocusAreas: ["Продуктовое мышление"],
      leadQuestions: [],
      candidateTips: ["Готовьте примеры с метриками"],
      prescreeningQuestions: [],
    };
    const result = mergeInsights(emptyInsights(), suggestions, src, now);
    expect(result.leadFocusAreas).toHaveLength(1);
    expect(result.leadFocusAreas[0]).toMatchObject({
      text: "Продуктовое мышление",
      important: false,
      hidden: false,
      origin: "ai",
      sourceInterviewId: src,
    });
    expect(result.leadFocusAreas[0].id).toBeTruthy();
    expect(result.candidateTips).toHaveLength(1);
  });

  it("dedupes by normalized text — existing item stays untouched", () => {
    const existing: InsightItem = {
      id: "old-1",
      text: "Продуктовое Мышление",
      important: true,
      hidden: false,
      origin: "manual",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), leadFocusAreas: [existing] };
    const suggestions: AiSuggestions = {
      leadFocusAreas: ["  продуктовое мышление  "],
      leadQuestions: [], candidateTips: [], prescreeningQuestions: [],
    };
    const result = mergeInsights(current, suggestions, src, now);
    expect(result.leadFocusAreas).toHaveLength(1);
    expect(result.leadFocusAreas[0]).toEqual(existing);
  });

  it("preserves items in other categories", () => {
    const kept: InsightItem = {
      id: "keep-1", text: "Уточнить зарплатные ожидания",
      important: false, hidden: false, origin: "manual",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), prescreeningQuestions: [kept] };
    const result = mergeInsights(
      current,
      { leadFocusAreas: ["X"], leadQuestions: [], candidateTips: [], prescreeningQuestions: [] },
      src, now,
    );
    expect(result.prescreeningQuestions).toEqual([kept]);
    expect(result.leadFocusAreas).toHaveLength(1);
  });

  it("adds several new items and preserves hidden existing", () => {
    const hidden: InsightItem = {
      id: "h-1", text: "Старая тема",
      important: false, hidden: true, origin: "ai", sourceInterviewId: "old-src",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), leadQuestions: [hidden] };
    const result = mergeInsights(
      current,
      { leadFocusAreas: [], leadQuestions: ["Новая тема", "Другая"], candidateTips: [], prescreeningQuestions: [] },
      src, now,
    );
    expect(result.leadQuestions).toHaveLength(3);
    expect(result.leadQuestions[0]).toEqual(hidden);
    expect(result.leadQuestions.slice(1).map((i) => i.text)).toEqual(["Новая тема", "Другая"]);
  });

  it("dedupes when AI suggests same text as an existing hidden item", () => {
    const hidden: InsightItem = {
      id: "h-1", text: "Уже отклонённая тема",
      important: false, hidden: true, origin: "ai",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const current = { ...emptyInsights(), candidateTips: [hidden] };
    const result = mergeInsights(
      current,
      { leadFocusAreas: [], leadQuestions: [], candidateTips: ["УЖЕ ОТКЛОНЁННАЯ ТЕМА"], prescreeningQuestions: [] },
      src, now,
    );
    expect(result.candidateTips).toHaveLength(1);
    expect(result.candidateTips[0]).toEqual(hidden);
  });
});

describe("sortForDisplay", () => {
  const mk = (id: string, important: boolean, hidden: boolean, ts: string): InsightItem => ({
    id, text: id, important, hidden, origin: "ai", createdAt: ts,
  });

  it("splits by hidden and sorts visible by important-first then createdAt desc", () => {
    const items = [
      mk("a", false, false, "2026-06-01T00:00:00Z"),
      mk("b", true,  false, "2026-06-02T00:00:00Z"),
      mk("c", false, false, "2026-06-03T00:00:00Z"),
      mk("d", true,  false, "2026-06-01T00:00:00Z"),
      mk("h", false, true,  "2026-06-05T00:00:00Z"),
    ];
    const { visible, hidden } = sortForDisplay(items);
    expect(visible.map((i) => i.id)).toEqual(["b", "d", "c", "a"]);
    expect(hidden.map((i) => i.id)).toEqual(["h"]);
  });
});

describe("countForBadge", () => {
  it("counts totals, hidden, important", () => {
    const items: InsightItem[] = [
      { id: "1", text: "x", important: true,  hidden: false, origin: "ai",     createdAt: "" },
      { id: "2", text: "x", important: false, hidden: true,  origin: "ai",     createdAt: "" },
      { id: "3", text: "x", important: true,  hidden: true,  origin: "manual", createdAt: "" },
      { id: "4", text: "x", important: false, hidden: false, origin: "manual", createdAt: "" },
    ];
    expect(countForBadge(items)).toEqual({ total: 4, hidden: 2, important: 2 });
  });
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npx vitest run src/lib/interview-insights.test.ts`
Expected: FAIL — `Failed to resolve import "./interview-insights"`.

- [ ] **Step 3: Реализовать `src/lib/interview-insights.ts`**

```ts
import { nanoid } from "nanoid";

export const INSIGHT_CATEGORIES = [
  "leadFocusAreas",
  "leadQuestions",
  "candidateTips",
  "prescreeningQuestions",
] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<InsightCategory, string> = {
  leadFocusAreas:        "Фокусы лида",
  leadQuestions:         "Вопросы лида",
  candidateTips:         "Советы кандидату",
  prescreeningQuestions: "Вопросы на прескрининг",
};

export interface InsightItem {
  id: string;
  text: string;
  important: boolean;
  hidden: boolean;
  origin: "ai" | "manual";
  sourceInterviewId?: string;
  createdAt: string;
}

export type Insights = Record<InsightCategory, InsightItem[]>;
export type AiSuggestions = Record<InsightCategory, string[]>;

export function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

export function emptyInsights(): Insights {
  return {
    leadFocusAreas: [],
    leadQuestions: [],
    candidateTips: [],
    prescreeningQuestions: [],
  };
}

/**
 * Мержит AI-предложения в существующие инсайты.
 * Дедуп по normalizeText(existing.text) === normalizeText(new).
 * Существующие item'ы не изменяются (сохраняется id, text, флаги).
 */
export function mergeInsights(
  current: Insights,
  suggestions: AiSuggestions,
  sourceInterviewId: string,
  now: Date,
): Insights {
  const result = emptyInsights();
  for (const cat of INSIGHT_CATEGORIES) {
    const existing = current[cat] ?? [];
    const existingNormalized = new Set(existing.map((i) => normalizeText(i.text)));
    const additions: InsightItem[] = [];
    for (const raw of suggestions[cat] ?? []) {
      const key = normalizeText(raw);
      if (!key) continue;
      if (existingNormalized.has(key)) continue;
      existingNormalized.add(key);
      additions.push({
        id: nanoid(),
        text: raw.trim(),
        important: false,
        hidden: false,
        origin: "ai",
        sourceInterviewId,
        createdAt: now.toISOString(),
      });
    }
    result[cat] = [...existing, ...additions];
  }
  return result;
}

/** Сортирует item'ы категории для показа: важные сверху, потом createdAt desc. */
export function sortForDisplay(items: InsightItem[]): {
  visible: InsightItem[];
  hidden: InsightItem[];
} {
  const visible: InsightItem[] = [];
  const hidden: InsightItem[] = [];
  for (const i of items) (i.hidden ? hidden : visible).push(i);
  const cmp = (a: InsightItem, b: InsightItem) => {
    if (a.important !== b.important) return a.important ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  };
  visible.sort(cmp);
  hidden.sort(cmp);
  return { visible, hidden };
}

export function countForBadge(items: InsightItem[]): {
  total: number;
  hidden: number;
  important: number;
} {
  let hidden = 0, important = 0;
  for (const i of items) {
    if (i.hidden) hidden++;
    if (i.important) important++;
  }
  return { total: items.length, hidden, important };
}
```

- [ ] **Step 4: Проверить наличие `nanoid`, поставить если нет**

Run: `node -e "require('nanoid')" 2>&1 | tail -1`
Если ошибка `Cannot find module` — установить: `npm install nanoid` и закоммитить `package.json` + `package-lock.json` отдельным шагом. Если модуль найден — пропустить.

- [ ] **Step 5: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run src/lib/interview-insights.test.ts`
Expected: PASS (все describe зелёные).

- [ ] **Step 6: Commit**

```bash
git add src/lib/interview-insights.ts src/lib/interview-insights.test.ts package.json package-lock.json
git commit -m "feat(interview-insights): чистая логика мержа, сортировки и типы"
```

---

## Task 3: Промпт парсинга

**Files:**
- Create: `src/server/prompts/interview-insights-parse.ts`

- [ ] **Step 1: Реализовать промпт**

```ts
/**
 * Промпт: транскрипт одной встречи с лидом + короткий контекст вакансии
 * -> JSON с 4 массивами строк-инсайтов.
 */
export function buildInterviewInsightsParsePrompt(args: {
  vacancy: { title: string; role: string; grade: string };
  transcript: string;
}): string {
  return `Ты помогаешь рекрутёру дизайн-агентства выделить практические инсайты из встречи дизайн-лида с кандидатом на позицию:
- Вакансия: ${args.vacancy.title}
- Роль: ${args.vacancy.role}, грейд: ${args.vacancy.grade}

Транскрипт встречи:
"""
${args.transcript}
"""

Выдели из этого транскрипта 4 списка инсайтов. Каждый инсайт — короткая ёмкая фраза (5-15 слов), сформулированная так, чтобы её было полезно прочитать другому рекрутёру перед общением с кандидатами.

1. **leadFocusAreas** — на что дизайн-лид обращает внимание при оценке кандидатов. Что для него важно, какие качества/скиллы он проверяет.
2. **leadQuestions** — конкретные вопросы, которые лид задавал или собирается задавать на собеседовании (переформулируй в виде вопросов).
3. **candidateTips** — практические советы, которые полезно передать будущим кандидатам перед встречей с лидом (как готовиться, о чём говорить, каких ошибок избегать).
4. **prescreeningQuestions** — вопросы, которые рекрутёр может задать кандидату ДО собеседования с лидом, чтобы отсеять неподходящих (или подготовить сильнее).

Важно:
- Не выдумывай ничего, чего нет в транскрипте.
- Если категория пустая — верни пустой массив. Не притягивай за уши.
- Одна фраза = один пункт. Не объединяй несколько разных мыслей в один пункт.
- Не дублируй одну и ту же мысль в разных категориях.

Верни ТОЛЬКО валидный JSON (без markdown, без backticks) в формате:
{
  "leadFocusAreas": ["...", "..."],
  "leadQuestions": ["...", "..."],
  "candidateTips": ["...", "..."],
  "prescreeningQuestions": ["...", "..."]
}`;
}
```

- [ ] **Step 2: Типчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/server/prompts/interview-insights-parse.ts
git commit -m "feat(interview-insights): промпт парсинга инсайтов из транскрипта"
```

---

## Task 4: Сервис оркестрации

**Files:**
- Create: `src/server/services/interview-insights.ts`

- [ ] **Step 1: Реализовать сервис**

```ts
/**
 * Обработка одной VacancyInterview:
 *   1. Если нет transcript и это AUDIO — транскрибируем.
 *   2. Гоним итоговый текст через промпт -> AiSuggestions.
 *   3. Мержим в Vacancy.interviewInsights (в транзакции, с оптимистичной блокировкой).
 *
 * Идемпотентен: если transcript уже есть, шаг 1 пропускается.
 * Если merge упал, повторный вызов начнёт с шага 2.
 */
import { promises as fs } from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { transcribeAudio, getAudioMimeType } from "@/server/services/briefing-audio";
import { callGemini } from "@/server/services/claude";
import { buildInterviewInsightsParsePrompt } from "@/server/prompts/interview-insights-parse";
import {
  mergeInsights,
  emptyInsights,
  type AiSuggestions,
  type Insights,
} from "@/lib/interview-insights";

function parseJsonResponse(text: string): AiSuggestions {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned);
  return {
    leadFocusAreas: Array.isArray(parsed.leadFocusAreas) ? parsed.leadFocusAreas.filter((x: unknown) => typeof x === "string") : [],
    leadQuestions: Array.isArray(parsed.leadQuestions) ? parsed.leadQuestions.filter((x: unknown) => typeof x === "string") : [],
    candidateTips: Array.isArray(parsed.candidateTips) ? parsed.candidateTips.filter((x: unknown) => typeof x === "string") : [],
    prescreeningQuestions: Array.isArray(parsed.prescreeningQuestions) ? parsed.prescreeningQuestions.filter((x: unknown) => typeof x === "string") : [],
  };
}

export async function processVacancyInterview(interviewId: string): Promise<void> {
  try {
    const interview = await prisma.vacancyInterview.findUnique({
      where: { id: interviewId },
      include: { vacancy: { select: { id: true, title: true, role: true, grade: true } } },
    });
    if (!interview) return;

    // Фаза 1: транскрибация (если нужно).
    let transcript = interview.transcript;
    if (!transcript && interview.source === "AUDIO" && interview.audioFileUrl) {
      const absPath = path.isAbsolute(interview.audioFileUrl)
        ? interview.audioFileUrl
        : path.join(process.cwd(), interview.audioFileUrl);
      const buffer = await fs.readFile(absPath);
      const mimeType = getAudioMimeType(path.basename(absPath));
      if (!mimeType) throw new Error("Неподдерживаемый формат аудио");
      transcript = await transcribeAudio(buffer, mimeType);
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { transcript },
      });
    }

    // Если это TEXT — используем rawText.
    if (!transcript && interview.source === "TEXT") {
      transcript = interview.rawText?.trim() || "";
    }

    if (!transcript) {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { status: "FAILED", errorMessage: "Пустой транскрипт" },
      });
      return;
    }

    // После успешной транскрипции — READY (даже если парсинг ниже упадёт).
    if (interview.status !== "READY") {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { status: "READY", errorMessage: null },
      });
    }

    // Фаза 2: парсинг.
    const prompt = buildInterviewInsightsParsePrompt({
      vacancy: {
        title: interview.vacancy.title,
        role: interview.vacancy.role,
        grade: interview.vacancy.grade,
      },
      transcript,
    });
    const raw = await callGemini([{ text: prompt }]);
    const suggestions = parseJsonResponse(raw);

    // Фаза 3: мерж (с оптимистичной блокировкой через updatedAt).
    await mergeIntoVacancy(interview.vacancyId, suggestions, interviewId);

    // Успех — errorMessage чистим.
    await prisma.vacancyInterview.update({
      where: { id: interviewId },
      data: { errorMessage: null },
    });
  } catch (err) {
    console.error("processVacancyInterview failed:", err);
    // Если транскрипт уже есть — оставляем READY + записываем errorMessage
    // (retry перезапустит только парсинг).
    // Если транскрипта нет — FAILED (retry начнёт с транскрипции).
    const cur = await prisma.vacancyInterview.findUnique({ where: { id: interviewId } });
    if (!cur) return;
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    if (cur.transcript) {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { errorMessage: message },
      });
    } else {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { status: "FAILED", errorMessage: message },
      });
    }
  }
}

/**
 * Мержит suggestions в Vacancy.interviewInsights с ретраем при коллизии.
 * Ловит гонку при параллельной обработке нескольких записей.
 */
async function mergeIntoVacancy(
  vacancyId: string,
  suggestions: AiSuggestions,
  sourceInterviewId: string,
): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: vacancyId },
      select: { interviewInsights: true, updatedAt: true },
    });
    if (!vacancy) throw new Error("Вакансия не найдена");

    const current = (vacancy.interviewInsights as unknown as Insights) ?? emptyInsights();
    const merged = mergeInsights(current, suggestions, sourceInterviewId, new Date());

    // Оптимистичная блокировка: обновляем только если updatedAt не менялся.
    const res = await prisma.vacancy.updateMany({
      where: { id: vacancyId, updatedAt: vacancy.updatedAt },
      data: { interviewInsights: merged as unknown as Prisma.InputJsonValue },
    });
    if (res.count === 1) return;
    // Иначе — конкурентная запись, повтор.
  }
  throw new Error("Не удалось смерджить инсайты (много гонок)");
}
```

- [ ] **Step 2: Типчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/interview-insights.ts
git commit -m "feat(interview-insights): оркестрация с двумя фазами и мержем"
```

---

## Task 5: API интервью (POST/GET + retry)

**Files:**
- Create: `src/app/api/vacancies/[id]/interviews/route.ts`
- Create: `src/app/api/vacancies/[id]/interviews/[interviewId]/retry/route.ts`

- [ ] **Step 1: POST/GET route**

`src/app/api/vacancies/[id]/interviews/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/server/db";
import { getAudioMimeType, MAX_AUDIO_BYTES } from "@/server/services/briefing-audio";
import { processVacancyInterview } from "@/server/services/interview-insights";

export const maxDuration = 300;
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const formData = await req.formData();
    const rawText = (formData.get("rawText") as string | null)?.trim() || null;
    const audio = formData.get("audio") as File | null;
    const actor = (formData.get("actor") as string | null) || "Система";

    if (!rawText && !audio) {
      return NextResponse.json({ error: "Нужен текст или аудио" }, { status: 400 });
    }

    let audioFileUrl: string | null = null;
    let source: "TEXT" | "AUDIO" = "TEXT";

    if (audio) {
      const mimeType = getAudioMimeType(audio.name);
      if (!mimeType) {
        return NextResponse.json({ error: "Поддерживаются только .m4a, .mp3, .aac" }, { status: 400 });
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Файл слишком большой (максимум 200 MB)" }, { status: 400 });
      }
      if (audio.size < 1024) {
        return NextResponse.json({ error: "Файл слишком маленький" }, { status: 400 });
      }
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const ext = path.extname(audio.name);
      const fileName = `interview-${randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      await fs.writeFile(filePath, Buffer.from(await audio.arrayBuffer()));
      audioFileUrl = filePath;
      source = "AUDIO";
    }

    const created = await prisma.vacancyInterview.create({
      data: {
        vacancyId, actor, source, rawText, audioFileUrl,
        status: "PROCESSING",
      },
    });

    void processVacancyInterview(created.id).catch((err) => {
      console.error("background processVacancyInterview threw:", err);
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST interview error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const [interviews, vacancy] = await Promise.all([
      prisma.vacancyInterview.findMany({
        where: { vacancyId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.vacancy.findUnique({
        where: { id: vacancyId },
        select: { interviewInsights: true },
      }),
    ]);
    return NextResponse.json({
      interviews,
      interviewInsights: vacancy?.interviewInsights ?? null,
    });
  } catch (error) {
    console.error("GET interviews error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: retry route**

`src/app/api/vacancies/[id]/interviews/[interviewId]/retry/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { processVacancyInterview } from "@/server/services/interview-insights";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; interviewId: string }> },
) {
  const { id: vacancyId, interviewId } = await params;
  try {
    const interview = await prisma.vacancyInterview.findUnique({ where: { id: interviewId } });
    if (!interview || interview.vacancyId !== vacancyId) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }

    // Перезапуск возможен если: status=FAILED, или READY с errorMessage (парсинг упал).
    const canRetry =
      interview.status === "FAILED" ||
      (interview.status === "READY" && !!interview.errorMessage);
    if (!canRetry) {
      return NextResponse.json({ error: "Нечего повторять" }, { status: 409 });
    }

    // Если статус был FAILED — сбрасываем в PROCESSING, чтобы processVacancyInterview его подхватил.
    // Если READY с errorMessage — оставляем READY, чтобы фаза 1 пропустилась и запустился только парсинг.
    if (interview.status === "FAILED") {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { status: "PROCESSING", errorMessage: null },
      });
    } else {
      await prisma.vacancyInterview.update({
        where: { id: interviewId },
        data: { errorMessage: null },
      });
    }

    void processVacancyInterview(interviewId).catch((err) =>
      console.error("retry processVacancyInterview threw:", err),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST retry error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Типчек + билд**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npm run build` → успех; в списке роутов появляются `ƒ /api/vacancies/[id]/interviews` и `ƒ /api/vacancies/[id]/interviews/[interviewId]/retry`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/vacancies/[id]/interviews/"
git commit -m "feat(interview-insights): API создания/листинга записей и retry"
```

---

## Task 6: API отдельных инсайтов (PATCH item / POST item)

**Files:**
- Create: `src/app/api/vacancies/[id]/interview-insights/items/route.ts`
- Create: `src/app/api/vacancies/[id]/interview-insights/items/[itemId]/route.ts`

- [ ] **Step 1: POST — добавление ручного item'а**

`src/app/api/vacancies/[id]/interview-insights/items/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  INSIGHT_CATEGORIES,
  emptyInsights,
  normalizeText,
  type InsightCategory,
  type Insights,
  type InsightItem,
} from "@/lib/interview-insights";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const { category, text } = (await req.json()) as { category?: string; text?: string };
    if (!category || !INSIGHT_CATEGORIES.includes(category as InsightCategory)) {
      return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
    }
    const trimmed = (text ?? "").trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Пустой текст" }, { status: 400 });
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const vacancy = await prisma.vacancy.findUnique({
        where: { id: vacancyId },
        select: { interviewInsights: true, updatedAt: true },
      });
      if (!vacancy) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });

      const current = (vacancy.interviewInsights as unknown as Insights) ?? emptyInsights();
      const cat = category as InsightCategory;
      const key = normalizeText(trimmed);
      if ((current[cat] ?? []).some((i) => normalizeText(i.text) === key)) {
        return NextResponse.json({ error: "Такой инсайт уже есть" }, { status: 409 });
      }

      const item: InsightItem = {
        id: nanoid(),
        text: trimmed,
        important: false,
        hidden: false,
        origin: "manual",
        createdAt: new Date().toISOString(),
      };
      const next: Insights = { ...current, [cat]: [...(current[cat] ?? []), item] };

      const res = await prisma.vacancy.updateMany({
        where: { id: vacancyId, updatedAt: vacancy.updatedAt },
        data: { interviewInsights: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 1) return NextResponse.json(item, { status: 201 });
    }
    return NextResponse.json({ error: "Не удалось сохранить (много гонок)" }, { status: 500 });
  } catch (error) {
    console.error("POST insight item error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: PATCH — правка одного item'а**

`src/app/api/vacancies/[id]/interview-insights/items/[itemId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import {
  INSIGHT_CATEGORIES,
  emptyInsights,
  type InsightCategory,
  type Insights,
  type InsightItem,
} from "@/lib/interview-insights";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: vacancyId, itemId } = await params;
  try {
    const patch = (await req.json()) as { text?: string; important?: boolean; hidden?: boolean };

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const vacancy = await prisma.vacancy.findUnique({
        where: { id: vacancyId },
        select: { interviewInsights: true, updatedAt: true },
      });
      if (!vacancy) return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });

      const current = (vacancy.interviewInsights as unknown as Insights) ?? emptyInsights();
      let foundIn: InsightCategory | null = null;
      let foundIndex = -1;
      for (const cat of INSIGHT_CATEGORIES) {
        const idx = (current[cat] ?? []).findIndex((i) => i.id === itemId);
        if (idx >= 0) { foundIn = cat; foundIndex = idx; break; }
      }
      if (!foundIn) return NextResponse.json({ error: "Инсайт не найден" }, { status: 404 });

      const prevItem = current[foundIn][foundIndex];
      const updated: InsightItem = {
        ...prevItem,
        ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
        ...(patch.important !== undefined ? { important: !!patch.important } : {}),
        ...(patch.hidden !== undefined ? { hidden: !!patch.hidden } : {}),
      };
      if (!updated.text) {
        return NextResponse.json({ error: "Пустой текст" }, { status: 400 });
      }
      const nextArr = [...current[foundIn]];
      nextArr[foundIndex] = updated;
      const next: Insights = { ...current, [foundIn]: nextArr };

      const res = await prisma.vacancy.updateMany({
        where: { id: vacancyId, updatedAt: vacancy.updatedAt },
        data: { interviewInsights: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 1) return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Не удалось сохранить (много гонок)" }, { status: 500 });
  } catch (error) {
    console.error("PATCH insight item error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Типчек + билд**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npm run build` → успех; появляются оба роута.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/vacancies/[id]/interview-insights/"
git commit -m "feat(interview-insights): API добавления и правки отдельных инсайтов"
```

---

## Task 7: UI компонент секции

**Files:**
- Create: `src/app/vacancies/[id]/interview-insights.tsx`

- [ ] **Step 1: Реализовать компонент**

`"use client"`. Props: `{ vacancyId: string }`.

**Контракт:**
- На mount `GET /api/vacancies/{vacancyId}/interviews` → в state `interviews: VacancyInterview[]` и `insights: Insights` (используя `emptyInsights()` из `@/lib/interview-insights` если null). Fetch с `active`-guard.
- Поллинг: пока в `interviews` есть хоть одна `PROCESSING` — `setInterval(refetch, 3000)`. Останавливается когда PROCESSING исчезли или компонент размонтирован / vacancyId сменился.
- **Заголовок секции** «Инсайты с интервью» + кнопка «+ Загрузить запись». Кнопка открывает inline-форму (textarea + file picker, accept `.m4a,.mp3,.aac`, Отправить/Отменить). Submit → multipart POST с `rawText`, `audio`, `actor=getPipelineActor()`; на успех — prepend к state и держим поллинг живым.
- **Timeline записей.** Каждая — компактная карточка: `новая-сверху { дата toLocaleString('ru-RU'), актор, иконка (Mic/FileText из lucide), бейдж статуса }`. Клик по карточке toggle раскрытия — под ней показывается `transcript` (или `rawText`) в pre-wrap.
  - Бейджи:
    - `PROCESSING` — серый со спиннером Loader2 и текстом «AI обрабатывает…».
    - `READY` без `errorMessage` — приглушённая галочка «Готова».
    - `READY` с `errorMessage` — оранжевая плашка «AI-анализ не удался: {errorMessage}» + кнопка «Повторить» → `POST .../retry`.
    - `FAILED` — красная плашка «Ошибка: {errorMessage}» + «Повторить».
- **Блок инсайтов** — 4 карточки категорий (grid или flex-column). По каждой:
  - Заголовок с иконкой (можно свою SVG или lucide) + `CATEGORY_LABELS[cat]` + счётчик «{total} инсайтов, {hidden} скрыто, {important} важных» (только ненулевые части через `·`).
  - Список видимых item'ов (из `sortForDisplay(items).visible`). Каждая строка:
    - Слева: `★` (жёлтый если `item.important`, серый иначе) — клик toggle. `👁` (в стиле eye) — клик toggle hidden.
    - Центр: текст. По клику превращается в textarea, blur → PATCH `text`, обновляем state.
    - Справа: маленький бейдж AI / Ручной (для наглядности источника).
  - Свёрнутый блок «Показать скрытые ({hidden.length})» — если есть скрытые. При раскрытии показать `sortForDisplay(items).hidden` приглушённо (`opacity-60`), те же контролы.
  - Внизу — поле «+ Добавить свой инсайт» (input; Enter или кнопка → POST /items). При 409 показать inline-подсказку «Такой инсайт уже есть».
- **Плейсхолдер:** если `interviews.length === 0` И все 4 массива инсайтов пусты — показать большой блок «Загрузите первую запись встречи с лидом» + одна большая кнопка «+ Загрузить запись» по центру, без карточек категорий и timeline.

**Технические детали:**
- Используем `@/lib/interview-insights` для `emptyInsights`, `sortForDisplay`, `countForBadge`, `CATEGORY_LABELS`, `INSIGHT_CATEGORIES`, типов.
- Актор — `getPipelineActor()` из `@/lib/pipeline`.
- Все PATCH/POST — с оптимистичным обновлением state, на ошибку — refetch + inline error.
- Никаких `bg-card` для непрозрачных попапов (в этом компоненте попапов нет — только inline формы и раскрытия).
- Если файл превышает ~500 строк — разрешено вынести `<InsightRow>` в отдельный `src/app/vacancies/[id]/interview-insight-row.tsx`, но не пре-сплитить.

- [ ] **Step 2: Типчек + Vitest**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → все существующие тесты проходят.
Run — НЕ `npm run build` и НЕ `npm run dev` (dev-сервер может быть запущен, билд сломает `.next`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/vacancies/[id]/interview-insights.tsx"
git commit -m "feat(interview-insights): UI секции (форма, timeline, 4 категории с item-строками)"
```

---

## Task 8: Интеграция в страницу вакансии

**Files:**
- Modify: `src/app/vacancies/[id]/page.tsx`

- [ ] **Step 1: Импорт**

Добавить рядом с другими локальными импортами:
```ts
import InterviewInsights from "./interview-insights";
```

- [ ] **Step 2: Встроить между «Уточнениями» и «Воронкой»**

В JSX (в view-mode блоке), найти секцию «Уточнения» (`<VacancyUpdates vacancyId={id} />`) и секцию «Воронка» (`<PipelineBoard vacancyId={id} />`). Между ними — новая секция:

```tsx
{/* ── Interview insights ──────────────────────────────── */}
<div className="mt-4">
  <InterviewInsights vacancyId={id} />
</div>
```

Стиль обёртки (`mt-4`) должен совпадать с тем, как обёрнуты соседние секции.

- [ ] **Step 3: Типчек + Vitest**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → все тесты проходят.
НЕ `npm run build` и НЕ `npm run dev` — контроллер проверит вручную.

- [ ] **Step 4: Commit**

```bash
git add "src/app/vacancies/[id]/page.tsx"
git commit -m "feat(interview-insights): интеграция секции в страницу вакансии"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx vitest run` — все unit-тесты зелёные (существующие + добавленные в Task 2).
- [ ] `npx tsc --noEmit && npm run build` — чисто.
- [ ] Сквозной сценарий вручную:
  1. Открыть вакансию → секция «Инсайты с интервью», пустой плейсхолдер.
  2. Загрузить текстовое уточнение (например, вставить придуманный транскрипт беседы лида и кандидата) → появляется PROCESSING в timeline → через 5-20с READY → в 4 категориях наполнились item'ы.
  3. Пометить один item «важным» (★) → он поднимается наверх.
  4. Скрыть один (👁) → уходит в свёрнутое «Показать скрытые (1)».
  5. Отредактировать текст третьего inline → сохраняется.
  6. Добавить свой инсайт снизу категории → появляется с бейджем «Ручной».
  7. Загрузить второе уточнение → новые item'ы **добавляются** к существующим (дубли AI по нормализованному тексту не пройдут), уже отмеченные важные/скрытые сохраняют своё состояние.
- [ ] (опционально) Тест ошибки транскрибации: загрузить очень короткий mp3 (>1KB, но, например, шум/тишина 2-3 секунды — валидацию на размер пройдёт) → PROCESSING → FAILED → кнопка «Повторить» → снова FAILED (транскрибация не даст непустого текста). (Пустой mp3 <1KB отвергнется на этапе POST с 400 — это тоже ок, но другой путь.)
