# Bulk Candidate Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить страницу `/candidates/upload/bulk` — пакетная загрузка кандидатов по списку портфолио-ссылок с нумерованными полями, живым прогрессом и очередью на ревью для спорных случаев.

**Architecture:** Клиентская оркестрация: браузер вызывает существующий `POST /api/candidates/upload` последовательно, по одной ссылке. Бэкенд не меняется. Компоненты `DirectionPicker` и `DuplicateWarning` выносятся из одиночной загрузки в `src/components/` и переиспользуются в bulk-странице.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Vitest (добавляется)

---

## File Map

| Действие | Файл | Ответственность |
|---|---|---|
| NEW | `vitest.config.ts` | Конфигурация тест-раннера |
| NEW | `src/components/candidate-upload-types.ts` | Общие TypeScript-интерфейсы (CandidateResult, DuplicateInfo, NeedsDirectionInfo) |
| NEW | `src/components/candidate-direction-picker.tsx` | Компонент выбора направления (product/comm) |
| NEW | `src/components/candidate-duplicate-warning.tsx` | Компонент предупреждения о дубликате |
| MODIFY | `src/app/candidates/upload/page.tsx` | Заменить inline-компоненты на импорты из components/ + добавить ссылку «Загрузить пачкой» |
| NEW | `src/lib/parse-portfolio-links.ts` | Чистая функция: очистка, дедуп, валидация ссылок |
| NEW | `src/lib/parse-portfolio-links.test.ts` | Vitest-тесты для parsePortfolioLinks |
| NEW | `src/app/candidates/upload/bulk/use-bulk-upload.ts` | React-хук: очередь, fetch, state, stop |
| NEW | `src/app/candidates/upload/bulk/page.tsx` | Страница пакетной загрузки |
| MODIFY | `src/app/page.tsx` | Добавить кнопку «Загрузить пачкой» в быстрые действия |

---

## Task 1: Vitest Setup

В проекте нет тест-раннера. Добавляем Vitest для юнит-тестов чистых функций.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Установить зависимости**

```bash
cd /Users/slava/Documents/auf-match
npm install -D vitest
```

- [ ] **Создать `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Добавить test-скрипт в `package.json`**

Найди в `package.json` секцию `"scripts"` и добавь:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Написать smoke-тест для проверки**

Создай файл `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Запустить и убедиться что проходит**

```bash
npm test
```

Ожидаемый вывод: `✓ src/lib/smoke.test.ts > vitest smoke > works`

- [ ] **Удалить smoke-тест**

```bash
rm src/lib/smoke.test.ts
```

- [ ] **Закоммитить**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit tests"
```

---

## Task 2: Общие типы (candidate-upload-types.ts)

Интерфейсы `CandidateResult`, `DuplicateInfo`, `NeedsDirectionInfo` сейчас зашиты внутри `src/app/candidates/upload/page.tsx`. Выносим их в общий файл.

**Files:**
- Create: `src/components/candidate-upload-types.ts`

- [ ] **Создать файл с типами**

```ts
// src/components/candidate-upload-types.ts

export interface Experience {
  id: string;
  company: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  keyAchievements: string[];
  isBigtech: boolean;
  isStudio: boolean;
}

export interface CandidateResult {
  id: string;
  name: string;
  role: string;
  grade: string;
  yearsOfExperience: number | null;
  specializations: string[];
  domains: string[];
  segment: string | null;
  platforms: string[];
  skills: string[];
  tools: string[];
  location: string | null;
  email: string | null;
  telegramContact: string | null;
  linkedinUrl: string | null;
  aiSummary: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  aiConfidenceScore: number | null;
  portfolioLinks: string[];
  portfolioAnalysis?: unknown | null; // null = анализ портфолио не запускался
  experiences: Experience[];
}

export interface DuplicateInfo {
  reason: "email" | "LinkedIn";
  existing: {
    id: string;
    name: string;
    role: string;
    grade: string;
    email: string | null;
    linkedinUrl: string | null;
    createdAt: string;
  };
  parsedName: string;
}

