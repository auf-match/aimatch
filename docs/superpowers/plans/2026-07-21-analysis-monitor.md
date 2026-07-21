# Временная страница мониторинга AI-анализа — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать временную страницу `/candidates/analyze-status`, где видно, кого AI-анализ обрабатывает прямо сейчас (in-memory трекер) и кто упал с текстом ошибки (новое поле `lastAnalysisError`).

**Architecture:** In-memory Map в `globalThis` держит «сейчас в обработке» (сервис анализа отмечает старт/финиш); новое поле в БД хранит текст последней ошибки; тонкий debug-роут отдаёт снимок трекера + список упавших + счётчик очереди; клиентская страница поллит его раз в 4 секунды.

**Tech Stack:** Next.js 15 (App Router, route handlers), Prisma + PostgreSQL, TypeScript (strict), Vitest. Спека: `docs/superpowers/specs/2026-07-21-analysis-monitor-design.md`.

**Важно (временный инструмент):** страницу в сайдбар НЕ добавляем. Механизм батчинга/конкурентности НЕ трогаем.

---

## Карта файлов

**Создаются:**
- `src/server/services/analysis-tracker.ts` — in-memory трекер «в обработке».
- `src/server/services/analysis-tracker.test.ts` — Vitest.
- `src/app/api/candidates/analyze-status-debug/route.ts` — GET снимок.
- `src/app/candidates/analyze-status/page.tsx` — страница-монитор.

**Изменяются:**
- `prisma/schema.prisma` — поле `lastAnalysisError String?` в `Candidate`.
- `src/server/services/candidate-analysis.ts` — трекинг старт/финиш + запись `lastAnalysisError` в 3 местах.

**Не трогаем:** `analyze-batch/route.ts`, `analyze-batch/status/route.ts`, сайдбар, схему кроме одного поля.

---

## Task 1: Поле lastAnalysisError в схеме

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить поле**

В `prisma/schema.prisma`, в модель `Candidate`, рядом с прочими скалярными полями (например после `resumeRawText` или в блоке AI-полей — по месту, чтобы читалось логично), добавить:
```prisma
  lastAnalysisError String?
```

- [ ] **Step 2: Миграция**

Run: `npx prisma migrate dev --name add_last_analysis_error`
Expected: аддитивная миграция (`ALTER TABLE "Candidate" ADD COLUMN "lastAnalysisError"`), без DROP. Если Prisma просит reset — НЕ соглашаться,报 BLOCKED.

Run: `npx prisma generate`

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(monitor): поле lastAnalysisError в Candidate"
```

---

## Task 2: In-memory трекер (TDD)

**Files:**
- Create: `src/server/services/analysis-tracker.ts`, `src/server/services/analysis-tracker.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`src/server/services/analysis-tracker.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  markStarted,
  markFinished,
  getProcessing,
} from "./analysis-tracker";

// Трекер — модульный синглтон в globalThis. Между тестами чистим,
// снимая всё, что осталось от предыдущего кейса.
beforeEach(() => {
  for (const e of getProcessing()) markFinished(e.id);
});

describe("analysis-tracker", () => {
  it("starts empty", () => {
    expect(getProcessing()).toEqual([]);
  });

  it("tracks a started candidate", () => {
    markStarted({ id: "a", name: "Иван", portfolioLink: "https://behance.net/ivan", startedAt: 1000 });
    const snap = getProcessing();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({ id: "a", name: "Иван", portfolioLink: "https://behance.net/ivan" });
  });

  it("removes a finished candidate", () => {
    markStarted({ id: "a", name: "Иван", portfolioLink: "x", startedAt: 1000 });
    markFinished("a");
    expect(getProcessing()).toEqual([]);
  });

  it("markFinished on unknown id does not throw", () => {
    expect(() => markFinished("nope")).not.toThrow();
  });

  it("double markStarted with same id does not duplicate", () => {
    markStarted({ id: "a", name: "Иван", portfolioLink: "x", startedAt: 1000 });
    markStarted({ id: "a", name: "Иван 2", portfolioLink: "y", startedAt: 2000 });
    const snap = getProcessing();
    expect(snap).toHaveLength(1);
    expect(snap[0].name).toBe("Иван 2"); // перезапись
  });

  it("snapshot is sorted by startedAt ascending", () => {
    markStarted({ id: "b", name: "B", portfolioLink: "x", startedAt: 3000 });
    markStarted({ id: "a", name: "A", portfolioLink: "x", startedAt: 1000 });
    markStarted({ id: "c", name: "C", portfolioLink: "x", startedAt: 2000 });
    expect(getProcessing().map((e) => e.id)).toEqual(["a", "c", "b"]);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run src/server/services/analysis-tracker.test.ts`
Expected: FAIL — `Failed to resolve import "./analysis-tracker"`.

- [ ] **Step 3: Реализовать `src/server/services/analysis-tracker.ts`**

