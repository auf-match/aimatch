# Общая воронка по всем вакансиям — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новая страница `/pipeline` («Этапы» в сайдбаре) — канбан-доска пайплайна сразу по всем открытым вакансиям, с фильтром по вакансиям и перемещением кандидатов по этапам прямо с доски.

**Architecture:** Новый API `GET /api/pipeline` (кросс-вакансийная версия существующего `/api/vacancies/[id]/pipeline`). Отдельный клиентский компонент `all-pipelines-board.tsx` (адаптация `pipeline-board.tsx`: карточка показывает вакансию, сверху фильтр-мультиселект, move знает `vacancyId` из карточки). Перемещение — через существующий `POST /api/vacancies/{vacancyId}/pipeline/{candidateId}/move`. Переиспользуем `@/lib/pipeline` (этапы, цвета, `groupPipelineByStage`, `daysInStage`, `getPipelineActor`). Новой чистой логики нет → новых unit-тестов нет; проверка API/UI вручную.

**Tech Stack:** Next.js 15 (App Router), Prisma + PostgreSQL, React 19, Tailwind v4. Spec: `docs/superpowers/specs/2026-07-02-all-pipelines-board-design.md`.

---

## Карта файлов

**Создаются:**
- `src/app/api/pipeline/route.ts` — `GET` кросс-вакансийной воронки (открытые вакансии, фильтр `?vacancyIds=`).
- `src/app/pipeline/page.tsx` — страница «Этапы» (заголовок + фильтр + `<AllPipelinesBoard>`).
- `src/app/pipeline/all-pipelines-board.tsx` — клиентский компонент доски.

**Изменяются:**
- `src/components/sidebar.tsx` — пункт «Этапы» в `NAV_ITEMS`.

**Важное отличие от `pipeline-board.tsx`:** тот использует `bg-card` для колонок/карточек, что работает ТОЛЬКО потому, что на странице вакансии доска обёрнута в `<Card>` (даёт непрозрачный фон). На голой странице `/pipeline` родителя-Card нет, а `bg-card` в Tailwind v4 этого проекта — нерабочая утилита (прозрачно). Поэтому в новом компоненте для колонок и карточек используем `bg-white dark:bg-zinc-900` (проектная конвенция для непрозрачных поверхностей), НЕ `bg-card`.

---

## Task 1: API общей воронки

**Files:**
- Create: `src/app/api/pipeline/route.ts`

- [ ] **Step 1: Реализовать GET**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