export interface NeedsDirectionInfo {
  suggestedDirection: "product" | "communication";
  confidence: number;
  reasoning: string;
  parsedName: string;
}
```

- [ ] **Проверить TypeScript**

```bash
npx tsc --noEmit
```

Ожидаемый вывод: пусто (нет ошибок).

- [ ] **Закоммитить**

```bash
git add src/components/candidate-upload-types.ts
git commit -m "feat: add shared candidate upload types"
```

---

## Task 3: Extract DirectionPicker

**Files:**
- Create: `src/components/candidate-direction-picker.tsx`
- Modify: `src/app/candidates/upload/page.tsx`

- [ ] **Создать компонент `src/components/candidate-direction-picker.tsx`**

Скопировать тело функции `DirectionPicker` из `src/app/candidates/upload/page.tsx` (строки 598–696) и обернуть в новый файл. Добавить пропс `resetLabel` (для bulk-режима кнопка будет «Пропустить» вместо «Отмена»):

```tsx
// src/components/candidate-direction-picker.tsx
"use client";

import { Button } from "@/components/ui/button";
import type { NeedsDirectionInfo } from "@/components/candidate-upload-types";

interface Props {
  info: NeedsDirectionInfo;
  onChoose: (direction: "product" | "communication") => void;
  onReset: () => void;
  resetLabel?: string; // default "Отмена"
}