```ts
/**
 * In-memory трекер «кто сейчас в обработке AI-анализом».
 *
 * Временный инструмент для мониторинга большого прогона. Живёт в памяти
 * процесса (проект — один долгоживущий Node-процесс на VPS). При перезапуске
 * сервера список пустеет — это приемлемо, БД-данные (ошибки/очередь) не теряются.
 *
 * Map кладём в globalThis, чтобы hot-reload в dev не сбрасывал состояние
 * посреди прогона (стандартный Next.js-приём; образца в проекте нет).
 */

export interface ProcessingEntry {
  id: string;
  name: string;
  portfolioLink: string;
  startedAt: number; // Date.now()
}

declare global {
  // eslint-disable-next-line no-var
  var __analysisTracker: Map<string, ProcessingEntry> | undefined;
}

const processing: Map<string, ProcessingEntry> =
  (globalThis.__analysisTracker ??= new Map<string, ProcessingEntry>());

export function markStarted(entry: ProcessingEntry): void {
  processing.set(entry.id, entry);
}

export function markFinished(id: string): void {
  processing.delete(id);
}

/** Снимок, отсортированный по времени старта (раньше — выше). */
export function getProcessing(): ProcessingEntry[] {
  return [...processing.values()].sort((a, b) => a.startedAt - b.startedAt);
}
```

- [ ] **Step 4: Запустить — убедиться, что проходят**

Run: `npx vitest run src/server/services/analysis-tracker.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: без ошибок (проверяет, что `declare global` корректен при strict).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/analysis-tracker.ts src/server/services/analysis-tracker.test.ts
git commit -m "feat(monitor): in-memory трекер обработки"
```

---

## Task 3: Инструментирование сервиса анализа

**Files:**
- Modify: `src/server/services/candidate-analysis.ts`

Осторожно: НЕ переписываем логику стадий, только добавляем трекинг и `lastAnalysisError`. Текущая структура (проверена):
- `findUnique` → `if (!candidate) return;` (трекер не трогаем — обработка не начиналась)
- `const link = candidate.portfolioLinks[0]; if (!link) { update ANALYSIS_FAILED; return; }`
- `scrapePortfolio` → `if (isDeadBehancePage(...)) { update ANALYSIS_FAILED; return; }`
- `parseResume` → best-effort блок анализа портфолио → `update(...)` → эмбеддинг
- внешний `catch` → `update ANALYSIS_FAILED`

- [ ] **Step 1: Импорт трекера**

В шапке файла, рядом с другими импортами `@/server/services/...`:
```ts
import { markStarted, markFinished } from "@/server/services/analysis-tracker";
```

- [ ] **Step 2: Обернуть обработку в markStarted/finally**

После получения `link` и ДО `scrapePortfolio` — отметить старт. Затем всё, что идёт после старта, обернуть в `try { ... } finally { markFinished(candidateId); }`, сохранив внутри существующий best-effort try/catch для стадии анализа портфолио. Ранние `return` для «нет кандидата» и «нет ссылки» остаются ДО `markStarted`.

Конкретно: блок от `const scrape = await scrapePortfolio(link);` до конца эмбеддинг-блока (включительно) заворачивается в `try/finally`. `markStarted` — строкой выше `const scrape`. Пример каркаса (сохранить существующие тела как есть):

```ts
    const link = candidate.portfolioLinks[0];
    if (!link) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "ANALYSIS_FAILED", lastAnalysisError: "Нет ссылки на портфолио" },
      });
      return;
    }

    markStarted({
      id: candidateId,
      name: candidate.name,
      portfolioLink: link,
      startedAt: Date.now(),
    });
    try {
      const scrape = await scrapePortfolio(link);
      // ... ВСЁ существующее тело: dead-page, parseResume, анализ, update, эмбеддинг ...
    } finally {
      markFinished(candidateId);
    }
```

**Важно:** внешний `try { ... } catch (err) { ... ANALYSIS_FAILED ... }` уже существует и охватывает весь код, включая `findUnique`. Новый `try/finally` — ВНУТРИ него, вокруг блока после `markStarted`. Итоговая вложенность: внешний try/catch (ставит ANALYSIS_FAILED) → внутри markStarted + try/finally(markFinished) → внутри best-effort try/catch анализа портфолио. Не перепутать уровни.

- [ ] **Step 3: Записать lastAnalysisError в 3 местах ANALYSIS_FAILED**

Во всех трёх `update` со `status: "ANALYSIS_FAILED"` добавить поле `lastAnalysisError`:

1. Нет ссылки (уже сделано в Step 2): `lastAnalysisError: "Нет ссылки на портфолио"`.
2. Мёртвая Behance-страница:
```ts
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { status: "ANALYSIS_FAILED", lastAnalysisError: "Страница портфолио недоступна (dead page)" },
      });
```
3. Внешний catch:
```ts
  } catch (err) {
    console.error(`[candidate-analysis] analyzeImportedCandidate failed for ${candidateId}:`, err);
    try {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          status: "ANALYSIS_FAILED",
          lastAnalysisError: String(err instanceof Error ? err.message : err).slice(0, 500),
        },
      });
    } catch (inner) {
      console.error(`[candidate-analysis] failed to mark ANALYSIS_FAILED for ${candidateId}:`, inner);
    }
  }
```