// GET — данные общей воронки по всем ОТКРЫТЫМ вакансиям.
// Query: ?vacancyIds=id1,id2 — опционально сузить набор (AND с фильтром OPEN).
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("vacancyIds");
    const requestedIds = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const pipelines = await prisma.pipeline.findMany({
      where: {
        vacancy: { status: "OPEN" },
        ...(requestedIds ? { vacancyId: { in: requestedIds } } : {}),
      },
      include: {
        candidate: { select: { id: true, name: true, role: true, grade: true } },
        vacancy: { select: { id: true, title: true, clientName: true } },
        transitions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    // overall score: DetailedScore -> MatchResult -> null.
    // Скоры уникальны по паре (candidateId, vacancyId), поэтому ключ — обе части.
    const pairs = pipelines.map((p) => ({ candidateId: p.candidateId, vacancyId: p.vacancyId }));
    const candidateIds = [...new Set(pairs.map((x) => x.candidateId))];
    const vacancyIds = [...new Set(pairs.map((x) => x.vacancyId))];

    const [detailed, matches] = await Promise.all([
      prisma.detailedScore.findMany({
        where: { candidateId: { in: candidateIds }, vacancyId: { in: vacancyIds } },
        select: { candidateId: true, vacancyId: true, overallScore: true },
      }),
      prisma.matchResult.findMany({
        where: { candidateId: { in: candidateIds }, vacancyId: { in: vacancyIds } },
        select: { candidateId: true, vacancyId: true, overallScore: true },
      }),
    ]);
    const key = (c: string, v: string) => `${c}::${v}`;
    const scoreByPair = new Map<string, number>();
    for (const m of matches) scoreByPair.set(key(m.candidateId, m.vacancyId), m.overallScore);
    for (const d of detailed) scoreByPair.set(key(d.candidateId, d.vacancyId), d.overallScore);

    const result = pipelines.map((p) => ({
      candidateId: p.candidateId,
      candidate: p.candidate,
      vacancyId: p.vacancyId,
      vacancy: p.vacancy,
      stage: p.stage,
      score: scoreByPair.get(key(p.candidateId, p.vacancyId)) ?? null,
      lastTransitionAt: p.transitions[0]?.createdAt ?? p.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/pipeline error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

Примечание: score-map ключуется по паре (кандидат, вакансия), а не только по кандидату — потому что на общей доске один кандидат может встречаться по нескольким вакансиям с разными скорами. Это отличие от `/api/vacancies/[id]/pipeline`, где вакансия одна.

- [ ] **Step 2: Проверить типы и сборку**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npm run build` → успех; в списке роутов появляется `ƒ /api/pipeline`.

- [ ] **Step 3: Ручная проверка (dev-сервер)**

Запустить `npm run dev`. Затем:
```bash
# все открытые вакансии
curl -s localhost:3000/api/pipeline | head -c 800
# сузить по одной вакансии (взять реальный id из БД)
curl -s "localhost:3000/api/pipeline?vacancyIds=<VAC_ID>" | head -c 800
```
Expected: массив записей `{ candidateId, candidate, vacancyId, vacancy: {id,title,clientName}, stage, score, lastTransitionAt }`. Записи только по вакансиям со `status: OPEN`. Фильтр сужает набор.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pipeline/route.ts
git commit -m "feat(all-pipelines): API общей воронки по всем открытым вакансиям"
```

---

## Task 2: Компонент доски `all-pipelines-board.tsx`

**Files:**
- Create: `src/app/pipeline/all-pipelines-board.tsx`

Это адаптация `src/app/vacancies/[id]/pipeline-board.tsx` (прочитать его как образец). Отличия:
1. Данные из `GET /api/pipeline` (+ фильтр по вакансиям).
2. Тип строки `PipelineRow` расширен полями `vacancyId` и `vacancy: { id, title, clientName }`.
3. Карточка показывает под именем кандидата — название вакансии + клиента.
4. `handleMove` шлёт на `/api/vacancies/{row.vacancyId}/pipeline/{candidateId}/move` (vacancyId из строки, не из props).
5. Меню перемещения: пункты этапов (без текущего) + «Открыть карточку кандидата» (`/candidates/{candidateId}`) + «Открыть вакансию» (`/vacancies/{vacancyId}`).
6. Сверху — панель с мультиселект-фильтром вакансий и счётчиком.
7. **Фон колонок и карточек — `bg-white dark:bg-zinc-900`**, НЕ `bg-card` (см. примечание в карте файлов).
8. При смене фильтра — refetch с `?vacancyIds=`.
9. Оптимистичное обновление при move + revert рефетчем (как в оригинале), но revert-рефетч должен уважать текущий фильтр (тот же querystring).

- [ ] **Step 1: Реализовать компонент**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  groupPipelineByStage,
  daysInStage,
  getPipelineActor,
} from "@/lib/pipeline";
import { ROLE_LABELS, GRADE_LABELS } from "@/lib/constants";
import type { PipelineStage } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────

interface PipelineCandidate { id: string; name: string; role: string; grade: string; }
interface PipelineVacancy { id: string; title: string; clientName: string | null; }

interface PipelineRow {
  candidateId: string;
  candidate: PipelineCandidate;
  vacancyId: string;
  vacancy: PipelineVacancy;
  stage: PipelineStage;
  score: number | null;
  lastTransitionAt: string;
}

// Открытая вакансия для фильтра (из GET /api/vacancies).
interface VacancyOption { id: string; title: string; clientName: string | null; status: string; }

// ── Helpers ──────────────────────────────────────────────────────────

function scoreBadgeClasses(score: number): string {
  if (score >= 75) return "text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10";
  if (score >= 50) return "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-400/10";
  return "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-400/10";
}
function formatDays(days: number): string {
  return days === 0 ? "сегодня" : `${days} дн.`;
}

// ── Move menu ────────────────────────────────────────────────────────

interface MoveMenuProps {
  row: PipelineRow;
  anchorRect: DOMRect;
  onMove: (stage: PipelineStage) => void;
  onOpenCandidate: () => void;
  onOpenVacancy: () => void;
  onClose: () => void;
}

function MoveMenu({ row, anchorRect, onMove, onOpenCandidate, onOpenVacancy, onClose }: MoveMenuProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const popupWidth = 240;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;
  if (typeof window !== "undefined") {
    if (left + popupWidth > window.innerWidth - 16) left = window.innerWidth - popupWidth - 16;
    if (top + 420 > window.innerHeight - 16) top = anchorRect.top - 420 - 8;
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={popupRef}
        className="absolute rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-[0_20px_60px_rgba(0,0,0,.4)] p-1.5"
        style={{ left, top, width: popupWidth }}
      >
        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {row.candidate.name}
        </div>
        <div className="px-2.5 pt-0.5 pb-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
          Переместить на этап
        </div>
        {PIPELINE_STAGE_ORDER.filter((s) => s !== row.stage).map((stage) => (
          <button
            key={stage}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
            onClick={() => { onMove(stage); onClose(); }}
          >
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: PIPELINE_STAGE_COLORS[stage] }} />
            {PIPELINE_STAGE_LABELS[stage]}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
          onClick={() => { onOpenCandidate(); onClose(); }}
        >
          <span className="text-muted-foreground">↗</span> Открыть карточку кандидата
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
          onClick={() => { onOpenVacancy(); onClose(); }}
        >
          <span className="text-muted-foreground">↗</span> Открыть вакансию
        </button>
      </div>
    </div>
  );
}

// ── Candidate card ───────────────────────────────────────────────────

function CandidateCard({ row, onMenu }: { row: PipelineRow; onMenu: (row: PipelineRow, rect: DOMRect) => void }) {
  const days = daysInStage(new Date(row.lastTransitionAt), new Date());
  const isRejected = row.stage === "REJECTED";
  return (
    <div
      className={`rounded-lg border border-border bg-white dark:bg-zinc-900 cursor-pointer px-2.5 pt-2.5 pb-2 transition-colors hover:border-border/80 hover:bg-muted/30 ${isRejected ? "opacity-60" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onMenu(row, (e.currentTarget as HTMLElement).getBoundingClientRect());
      }}
    >
      <div className="text-[13px] font-medium truncate text-foreground mb-0.5">{row.candidate.name}</div>
      <div className="text-[11px] text-muted-foreground mb-0.5">
        {ROLE_LABELS[row.candidate.role] ?? row.candidate.role}
        {row.candidate.grade && <> · {GRADE_LABELS[row.candidate.grade] ?? row.candidate.grade}</>}
      </div>
      <div className="text-[11px] text-muted-foreground/70 truncate mb-1.5">
        {row.vacancy.title}{row.vacancy.clientName ? ` · ${row.vacancy.clientName}` : ""}
      </div>
      <div className="flex items-center gap-1.5">
        {row.score !== null && (
          <span className={`text-[11px] font-semibold rounded px-1.5 py-0.5 ${scoreBadgeClasses(row.score)}`}>
            {row.score}%
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">{formatDays(days)}</span>
      </div>
    </div>
  );
}

// ── Board column ─────────────────────────────────────────────────────

function BoardColumn({ stage, rows, onCardMenu }: { stage: PipelineStage; rows: PipelineRow[]; onCardMenu: (row: PipelineRow, rect: DOMRect) => void }) {
  return (
    <div className="w-[220px] shrink-0 rounded-xl border border-border bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PIPELINE_STAGE_COLORS[stage] }} />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.4px] text-muted-foreground flex-1 truncate">
          {PIPELINE_STAGE_LABELS[stage]}
        </span>
        <span className="text-[11px] text-muted-foreground/50 font-medium">{rows.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-2 min-h-[60px]">
        {rows.length === 0
          ? <div className="text-center text-[11px] text-muted-foreground/30 py-2">—</div>
          : rows.map((row) => <CandidateCard key={`${row.candidateId}::${row.vacancyId}`} row={row} onMenu={onCardMenu} />)}
      </div>
    </div>
  );
}

// ── Vacancy filter (мультиселект) ────────────────────────────────────

function VacancyFilter({
  options, selected, onToggle, onReset,
}: {
  options: VacancyOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = selected.size === 0 ? "все" : `выбрано ${selected.size}`;

  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-zinc-900 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        Вакансия: {label} <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-40" onMouseDown={(e) => {
          if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }} />
      )}
      {open && (
        <div className="absolute z-50 mt-1 max-h-[320px] w-[300px] overflow-y-auto rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-[0_20px_60px_rgba(0,0,0,.3)] p-1.5">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60"
            onClick={() => { onReset(); }}
          >
            {selected.size === 0 ? "✓ " : ""}Все вакансии
          </button>
          <div className="my-1 h-px bg-border" />
          {options.map((v) => (
            <button
              key={v.id}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60"
              onClick={() => onToggle(v.id)}
            >
              <span className="w-4 shrink-0">{selected.has(v.id) ? "✓" : ""}</span>
              <span className="truncate">{v.title}{v.clientName ? ` · ${v.clientName}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function AllPipelinesBoard() {
  const router = useRouter();
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [vacancies, setVacancies] = useState<VacancyOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // пусто = все
  const [loading, setLoading] = useState(true);
  const [menuState, setMenuState] = useState<{ row: PipelineRow; rect: DOMRect } | null>(null);

  // querystring для текущего фильтра
  const qs = useMemo(() => {
    if (selected.size === 0) return "";
    return `?vacancyIds=${[...selected].join(",")}`;
  }, [selected]);

  // Загрузка списка открытых вакансий для фильтра (один раз).
  useEffect(() => {
    let active = true;
    fetch(`/api/vacancies`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const list: VacancyOption[] = (data.data ?? [])
          .filter((v: VacancyOption) => v.status === "OPEN")
          .map((v: VacancyOption) => ({ id: v.id, title: v.title, clientName: v.clientName, status: v.status }));
        setVacancies(list);
      })
      .catch((err) => { if (active) console.error("vacancies fetch error:", err); });
    return () => { active = false; };
  }, []);

  // Загрузка доски (при смене фильтра).
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/pipeline${qs}`)
      .then((r) => r.json())
      .then((data: PipelineRow[]) => { if (active) setRows(data); })
      .catch((err) => { if (active) console.error("pipeline fetch error:", err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [qs]);

  const handleMove = async (targetRow: PipelineRow, toStage: PipelineStage) => {
    const actor = getPipelineActor();
    setRows((prev) =>
      prev.map((r) =>
        r.candidateId === targetRow.candidateId && r.vacancyId === targetRow.vacancyId
          ? { ...r, stage: toStage, lastTransitionAt: new Date().toISOString() }
          : r,
      ),
    );
    const revert = async () => {
      const fresh = await fetch(`/api/pipeline${qs}`);
      const data: PipelineRow[] = await fresh.json();
      setRows(data);
    };
    try {
      const res = await fetch(
        `/api/vacancies/${targetRow.vacancyId}/pipeline/${targetRow.candidateId}/move`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStage, actor }) },
      );
      if (!res.ok) { console.error("Move failed, reverting"); await revert(); }
    } catch (err) {
      console.error("Move error:", err); await revert();
    }
  };

  const grouped = groupPipelineByStage(rows);
  const isEmpty = rows.length === 0;

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div>
      {/* Панель фильтра + счётчик */}
      <div className="flex items-center gap-3 mb-4">
        <VacancyFilter
          options={vacancies}
          selected={selected}
          onToggle={toggle}
          onReset={() => setSelected(new Set())}
        />
        <span className="text-[13px] text-muted-foreground">{rows.length} кандидатов в воронке</span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Загрузка воронки...</div>
      ) : (
        <div className="relative">
          {isEmpty && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none z-10">
              Пока никто не в воронке
            </p>
          )}
          <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
            <div className={`flex gap-2.5 min-w-max ${isEmpty ? "opacity-30" : ""}`}>
              {PIPELINE_STAGE_ORDER.map((stage) => (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  rows={grouped[stage]}
                  onCardMenu={(row, rect) => setMenuState({ row, rect })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {menuState && (
        <MoveMenu
          row={menuState.row}
          anchorRect={menuState.rect}
          onMove={(toStage) => handleMove(menuState.row, toStage)}
          onOpenCandidate={() => router.push(`/candidates/${menuState.row.candidateId}`)}
          onOpenVacancy={() => router.push(`/vacancies/${menuState.row.vacancyId}`)}
          onClose={() => setMenuState(null)}
        />
      )}
    </div>
  );
}
```

Примечание про `groupPipelineByStage`: она группирует по `stage` и ключом карточки в оригинале был `candidateId`. Здесь на общей доске возможны дубли `candidateId` (тот же кандидат по разным вакансиям), поэтому React-ключ карточки — `${candidateId}::${vacancyId}` (уже учтено в `BoardColumn`).

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → существующие тесты проходят (новых нет).
НЕ запускать `npm run dev`/`npm run build` — контроллер проверит визуально.

- [ ] **Step 3: Commit**

```bash
git add src/app/pipeline/all-pipelines-board.tsx
git commit -m "feat(all-pipelines): компонент общей доски с фильтром и перемещением"
```

---

## Task 3: Страница `/pipeline`

**Files:**
- Create: `src/app/pipeline/page.tsx`

- [ ] **Step 1: Реализовать страницу**

```tsx
import AllPipelinesBoard from "./all-pipelines-board";

export default function PipelinePage() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-xl font-semibold mb-1">Этапы</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Воронка по всем открытым вакансиям
      </p>
      <AllPipelinesBoard />
    </div>
  );
}
```

Примечание: обёртка/отступы должны совпадать с тем, как оформлены другие страницы верхнего уровня (посмотреть `src/app/vacancies/page.tsx` / `src/app/candidates/page.tsx` для консистентного padding/typography — при необходимости подогнать классы `p-6`/заголовка под них).

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit` → без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/app/pipeline/page.tsx
git commit -m "feat(all-pipelines): страница Этапы"
```

---

## Task 4: Пункт «Этапы» в сайдбаре

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Добавить иконку и пункт**

В `src/components/sidebar.tsx`:

1. В массив `NAV_ITEMS` добавить пункт после «Вакансии»:
```ts
const NAV_ITEMS = [
  { href: "/", label: "Дашборд", icon: HomeIcon },
  { href: "/candidates", label: "Кандидаты", icon: UsersIcon },
  { href: "/vacancies", label: "Вакансии", icon: BriefcaseIcon },
  { href: "/pipeline", label: "Этапы", icon: ColumnsIcon },
];
```

2. Добавить компонент иконки рядом с другими (например, после `BriefcaseIcon`):
```tsx
function ColumnsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="18" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}
```

Примечание про active-state: сайдбар считает пункт активным через `pathname.startsWith(href)`. `/pipeline` не конфликтует с другими префиксами — корректно подсветится только на своей странице.

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit` → без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(all-pipelines): пункт «Этапы» в сайдбаре"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx tsc --noEmit && npm run build` — чисто; роут `ƒ /api/pipeline` и страница `/pipeline` в списке.
- [ ] `npx vitest run` — существующие тесты зелёные.
- [ ] Ручной сквозной сценарий (dev-сервер):
  1. Клик «Этапы» в сайдбаре → открывается `/pipeline`, доска из 9 колонок.
  2. Карточки показывают кандидата + вакансию/клиента, score, дни.
  3. Только записи по открытым вакансиям (закрытая вакансия — её карточек нет).
  4. Фильтр «Вакансия» сужает набор; счётчик обновляется.
  5. Клик по карточке → меню; перемещение на другой этап → карточка переезжает; перезагрузка сохраняет.
  6. «Открыть карточку кандидата» / «Открыть вакансию» — переходят куда надо.
- [ ] Проверить, что колонки/карточки непрозрачные (белый фон), а не прозрачные (баг `bg-card`).