export function DirectionPicker({ info, onChoose, onReset, resetLabel = "Отмена" }: Props) {
  const confidenceLabel =
    info.confidence >= 70 ? "высокая" : info.confidence >= 50 ? "средняя" : "низкая";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-5 py-4">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
          Нужно уточнить направление дизайнера
        </p>
        <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
          Кандидат{" "}
          <span className="font-medium">{info.parsedName}</span> — роль не позволяет однозначно
          определить направление. AI предполагает{" "}
          <span className="font-medium">
            {info.suggestedDirection === "product" ? "продуктовый дизайн" : "коммуникационный дизайн"}
          </span>{" "}
          (уверенность: {confidenceLabel}, {info.confidence}%).
        </p>
        {info.reasoning && (
          <p className="mt-2 text-xs text-blue-700 dark:text-blue-400 italic">{info.reasoning}</p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Выберите, по каким критериям оценивать портфолио:
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChoose("product")}
          className={`[border-radius:var(--r-button)] border-2 p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 ${
            info.suggestedDirection === "product"
              ? "border-[#F97029]/50 bg-[#F97029]/5"
              : "border-border"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-blue-100 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <span className="text-sm font-semibold">Продуктовый</span>
            {info.suggestedDirection === "product" && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#F97029]">ИИ рекомендует</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            UX/UI, интерфейсы, дизайн-системы, продуктовое мышление, метрики
          </p>
        </button>

        <button
          onClick={() => onChoose("communication")}
          className={`[border-radius:var(--r-button)] border-2 p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 ${
            info.suggestedDirection === "communication"
              ? "border-[#F97029]/50 bg-[#F97029]/5"
              : "border-border"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-purple-100 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <span className="text-sm font-semibold">Коммуникационный</span>
            {info.suggestedDirection === "communication" && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#F97029]">ИИ рекомендует</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Брендинг, айдентика, полиграфия, типографика, рекламные материалы
          </p>
        </button>
      </div>

      <button
        onClick={onReset}
        className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
      >
        {resetLabel}
      </button>
    </div>
  );
}
```

- [ ] **Обновить `src/app/candidates/upload/page.tsx`**

Сверху файла:
1. Добавить импорт: `import { DirectionPicker } from "@/components/candidate-direction-picker";`
2. Добавить импорт: `import type { CandidateResult, DuplicateInfo, NeedsDirectionInfo, Experience } from "@/components/candidate-upload-types";`
3. Удалить inline-определения интерфейсов `Experience`, `CandidateResult`, `DuplicateInfo`, `NeedsDirectionInfo` (строки 12–67).
4. Удалить inline-функцию `DirectionPicker` (строки 598–696).

- [ ] **Проверить TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Убедиться, что страница `/candidates/upload` работает**

Запустить `npm run dev`, открыть `/candidates/upload`, убедиться что форма и DirectionPicker отображаются без ошибок (можно проверить визуально).

- [ ] **Закоммитить**

```bash
git add src/components/candidate-direction-picker.tsx src/app/candidates/upload/page.tsx
git commit -m "refactor: extract DirectionPicker to shared component"
```

---

## Task 4: Extract DuplicateWarning

**Files:**
- Create: `src/components/candidate-duplicate-warning.tsx`
- Modify: `src/app/candidates/upload/page.tsx`

- [ ] **Создать `src/components/candidate-duplicate-warning.tsx`**

Скопировать тело функции `DuplicateWarning` из `src/app/candidates/upload/page.tsx` (строки 531–596) и обернуть в файл. Добавить пропс `resetLabel`:

```tsx
// src/components/candidate-duplicate-warning.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import type { DuplicateInfo } from "@/components/candidate-upload-types";

interface Props {
  duplicate: DuplicateInfo;
  onForceCreate: () => void;
  onReset: () => void;
  resetLabel?: string; // default "Отмена"
}

export function DuplicateWarning({ duplicate, onForceCreate, onReset, resetLabel = "Отмена" }: Props) {
  const { existing, reason, parsedName } = duplicate;
  const createdDate = new Date(existing.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-5 py-4">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Похоже, этот кандидат уже есть в базе
        </p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          Совпадение по {reason === "email" ? "email-адресу" : "LinkedIn"}: резюме{" "}
          <span className="font-medium">{parsedName}</span> совпадает с карточкой{" "}
          <span className="font-medium">{existing.name}</span>, добавленной {createdDate}.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{existing.name}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {existing.role} · {existing.grade}
              </p>
              {existing.email && (
                <p className="text-xs text-muted-foreground mt-1">{existing.email}</p>
              )}
              {existing.linkedinUrl && (
                <p className="text-xs text-muted-foreground">{existing.linkedinUrl}</p>
              )}
            </div>
            <Link href={`/candidates/${existing.id}`} target="_blank">
              <Button variant="outline" size="sm">Открыть карточку</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onReset} className="flex-1">
          {resetLabel}
        </Button>
        <Button
          variant="outline"
          onClick={onForceCreate}
          className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/5"
        >
          Создать всё равно
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Обновить `src/app/candidates/upload/page.tsx`**

1. Добавить импорт: `import { DuplicateWarning } from "@/components/candidate-duplicate-warning";`
2. Удалить inline-функцию `DuplicateWarning` (строки 531–596).

- [ ] **Проверить TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Закоммитить**

```bash
git add src/components/candidate-duplicate-warning.tsx src/app/candidates/upload/page.tsx
git commit -m "refactor: extract DuplicateWarning to shared component"
```

---

## Task 5: parsePortfolioLinks + тесты

**Files:**
- Create: `src/lib/parse-portfolio-links.ts`
- Create: `src/lib/parse-portfolio-links.test.ts`

- [ ] **Написать тесты первыми (TDD)**

Создать `src/lib/parse-portfolio-links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePortfolioLinks } from "./parse-portfolio-links";

describe("parsePortfolioLinks", () => {
  it("возвращает пустой массив для пустого ввода", () => {
    expect(parsePortfolioLinks([])).toEqual([]);
  });

  it("отсеивает пустые строки и строки только из пробелов", () => {
    expect(parsePortfolioLinks(["", "  ", "\t"])).toEqual([]);
  });

  it("принимает валидные http/https URL", () => {
    const result = parsePortfolioLinks(["https://notion.so/portfolio"]);
    expect(result).toEqual(["https://notion.so/portfolio"]);
  });

  it("отсеивает невалидные URL", () => {
    expect(parsePortfolioLinks(["not-a-url", "ftp://old.com", "javascript:alert(1)"])).toEqual([]);
  });

  it("дедуплицирует одинаковые ссылки", () => {
    const result = parsePortfolioLinks([
      "https://example.com/portfolio",
      "https://example.com/portfolio",
    ]);
    expect(result).toHaveLength(1);
  });

  it("нормализует trailing slash — считает их одной ссылкой", () => {
    const result = parsePortfolioLinks([
      "https://example.com/portfolio",
      "https://example.com/portfolio/",
    ]);
    expect(result).toHaveLength(1);
  });

  it("нормализует регистр домена — считает их одной ссылкой", () => {
    const result = parsePortfolioLinks([
      "https://Example.COM/portfolio",
      "https://example.com/portfolio",
    ]);
    expect(result).toHaveLength(1);
  });

  it("сохраняет регистр path (не нормализует)", () => {
    const result = parsePortfolioLinks([
      "https://example.com/Portfolio",
      "https://example.com/portfolio",
    ]);
    // Path регистр-чувствителен — это разные ссылки
    expect(result).toHaveLength(2);
  });

  it("обрезает пробелы вокруг ссылок", () => {
    const result = parsePortfolioLinks(["  https://example.com/portfolio  "]);
    expect(result).toEqual(["https://example.com/portfolio"]);
  });

  it("обрабатывает смесь валидных и невалидных", () => {
    const result = parsePortfolioLinks([
      "https://notion.so/abc",
      "",
      "not-a-url",
      "https://behance.net/portfolio",
    ]);
    expect(result).toEqual(["https://notion.so/abc", "https://behance.net/portfolio"]);
  });

  it("нормализует root URL с trailing slash и без", () => {
    // https://example.com и https://example.com/ — одна и та же ссылка
    const result = parsePortfolioLinks(["https://example.com", "https://example.com/"]);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Запустить тесты — убедиться что ПАДАЮТ (функции нет)**

```bash
npm test
```

Ожидаемый вывод: ошибка `Cannot find module './parse-portfolio-links'`

- [ ] **Реализовать `src/lib/parse-portfolio-links.ts`**

```ts
/**
 * Нормализует и дедуплицирует список портфолио-ссылок.
 * - Обрезает пробелы
 * - Отсеивает пустые строки
 * - Отсеивает невалидные URL (принимает только http/https)
 * - Нормализует: trailing slash, регистр домена
 * - Дедуплицирует
 */
export function parsePortfolioLinks(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      continue; // невалидный URL
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") continue;

    // Нормализация: lowercase hostname, убрать trailing slash из pathname
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.endsWith("/") && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1);
    }

    const normalized = url.toString();
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
```

- [ ] **Запустить тесты — убедиться что ПРОХОДЯТ**

```bash
npm test
```

Ожидаемый вывод: все тесты `✓`

- [ ] **Закоммитить**

```bash
git add src/lib/parse-portfolio-links.ts src/lib/parse-portfolio-links.test.ts
git commit -m "feat: add parsePortfolioLinks util with vitest tests"
```

---

## Task 6: useBulkUpload hook

Весь оркестрационный код. Чистая логика, никаких UI-зависимостей.

**Files:**
- Create: `src/app/candidates/upload/bulk/use-bulk-upload.ts`

- [ ] **Создать хук**

```ts
// src/app/candidates/upload/bulk/use-bulk-upload.ts
"use client";

import { useState, useRef, useCallback } from "react";
import type { CandidateResult, DuplicateInfo, NeedsDirectionInfo } from "@/components/candidate-upload-types";

export type BulkRowStatus =
  | "idle"
  | "pending"
  | "processing"
  | "created"
  | "needs-direction"
  | "duplicate"
  | "skipped"
  | "error";

export interface BulkRow {
  id: string;
  url: string;
  status: BulkRowStatus;
  candidate?: CandidateResult;
  duplicate?: DuplicateInfo;
  needsDirection?: NeedsDirectionInfo;
  error?: string;
  noPortfolioAnalysis?: boolean; // true = создан, но анализ портфолио не запускался
}

type UploadOneResult =
  | { status: "created"; candidate: CandidateResult }
  | { status: "needs-direction"; needsDirection: NeedsDirectionInfo }
  | { status: "duplicate"; duplicate: DuplicateInfo };

async function uploadOne(
  url: string,
  options?: { direction?: "product" | "communication"; forceCreate?: boolean },
): Promise<UploadOneResult> {
  const formData = new FormData();
  formData.append("portfolioLink", url);
  if (options?.direction) formData.append("direction", options.direction);
  if (options?.forceCreate) formData.append("forceCreate", "true");

  const res = await fetch("/api/candidates/upload", { method: "POST", body: formData });
  const data = await res.json();

  if (res.status === 201) {
    return { status: "created", candidate: data as CandidateResult };
  }
  if (res.status === 409 && data.needsDirection) {
    // data = { needsDirection: true, suggestedDirection, confidence, reasoning, parsedName }
    // data has all NeedsDirectionInfo fields — casting the whole object is correct
    return { status: "needs-direction", needsDirection: data as NeedsDirectionInfo };
  }
  if (res.status === 409 && data.duplicate) {
    // data = { duplicate: true, reason, existing, parsedName }
    // data has all DuplicateInfo fields — casting the whole object is correct
    // (data.duplicate is the boolean flag used for detection; result.duplicate is the full data object)
    return { status: "duplicate", duplicate: data as DuplicateInfo };
  }
  throw new Error(data.error || `Ошибка ${res.status}`);
}

function updateRow(
  setRows: React.Dispatch<React.SetStateAction<BulkRow[]>>,
  id: string,
  patch: Partial<BulkRow>,
) {
  setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

export function useBulkUpload() {
  const [rows, setRows] = useState<BulkRow[]>([{ id: "0", url: "", status: "idle" }]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  // ── Input management ──────────────────────────────────────────────

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { id: String(Date.now()), url: "", status: "idle" },
    ]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev; // нельзя удалить последнее поле
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const setUrl = useCallback((id: string, url: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, url } : r)));
  }, []);

  // ── Processing ────────────────────────────────────────────────────

  const start = useCallback(
    async (urlList: string[]) => {
      stopRef.current = false;
      setRunning(true);

      // Инициализировать строки
      const initialRows: BulkRow[] = urlList.map((url, i) => ({
        id: String(i),
        url,
        status: "pending",
      }));
      setRows(initialRows);

      for (const row of initialRows) {
        if (stopRef.current) {
          setRows((prev) =>
            prev.map((r) => (r.status === "pending" ? { ...r, status: "idle" } : r)),
          );
          break;
        }

        updateRow(setRows, row.id, { status: "processing" });

        try {
          const result = await uploadOne(row.url);
          if (result.status === "created") {
            updateRow(setRows, row.id, {
              status: "created",
              candidate: result.candidate,
              noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
            });
          } else if (result.status === "needs-direction") {
            updateRow(setRows, row.id, {
              status: "needs-direction",
              needsDirection: result.needsDirection,
            });
          } else if (result.status === "duplicate") {
            updateRow(setRows, row.id, {
              status: "duplicate",
              duplicate: result.duplicate,
            });
          }
        } catch (err) {
          updateRow(setRows, row.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Ошибка обработки",
          });
        }
      }

      setRunning(false);
    },
    [],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  // ── Resolution ────────────────────────────────────────────────────

  const resolveDirection = useCallback(
    async (rowId: string, direction: "product" | "communication") => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      updateRow(setRows, rowId, { status: "processing", needsDirection: undefined });
      try {
        const result = await uploadOne(row.url, { direction });
        if (result.status === "created") {
          updateRow(setRows, rowId, {
            status: "created",
            candidate: result.candidate,
            noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
          });
        } else {
          updateRow(setRows, rowId, { status: "error", error: "Неожиданный ответ от сервера" });
        }
      } catch (err) {
        updateRow(setRows, rowId, {
          status: "error",
          error: err instanceof Error ? err.message : "Ошибка",
        });
      }
    },
    [rows],
  );

  const resolveForceCreate = useCallback(
    async (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      updateRow(setRows, rowId, { status: "processing", duplicate: undefined });
      try {
        const result = await uploadOne(row.url, { forceCreate: true });
        if (result.status === "created") {
          updateRow(setRows, rowId, {
            status: "created",
            candidate: result.candidate,
            noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
          });
        } else {
          updateRow(setRows, rowId, { status: "error", error: "Неожиданный ответ от сервера" });
        }
      } catch (err) {
        updateRow(setRows, rowId, {
          status: "error",
          error: err instanceof Error ? err.message : "Ошибка",
        });
      }
    },
    [rows],
  );

  const skipRow = useCallback((rowId: string) => {
    updateRow(setRows, rowId, { status: "skipped" });
  }, []);

  const retryRow = useCallback(
    async (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      updateRow(setRows, rowId, { status: "processing", error: undefined });
      try {
        const result = await uploadOne(row.url);
        if (result.status === "created") {
          updateRow(setRows, rowId, {
            status: "created",
            candidate: result.candidate,
            noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
          });
        } else if (result.status === "needs-direction") {
          updateRow(setRows, rowId, { status: "needs-direction", needsDirection: result.needsDirection });
        } else if (result.status === "duplicate") {
          updateRow(setRows, rowId, { status: "duplicate", duplicate: result.duplicate });
        }
      } catch (err) {
        updateRow(setRows, rowId, {
          status: "error",
          error: err instanceof Error ? err.message : "Ошибка",
        });
      }
    },
    [rows],
  );

  // ── Derived state ─────────────────────────────────────────────────

  const phase: "input" | "processing" | "done" =
    rows.every((r) => r.status === "idle")
      ? "input"
      : running
        ? "processing"
        : "done";

  const counts = {
    created: rows.filter((r) => r.status === "created").length,
    review: rows.filter((r) => r.status === "needs-direction" || r.status === "duplicate").length,
    error: rows.filter((r) => r.status === "error").length,
    processed: rows.filter((r) => r.status !== "pending" && r.status !== "idle").length,
    total: rows.filter((r) => r.status !== "idle").length,
  };

  return {
    rows,
    running,
    phase,
    counts,
    // input
    addRow,
    removeRow,
    setUrl,
    start,
    stop,
    // resolution
    resolveDirection,
    resolveForceCreate,
    skipRow,
    retryRow,
  };
}
```

- [ ] **Проверить TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Закоммитить**

```bash
git add src/app/candidates/upload/bulk/use-bulk-upload.ts
git commit -m "feat: add useBulkUpload orchestration hook"
```

---

## Task 7: Страница пакетной загрузки

**Files:**
- Create: `src/app/candidates/upload/bulk/page.tsx`

- [ ] **Создать страницу**

```tsx
// src/app/candidates/upload/bulk/page.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirectionPicker } from "@/components/candidate-direction-picker";
import { DuplicateWarning } from "@/components/candidate-duplicate-warning";
import { parsePortfolioLinks } from "@/lib/parse-portfolio-links";
import { useBulkUpload } from "./use-bulk-upload";
import type { BulkRow } from "./use-bulk-upload";