При успехе (`PORTFOLIO_ANALYZED`/`PARSED`) поле НЕ трогаем — не добавлять его в успешный `update`.

- [ ] **Step 4: Проверка**

Run: `npx tsc --noEmit`
Expected: без ошибок (в т.ч. `lastAnalysisError` признан Prisma-клиентом — Task 1 уже сгенерировал типы).

Run: `npx vitest run`
Expected: все существующие тесты проходят.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/candidate-analysis.ts
git commit -m "feat(monitor): трекинг обработки + lastAnalysisError в сервисе анализа"
```

---

## Task 4: Debug-роут + страница-монитор

**Files:**
- Create: `src/app/api/candidates/analyze-status-debug/route.ts`, `src/app/candidates/analyze-status/page.tsx`

- [ ] **Step 1: Роут**

`src/app/api/candidates/analyze-status-debug/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getProcessing } from "@/server/services/analysis-tracker";
import { IMPORT_SOURCES } from "@/lib/import-types";

export async function GET() {
  try {
    const sources = { in: [...IMPORT_SOURCES] };
    const [failed, pending] = await Promise.all([
      prisma.candidate.findMany({
        where: { status: "ANALYSIS_FAILED", source: sources },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: { id: true, name: true, lastAnalysisError: true, updatedAt: true },
      }),
      prisma.candidate.count({
        where: { status: "NEW", source: sources, portfolioLinks: { isEmpty: false } },
      }),
    ]);
    return NextResponse.json({
      processing: getProcessing(),
      failed,
      pending,
    });
  } catch (error) {
    console.error("GET analyze-status-debug error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Типчек + билд**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npm run build` → успех, роут `ƒ /api/candidates/analyze-status-debug` в списке.

- [ ] **Step 3: Страница**

`src/app/candidates/analyze-status/page.tsx` — `"use client"`.

Контракт:
- На mount и далее раз в 4с — `GET /api/candidates/analyze-status-debug`. Интервал чистится на unmount; guard от set-state-after-unmount (`let active = true` + сброс в cleanup).
- Состояние: `{ processing, failed, pending }` + `error`.
- **Шапка:** заголовок «Мониторинг анализа» + строка «Осталось в очереди: {pending} · В обработке: {processing.length} · С ошибкой: {failed.length}».
- **Секция «В обработке сейчас»:** для каждого элемента `processing` — имя (ссылка на `/candidates/{id}`), домен из `portfolioLink` (можно `new URL(link).hostname` в try/catch, при ошибке — сам link), и «идёт {сек} с», где секунды = `Math.round((Date.now() - startedAt)/1000)`, считаются на клиенте (обновляются вместе с поллингом, точности до секунды достаточно). Пусто → «Сейчас никто не обрабатывается».
- **Секция «Ошибки (последние 50)»:** для каждого `failed` — имя (ссылка на карточку), текст `lastAnalysisError` (если null — «—») в красном мелком тексте (`text-xs text-red-500`), и время `updatedAt` (можно `new Date(updatedAt).toLocaleTimeString("ru-RU")`). Пусто → «Ошибок нет».
- Ошибка запроса → неблокирующая плашка сверху, поллинг продолжается.
- Стиль — как у соседних страниц: контейнер `min-h-screen`, шапка `bg-card px-6 py-5 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]`, контент `p-6 max-w-4xl`, `text-sm`/`text-muted-foreground`. Ссылки на кандидатов — как в списке кандидатов (посмотреть `src/app/candidates/page.tsx` для класса ссылки/акцента). Без пагинации, фильтров и действий.

- [ ] **Step 4: Проверка**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → существующие тесты проходят.
НЕ запускать dev/build здесь — контроллер проверит визуально на живом прогоне.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/candidates/analyze-status-debug src/app/candidates/analyze-status
git commit -m "feat(monitor): debug-роут и страница мониторинга анализа"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx vitest run` — все тесты зелёные (существующие + трекер).
- [ ] `npx tsc --noEmit && npm run build` — чисто; роут `/api/candidates/analyze-status-debug` и страница `/candidates/analyze-status` в выводе билда.
- [ ] Ручной сквозной сценарий (dev-сервер уже поднят; в базе ~2200 кандидатов в очереди):
  1. Открыть `/candidates` → нажать «Проанализировать» (пачка на 10-20).
  2. Открыть `/candidates/analyze-status` → в секции «В обработке» видно 1-3 кандидата (`CONCURRENCY = 3`), у каждого растёт счётчик секунд, поллинг обновляет список.
  3. По мере завершения обработанные уходят из «В обработке».
  4. Если кто-то упал — появляется в «Ошибки» с осмысленным текстом `lastAnalysisError` (например, транзиентная ошибка скрейпера).
  5. Перейти по ссылке кандидата из любой секции → открывается его карточка.
- [ ] Убедиться, что пункт в сайдбаре НЕ появился (страница доступна только по прямой ссылке).