export default function BulkUploadPage() {
  const {
    rows,
    running,
    phase,
    counts,
    addRow,
    removeRow,
    setUrl,
    start,
    stop,
    resolveDirection,
    resolveForceCreate,
    skipRow,
    retryRow,
  } = useBulkUpload();

  // Предупреждение при уходе во время обработки (только full-page reload)
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const handleStart = () => {
    const urls = parsePortfolioLinks(rows.map((r) => r.url));
    if (urls.length === 0) return;
    start(urls);
  };

  const validUrls = parsePortfolioLinks(rows.map((r) => r.url));

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between bg-card px-6 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <Link
          href="/candidates/upload"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Загрузка кандидатов
        </Link>
        {running && (
          <button
            onClick={stop}
            className="text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            Стоп
          </button>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-16">
        <div className="mt-8 mb-6">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            Загрузить пачкой
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Добавьте ссылки на портфолио — AI обработает каждого и создаст карточку
          </p>
        </div>

        {/* ── Phase: INPUT ─────────────────────────────────────── */}
        {phase === "input" && (
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.id} className="flex items-center gap-3">
                {/* Номер */}
                <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground/60">
                  {index + 1}
                </span>
                {/* Поле */}
                <Input
                  type="url"
                  placeholder="https://notion.so/..."
                  value={row.url}
                  onChange={(e) => setUrl(row.id, e.target.value)}
                  className="flex-1"
                />
                {/* Удалить */}
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(row.id)}
                    className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
                    aria-label="Удалить строку"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Добавить строку */}
            <button
              onClick={addRow}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors ml-8"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Добавить ещё кандидата
            </button>

            {/* Кнопка запуска */}
            <div className="pt-2">
              <Button
                onClick={handleStart}
                disabled={validUrls.length === 0}
                className="w-full"
                style={{ background: validUrls.length > 0 ? "#F97029" : undefined }}
              >
                {validUrls.length > 0
                  ? `Обработать ${validUrls.length} ${pluralLinks(validUrls.length)}`
                  : "Добавьте хотя бы одну ссылку"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Phase: PROCESSING / DONE ──────────────────────────── */}
        {(phase === "processing" || phase === "done") && (
          <div className="space-y-4">
            {/* Прогресс */}
            {phase === "processing" && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Обрабатываем {counts.processed} из {counts.total}…
                </span>
                <span className="text-muted-foreground/50 text-xs">
                  Это может занять до 3 минут на ссылку
                </span>
              </div>
            )}

            {/* Итог после завершения */}
            {phase === "done" && (
              <div className="soft-card flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-4 text-sm">
                  <span className="text-emerald-600 font-medium">✓ Создано {counts.created}</span>
                  {counts.review > 0 && (
                    <span className="text-amber-600 font-medium">⚠ На ревью {counts.review}</span>
                  )}
                  {counts.error > 0 && (
                    <span className="text-destructive font-medium">✕ Ошибок {counts.error}</span>
                  )}
                </div>
                <Link href="/candidates">
                  <Button variant="outline" size="sm">К списку кандидатов →</Button>
                </Link>
              </div>
            )}

            {/* Список строк */}
            <div className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <BulkRowView
                  key={row.id}
                  row={row}
                  index={index}
                  onResolveDirection={(dir) => resolveDirection(row.id, dir)}
                  onForceCreate={() => resolveForceCreate(row.id)}
                  onSkip={() => skipRow(row.id)}
                  onRetry={() => retryRow(row.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BulkRowView ───────────────────────────────────────────────────────

function BulkRowView({
  row,
  index,
  onResolveDirection,
  onForceCreate,
  onSkip,
  onRetry,
}: {
  row: BulkRow;
  index: number;
  onResolveDirection: (dir: "product" | "communication") => void;
  onForceCreate: () => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="soft-card space-y-3">
      {/* Заголовок строки */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground/50">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{row.url}</p>
          {row.status === "created" && row.candidate && (
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <Link
                href={`/candidates/${row.candidate.id}`}
                className="text-xs text-[#F97029] hover:underline"
              >
                {row.candidate.name}
              </Link>
              {row.noPortfolioAnalysis && (
                <span className="text-xs text-muted-foreground/60">· без анализа портфолио</span>
              )}
            </div>
          )}
          {row.status === "error" && row.error && (
            <p className="mt-0.5 text-xs text-destructive">{row.error}</p>
          )}
        </div>
        {/* Статус-значок */}
        <StatusBadge status={row.status} />
      </div>

      {/* Ревью-очередь: направление */}
      {row.status === "needs-direction" && row.needsDirection && (
        <div className="ml-8">
          <DirectionPicker
            info={row.needsDirection}
            onChoose={onResolveDirection}
            onReset={onSkip}
            resetLabel="Пропустить"
          />
        </div>
      )}

      {/* Ревью-очередь: дубликат */}
      {row.status === "duplicate" && row.duplicate && (
        <div className="ml-8">
          <DuplicateWarning
            duplicate={row.duplicate}
            onForceCreate={onForceCreate}
            onReset={onSkip}
            resetLabel="Пропустить"
          />
        </div>
      )}

      {/* Повтор при ошибке */}
      {row.status === "error" && (
        <div className="ml-8">
          <button
            onClick={onRetry}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Повторить
          </button>
        </div>
      )}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  idle: "ожидает",
  pending: "ожидает",
  processing: "обрабатывается",
  created: "создан",
  "needs-direction": "на ревью",
  duplicate: "на ревью",
  skipped: "пропущен",
  error: "ошибка",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
  processing: "bg-blue-100 text-blue-700",
  created: "bg-[var(--tint-green-bg)] text-[var(--tint-green-fg)]",
  "needs-direction": "bg-amber-100 text-amber-700",
  duplicate: "bg-amber-100 text-amber-700",
  skipped: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status === "processing" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function pluralLinks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "ссылок";
  if (mod10 === 1) return "ссылку";
  if (mod10 >= 2 && mod10 <= 4) return "ссылки";
  return "ссылок";
}
```

- [ ] **Проверить TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Закоммитить**

```bash
git add src/app/candidates/upload/bulk/
git commit -m "feat: add bulk upload page with numbered fields and review queue"
```

---

## Task 8: Точки входа

**Files:**
- Modify: `src/app/candidates/upload/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Добавить ссылку «Загрузить пачкой» на страницу одиночной загрузки**

В `src/app/candidates/upload/page.tsx` найди тулбар (div с `sticky top-0`). Добавь ссылку справа в тулбаре:

```tsx
{/* В тулбаре, справа */}
<Link
  href="/candidates/upload/bulk"
  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
>
  Загрузить пачкой
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
</Link>
```

Тулбар должен стать `justify-between` чтобы ссылки расположились по краям.

- [ ] **Добавить быстрое действие на главную страницу**

В `src/app/page.tsx` найди блок «Действия» (div с `className="soft-card flex flex-col gap-3"`). После кнопки `+ Создать вакансию` добавь:

```tsx
<Link
  href="/candidates/upload/bulk"
  className="pill pill--outline flex justify-center"
  style={{ height: "40px", fontSize: "13px" }}
>
  + Загрузить пачкой
</Link>
```

- [ ] **Проверить TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Финальная ручная проверка**

Запустить приложение: `npm run dev`

Пройти чек-лист:
- [ ] `/` — есть кнопка «Загрузить пачкой» в быстрых действиях
- [ ] `/candidates/upload` — есть ссылка «Загрузить пачкой» в тулбаре
- [ ] `/candidates/upload/bulk` — отображается список с одним пустым полем и номером `1`
- [ ] Нажать «+ Добавить ещё кандидата» — появляется второе поле с номером `2`
- [ ] Ввести невалидный URL — кнопка «Обработать» остаётся неактивной
- [ ] Ввести валидный URL — кнопка активируется
- [ ] Удалить строку — нумерация пересчитывается
- [ ] Ввести реальную ссылку на портфолио, нажать «Обработать» — строка переходит в «обрабатывается», затем в «создан»
- [ ] Нажать «Стоп» во время обработки — незапущенные строки возвращаются в «ожидает»

- [ ] **Закоммитить**

```bash
git add src/app/candidates/upload/page.tsx src/app/page.tsx
git commit -m "feat: add bulk upload entry points on home and single upload pages"
```
