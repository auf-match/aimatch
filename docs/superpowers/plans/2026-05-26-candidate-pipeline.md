# Пайплайн кандидатов по вакансии — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Двухуровневый пайплайн — глобальный триаж кандидата (поле на `Candidate`) и пайплайн по вакансии (`Pipeline` + история `StageTransition`), с доской на странице вакансии и блоками триажа/«Вакансии в работе» в карточке кандидата.

**Architecture:** Аддитивный подход к схеме: сначала добавляем новые модели/поля рядом с существующим `ShortlistEntry`, строим новые API и UI, и только в самом конце удаляем shortlist целиком — так каждый коммит компилируется. Чистая логика (`daysInStage`, группировка, маппинг миграции) выносится в `src/lib/pipeline.ts` под Vitest; API/UI проверяются вручную через dev-сервер (в проекте нет интеграционного тестового харнесса, только unit-тесты на чистые функции).

**Tech Stack:** Next.js 15 (App Router, route handlers), Prisma + PostgreSQL, React 19, Tailwind, Vitest. Spec: `docs/superpowers/specs/2026-05-26-candidate-pipeline-design.md`.

---

## Карта файлов

**Создаются:**
- `src/lib/pipeline.ts` — константы (labels/colors/order) + чистые функции `daysInStage`, `groupPipelineByStage`, `mapShortlistStatusToStage`.
- `src/lib/pipeline.test.ts` — unit-тесты чистых функций.
- `src/server/services/pipeline.ts` — серверные хелперы `approveToVacancy`, `movePipelineStage` (работа с Prisma в транзакции).
- `scripts/migrate-shortlist-to-pipeline.ts` — одноразовый backfill старых `ShortlistEntry` в `Pipeline`/`StageTransition`.
- `src/app/api/vacancies/[id]/pipeline/route.ts` — GET (доска), POST (одобрить под вакансию).
- `src/app/api/vacancies/[id]/pipeline/[candidateId]/move/route.ts` — POST (перемещение).
- `src/app/api/candidates/[id]/pipelines/route.ts` — GET (пайплайны кандидата с историей).
- `src/app/api/candidates/[id]/triage/route.ts` — PATCH (смена глобального триажа).
- `src/app/vacancies/[id]/pipeline-board.tsx` — клиентский компонент доски + меню перемещения.
- `src/app/candidates/[id]/candidate-pipelines.tsx` — клиентский компонент «Триаж» + «Вакансии в работе».

**Изменяются:**
- `prisma/schema.prisma` — enums, поля триажа, `Pipeline`, `StageTransition`, удаление `ShortlistEntry`/`ShortlistStatus`.
- `src/lib/constants.ts` — реэкспорт/добавление подписей (или оставляем в `pipeline.ts`).
- `src/app/api/candidates/[id]/route.ts` — include `pipelines` вместо `shortlistEntries`.
- `src/app/api/vacancies/[id]/route.ts`, `src/app/api/vacancies/route.ts` — `_count`/include по `pipelines`.
- `src/app/vacancies/[id]/page.tsx` — встроить доску, заменить «в шорт-лист» на «Одобрить».
- `src/app/candidates/[id]/page.tsx` — встроить компонент триажа/пайплайнов.
- `src/app/vacancies/page.tsx` — заменить счётчик «в шорт.».
- `src/server/routes/candidates.ts`, `src/server/routes/vacancies.ts` — переименовать include-ключи (Express, чтобы tsc не падал).

**Удаляются:**
- `src/app/api/vacancies/[id]/shortlist/route.ts`.

---

## Task 1: Схема — триаж, Pipeline, StageTransition (аддитивно)

Добавляем новые структуры, **не трогая** существующий `ShortlistEntry` — старое и новое сосуществуют, билд зелёный.

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить enums в конец секции enums**

В `prisma/schema.prisma` после `enum PoolStatus { ... }`:

```prisma
enum TriageStatus {
  NEW
  NEEDS_CLARIFICATION
  CLARIFYING
  BASE
}

enum PipelineStage {
  DL_APPROVED
  IN_CLIENT_SELECTION
  REHEARSAL
  CLIENT_INTERVIEW
  TEST_TASK
  OFFER
  REJECTED
  HIRED
}
```

- [ ] **Step 2: Добавить поля триажа в `model Candidate`**

После строки `status CandidateStatus @default(NEW)` (блок «--- Статус ---»):

```prisma
  // --- Глобальный триаж (ручной, дизайн-лидом) ---
  triageStatus     TriageStatus  @default(NEW)
  triageUpdatedAt  DateTime?
  triageUpdatedBy  String?
```

- [ ] **Step 3: Добавить relation `pipelines` в Candidate и Vacancy (рядом с shortlist)**

В `model Candidate`, в блоке «--- Связи ---», рядом с `shortlistEntries ShortlistEntry[]`:

```prisma
  pipelines              Pipeline[]
```

В `model Vacancy`, в блоке «--- Связи ---», рядом с `shortlist ShortlistEntry[]`:

```prisma
  pipelines              Pipeline[]
```

- [ ] **Step 4: Добавить модели `Pipeline` и `StageTransition`**

После `model ShortlistEntry { ... }`:

```prisma
model Pipeline {
  id          String    @id @default(cuid())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  vacancyId   String
  vacancy     Vacancy   @relation(fields: [vacancyId], references: [id], onDelete: Cascade)

  stage       PipelineStage @default(DL_APPROVED)
  notes       String?

  transitions StageTransition[]

  @@unique([candidateId, vacancyId])
}

model StageTransition {
  id         String         @id @default(cuid())
  createdAt  DateTime       @default(now())

  pipelineId String
  pipeline   Pipeline       @relation(fields: [pipelineId], references: [id], onDelete: Cascade)

  fromStage  PipelineStage?
  toStage    PipelineStage
  actor      String
  note       String?

  @@index([pipelineId])
}
```

- [ ] **Step 5: Применить миграцию**

Run: `npx prisma migrate dev --name add_pipeline_and_triage`
Expected: миграция создаётся и применяется без ошибок; печатает «Your database is now in sync with your schema».
⚠️ Это **аддитивная** миграция (только новые таблицы/колонки) — она не должна предлагать reset. Если Prisma сообщает о drift и предлагает `reset` (что сотрёт существующие `ShortlistEntry` до backfill в Task 3) — НЕ соглашаться, сначала разобраться с дрейфом.

- [ ] **Step 6: Перегенерировать клиент и проверить типы**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: без ошибок (старый shortlist на месте, ничего не сломалось).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(pipeline): схема триажа, Pipeline и StageTransition (аддитивно)"
```

---

## Task 2: Чистая логика и константы (TDD)

**Files:**
- Create: `src/lib/pipeline.ts`
- Test: `src/lib/pipeline.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`src/lib/pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  daysInStage,
  groupPipelineByStage,
  mapShortlistStatusToStage,
  PIPELINE_STAGE_ORDER,
} from "./pipeline";

describe("daysInStage", () => {
  it("returns 0 for same day", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    expect(daysInStage(new Date("2026-05-26T08:00:00Z"), now)).toBe(0);
  });
  it("returns whole days, rounded down", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    expect(daysInStage(new Date("2026-05-24T20:00:00Z"), now)).toBe(1);
    expect(daysInStage(new Date("2026-05-23T11:00:00Z"), now)).toBe(3);
  });
});

describe("groupPipelineByStage", () => {
  it("groups entries by stage and keeps all stages present and ordered", () => {
    const entries = [
      { stage: "DL_APPROVED", id: "a" },
      { stage: "OFFER", id: "b" },
      { stage: "DL_APPROVED", id: "c" },
    ];
    const grouped = groupPipelineByStage(entries);
    expect(Object.keys(grouped)).toEqual(PIPELINE_STAGE_ORDER);
    expect(grouped.DL_APPROVED.map((e) => e.id)).toEqual(["a", "c"]);
    expect(grouped.OFFER.map((e) => e.id)).toEqual(["b"]);
    expect(grouped.HIRED).toEqual([]);
  });
});

describe("mapShortlistStatusToStage", () => {
  it("maps all 8 ShortlistStatus values", () => {
    expect(mapShortlistStatusToStage("PENDING")).toBe("DL_APPROVED");
    expect(mapShortlistStatusToStage("CONTACTED")).toBe("DL_APPROVED");
    expect(mapShortlistStatusToStage("INTERESTED")).toBe("DL_APPROVED");
    expect(mapShortlistStatusToStage("NOT_INTERESTED")).toBe("REJECTED");
    expect(mapShortlistStatusToStage("INTERVIEWING")).toBe("CLIENT_INTERVIEW");
    expect(mapShortlistStatusToStage("OFFERED")).toBe("OFFER");
    expect(mapShortlistStatusToStage("HIRED")).toBe("HIRED");
    expect(mapShortlistStatusToStage("REJECTED")).toBe("REJECTED");
  });
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: FAIL — `Failed to resolve import "./pipeline"`.

- [ ] **Step 3: Реализовать `src/lib/pipeline.ts`**

```ts
import type { PipelineStage, TriageStatus, ShortlistStatus } from "@prisma/client";

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "DL_APPROVED",
  "IN_CLIENT_SELECTION",
  "REHEARSAL",
  "CLIENT_INTERVIEW",
  "TEST_TASK",
  "OFFER",
  "REJECTED",
  "HIRED",
];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  DL_APPROVED: "Одобрен ДЛ",
  IN_CLIENT_SELECTION: "В подборке для клиента",
  REHEARSAL: "Репетиция",
  CLIENT_INTERVIEW: "Интервью с клиентом",
  TEST_TASK: "Тестовое задание",
  OFFER: "Оффер",
  REJECTED: "Отказ",
  HIRED: "Нанят",
};

export const PIPELINE_STAGE_COLORS: Record<PipelineStage, string> = {
  DL_APPROVED: "#0d9488",
  IN_CLIENT_SELECTION: "#4338ca",
  REHEARSAL: "#1d4ed8",
  CLIENT_INTERVIEW: "#0891b2",
  TEST_TASK: "#0284c7",
  OFFER: "#e11d48",
  REJECTED: "#3f3f46",
  HIRED: "#059669",
};

export const TRIAGE_STATUS_ORDER: TriageStatus[] = [
  "NEW",
  "NEEDS_CLARIFICATION",
  "CLARIFYING",
  "BASE",
];

export const TRIAGE_STATUS_LABELS: Record<TriageStatus, string> = {
  NEW: "Новый",
  NEEDS_CLARIFICATION: "Нужны уточнения",
  CLARIFYING: "На уточнении",
  BASE: "База",
};

export const TRIAGE_STATUS_COLORS: Record<TriageStatus, string> = {
  NEW: "#3f3f46",
  NEEDS_CLARIFICATION: "#ea580c",
  CLARIFYING: "#d97706",
  BASE: "#0d9488",
};

/** Целое число полных дней между моментом и now (округление вниз, 0 для сегодня). */
export function daysInStage(since: Date, now: Date): number {
  const ms = now.getTime() - since.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Группирует записи по этапу; все этапы присутствуют в каноническом порядке. */
export function groupPipelineByStage<T extends { stage: PipelineStage }>(
  entries: T[],
): Record<PipelineStage, T[]> {
  const grouped = {} as Record<PipelineStage, T[]>;
  for (const stage of PIPELINE_STAGE_ORDER) grouped[stage] = [];
  for (const entry of entries) grouped[entry.stage].push(entry);
  return grouped;
}

/** Маппинг старого ShortlistStatus в PipelineStage (для миграции данных). */
export function mapShortlistStatusToStage(status: ShortlistStatus): PipelineStage {
  switch (status) {
    case "PENDING":
    case "CONTACTED":
    case "INTERESTED":
      return "DL_APPROVED";
    case "NOT_INTERESTED":
    case "REJECTED":
      return "REJECTED";
    case "INTERVIEWING":
      return "CLIENT_INTERVIEW";
    case "OFFERED":
      return "OFFER";
    case "HIRED":
      return "HIRED";
  }
}
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: PASS (3 describe, все it зелёные).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/pipeline.test.ts
git commit -m "feat(pipeline): константы и чистая логика (daysInStage, группировка, маппинг)"
```

---

## Task 3: Backfill старых ShortlistEntry → Pipeline

Одноразовый скрипт. `ShortlistEntry` ещё существует (удалим в Task 10), поэтому читается без проблем. Использует `mapShortlistStatusToStage`.

**Files:**
- Create: `scripts/migrate-shortlist-to-pipeline.ts`

- [ ] **Step 1: Написать скрипт**

```ts
import { PrismaClient } from "@prisma/client";
import { mapShortlistStatusToStage } from "../src/lib/pipeline";

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.shortlistEntry.findMany();
  console.log(`Найдено ShortlistEntry: ${entries.length}`);

  let created = 0;
  for (const e of entries) {
    const stage = mapShortlistStatusToStage(e.status);

    // Идемпотентно: пропускаем, если Pipeline уже есть
    const existing = await prisma.pipeline.findUnique({
      where: { candidateId_vacancyId: { candidateId: e.candidateId, vacancyId: e.vacancyId } },
    });
    if (existing) continue;

    await prisma.pipeline.create({
      data: {
        candidateId: e.candidateId,
        vacancyId: e.vacancyId,
        stage,
        notes: e.notes,
        transitions: {
          create: { fromStage: null, toStage: stage, actor: e.addedBy || "Система" },
        },
      },
    });
    created++;
  }
  console.log(`Создано Pipeline: ${created}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Запустить backfill**

Run: `npx tsx scripts/migrate-shortlist-to-pipeline.ts`
Expected: печатает «Найдено ShortlistEntry: N» и «Создано Pipeline: N» без ошибок. (Если shortlist пуст — N=0, это нормально.)

- [ ] **Step 3: Проверить идемпотентность**

Run: `npx tsx scripts/migrate-shortlist-to-pipeline.ts`
Expected: «Создано Pipeline: 0» (все уже перенесены).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-shortlist-to-pipeline.ts
git commit -m "feat(pipeline): backfill-скрипт ShortlistEntry -> Pipeline"
```

---

## Task 4: Серверные хелперы пайплайна

**Files:**
- Create: `src/server/services/pipeline.ts`

- [ ] **Step 1: Реализовать хелперы**

```ts
import type { PipelineStage } from "@prisma/client";
import { prisma } from "@/server/db";

/**
 * Идемпотентно создаёт запись Pipeline на этапе DL_APPROVED при одобрении ДЛ.
 * Если запись уже есть — возвращает её без изменений и без нового перехода.
 */
export async function approveToVacancy(
  candidateId: string,
  vacancyId: string,
  actor: string,
) {
  const existing = await prisma.pipeline.findUnique({
    where: { candidateId_vacancyId: { candidateId, vacancyId } },
  });
  if (existing) return existing;

  return prisma.pipeline.create({
    data: {
      candidateId,
      vacancyId,
      stage: "DL_APPROVED",
      transitions: {
        create: { fromStage: null, toStage: "DL_APPROVED", actor: actor || "Система" },
      },
    },
  });
}

/**
 * Перемещает кандидата на новый этап по вакансии и пишет переход в историю.
 * Бросает Error("NOT_FOUND"), если записи нет (создание — только через approveToVacancy).
 */
export async function movePipelineStage(
  candidateId: string,
  vacancyId: string,
  toStage: PipelineStage,
  actor: string,
  note?: string,
) {
  const existing = await prisma.pipeline.findUnique({
    where: { candidateId_vacancyId: { candidateId, vacancyId } },
  });
  if (!existing) throw new Error("NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.pipeline.update({
      where: { id: existing.id },
      data: { stage: toStage },
    });
    await tx.stageTransition.create({
      data: {
        pipelineId: existing.id,
        fromStage: existing.stage,
        toStage,
        actor: actor || "Система",
        note: note || null,
      },
    });
    return updated;
  });
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/pipeline.ts
git commit -m "feat(pipeline): серверные хелперы approveToVacancy и movePipelineStage"
```

---

## Task 5: API доски вакансии (GET + POST одобрение)

**Files:**
- Create: `src/app/api/vacancies/[id]/pipeline/route.ts`

- [ ] **Step 1: Реализовать route handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { approveToVacancy } from "@/server/services/pipeline";

// GET — данные доски: записи Pipeline + последний переход + score кандидата
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { vacancyId },
      include: {
        candidate: { select: { id: true, name: true, role: true, grade: true } },
        transitions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    // overall score: DetailedScore -> MatchResult -> null
    const candidateIds = pipelines.map((p) => p.candidateId);
    const [detailed, matches] = await Promise.all([
      prisma.detailedScore.findMany({
        where: { vacancyId, candidateId: { in: candidateIds } },
        select: { candidateId: true, overallScore: true },
      }),
      prisma.matchResult.findMany({
        where: { vacancyId, candidateId: { in: candidateIds } },
        select: { candidateId: true, overallScore: true },
      }),
    ]);
    const scoreByCandidate = new Map<string, number>();
    for (const m of matches) scoreByCandidate.set(m.candidateId, m.overallScore);
    for (const d of detailed) scoreByCandidate.set(d.candidateId, d.overallScore);

    const result = pipelines.map((p) => ({
      candidateId: p.candidateId,
      candidate: p.candidate,
      stage: p.stage,
      score: scoreByCandidate.get(p.candidateId) ?? null,
      lastTransitionAt: p.transitions[0]?.createdAt ?? p.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET pipeline error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

// POST — одобрить кандидата под вакансию (создаёт запись на DL_APPROVED)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const { candidateId, actor } = await req.json();
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId обязателен" }, { status: 400 });
    }
    const entry = await approveToVacancy(candidateId, vacancyId, actor || "Система");
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST pipeline error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Проверить типы и собрать**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Ручная проверка (dev-сервер)**

Запустить `npm run dev`, взять id реальной вакансии и кандидата (из БД), затем:
```bash
curl -s -X POST localhost:3000/api/vacancies/<VAC_ID>/pipeline \
  -H 'content-type: application/json' \
  -d '{"candidateId":"<CAND_ID>","actor":"Тест"}' | head
curl -s localhost:3000/api/vacancies/<VAC_ID>/pipeline | head
```
Expected: POST → 201 с записью на `DL_APPROVED`; GET → массив с этим кандидатом, `stage: "DL_APPROVED"`, `lastTransitionAt` задан.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vacancies/[id]/pipeline/route.ts
git commit -m "feat(pipeline): API доски вакансии (GET) и одобрения (POST)"
```

---

## Task 6: API перемещения по этапам

**Files:**
- Create: `src/app/api/vacancies/[id]/pipeline/[candidateId]/move/route.ts`

- [ ] **Step 1: Реализовать route handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { movePipelineStage } from "@/server/services/pipeline";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { id: vacancyId, candidateId } = await params;
  try {
    const { toStage, actor, note } = await req.json();
    if (!toStage) {
      return NextResponse.json({ error: "toStage обязателен" }, { status: 400 });
    }
    const updated = await movePipelineStage(candidateId, vacancyId, toStage, actor || "Система", note);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Кандидат не в воронке этой вакансии" }, { status: 404 });
    }
    console.error("POST move error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Ручная проверка**

С тем же кандидатом из Task 5:
```bash
curl -s -X POST localhost:3000/api/vacancies/<VAC_ID>/pipeline/<CAND_ID>/move \
  -H 'content-type: application/json' \
  -d '{"toStage":"CLIENT_INTERVIEW","actor":"Тест"}' | head
# Несуществующая пара -> 404
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  localhost:3000/api/vacancies/<VAC_ID>/pipeline/nope/move \
  -H 'content-type: application/json' -d '{"toStage":"OFFER"}'
```
Expected: первый → 200, `stage: "CLIENT_INTERVIEW"`; второй → `404`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vacancies/[id]/pipeline/[candidateId]/move/route.ts
git commit -m "feat(pipeline): API перемещения кандидата по этапам"
```

---

## Task 7: API триажа и пайплайнов кандидата

**Files:**
- Create: `src/app/api/candidates/[id]/triage/route.ts`
- Create: `src/app/api/candidates/[id]/pipelines/route.ts`

- [ ] **Step 1: Реализовать PATCH триажа**

`src/app/api/candidates/[id]/triage/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { triageStatus, actor } = await req.json();
    if (!triageStatus) {
      return NextResponse.json({ error: "triageStatus обязателен" }, { status: 400 });
    }
    const candidate = await prisma.candidate.update({
      where: { id },
      data: {
        triageStatus,
        triageUpdatedAt: new Date(),
        triageUpdatedBy: actor || "Система",
      },
      select: { id: true, triageStatus: true, triageUpdatedAt: true, triageUpdatedBy: true },
    });
    return NextResponse.json(candidate);
  } catch (error) {
    console.error("PATCH triage error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Реализовать GET пайплайнов кандидата**

`src/app/api/candidates/[id]/pipelines/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: candidateId } = await params;
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { candidateId },
      include: {
        vacancy: { select: { id: true, title: true, clientName: true, grade: true } },
        transitions: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(pipelines);
  } catch (error) {
    console.error("GET candidate pipelines error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Ручная проверка**

```bash
curl -s -X PATCH localhost:3000/api/candidates/<CAND_ID>/triage \
  -H 'content-type: application/json' -d '{"triageStatus":"BASE","actor":"Тест"}' | head
curl -s localhost:3000/api/candidates/<CAND_ID>/pipelines | head
```
Expected: PATCH → `triageStatus: "BASE"`, `triageUpdatedAt` задан; GET → массив пайплайнов с `vacancy`, `stage`, `transitions` (desc).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/candidates/[id]/triage/route.ts src/app/api/candidates/[id]/pipelines/route.ts
git commit -m "feat(pipeline): API триажа кандидата и его пайплайнов"
```

---

## Task 8: Компонент доски на странице вакансии

Клиентский компонент доски + меню перемещения. Дизайн — см. макет `public/mockup-pipeline.html` (доска, 8 колонок). Встраивается отдельным блоком «Воронка».

**Files:**
- Create: `src/app/vacancies/[id]/pipeline-board.tsx`
- Modify: `src/app/vacancies/[id]/page.tsx`

- [ ] **Step 1: Реализовать компонент доски**

`src/app/vacancies/[id]/pipeline-board.tsx` — `"use client"`. Контракт:
- Props: `{ vacancyId: string }`.
- При маунте `GET /api/vacancies/{vacancyId}/pipeline`, локальный state `rows`.
- Группировка через `groupPipelineByStage(rows)` из `@/lib/pipeline`; колонки в порядке `PIPELINE_STAGE_ORDER`, заголовок = `PIPELINE_STAGE_LABELS[stage]`, точка цвета `PIPELINE_STAGE_COLORS[stage]`, счётчик.
- Карточка: имя, роль (`ROLE_LABELS`), `score` (если есть, %), дни в этапе через `daysInStage(new Date(lastTransitionAt), new Date())`.
- Клик по карточке → меню перемещения (все 8 этапов + «Открыть карточку» → переход на `/candidates/{candidateId}`). Выбор этапа → инлайн-запрос актора (значение из `localStorage["pipeline_actor"]`, дефолт «Система»; при подтверждении сохраняем обратно) → `POST .../{candidateId}/move`, затем оптимистично обновляем `rows`.
- Горизонтальный скролл ряда колонок; терминальный `REJECTED` — приглушённые карточки (opacity).

Разметку/классы взять по образцу макета (`public/mockup-pipeline.html`), адаптировав под Tailwind проекта.

- [ ] **Step 2: Встроить доску в страницу вакансии**

В `src/app/vacancies/[id]/page.tsx` импортировать `PipelineBoard` и отрендерить блок «Воронка» (заголовок + `<PipelineBoard vacancyId={id} />`) под блоком брифа, в режиме просмотра (не edit). Существующий список матчинга оставить на месте.

- [ ] **Step 3: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Ручная проверка (dev-сервер)**

Открыть `/vacancies/<VAC_ID>` (у которой есть запись пайплайна из прошлых задач). Убедиться: блок «Воронка», 8 колонок, кандидат в нужной колонке, % и дни отображаются; клик → меню; выбор этапа с актором → карточка переезжает в другую колонку; перезагрузка страницы сохраняет позицию.

- [ ] **Step 5: Commit**

```bash
git add src/app/vacancies/[id]/pipeline-board.tsx src/app/vacancies/[id]/page.tsx
git commit -m "feat(pipeline): доска воронки на странице вакансии"
```

---

## Task 9: Триаж и «Вакансии в работе» в карточке кандидата

**Files:**
- Create: `src/app/candidates/[id]/candidate-pipelines.tsx`
- Modify: `src/app/candidates/[id]/page.tsx`

- [ ] **Step 1: Реализовать компонент**

`src/app/candidates/[id]/candidate-pipelines.tsx` — `"use client"`. Контракт:
- Props: `{ candidateId: string; initialTriageStatus: TriageStatus }`.
- **Блок «Триаж в базе»:** текущий `triageStatus` бейджем (label `TRIAGE_STATUS_LABELS`, цвет `TRIAGE_STATUS_COLORS`) + дропдаун со всеми `TRIAGE_STATUS_ORDER`. Выбор → `PATCH /api/candidates/{id}/triage` с актором (тот же `localStorage["pipeline_actor"]`), обновить локальный state.
- **Блок «Вакансии в работе»:** при маунте `GET /api/candidates/{id}/pipelines`. Для каждой записи: `vacancy.title` + `clientName` + грейд (`GRADE_LABELS`), бейдж текущего этапа (`PIPELINE_STAGE_LABELS`/`COLORS`), таймлайн `transitions` (этап / actor / «N дней назад» через `daysInStage`), кнопка «Переместить этап» (меню всех 8 этапов) → `POST /api/vacancies/{vacancyId}/pipeline/{candidateId}/move`, обновить.
- Кнопка «+ Добавить в вакансию»: выбор из открытых вакансий (`GET /api/vacancies` уже существует) → `POST /api/vacancies/{vacancyId}/pipeline` (approve) → перезапросить пайплайны.

Разметку взять по образцу макета (карточка кандидата).

- [ ] **Step 2: Встроить в карточку кандидата**

В `src/app/candidates/[id]/page.tsx` отрендерить `<CandidatePipelines candidateId={id} initialTriageStatus={candidate.triageStatus} />` — блок триажа в шапке/сайдбаре, «Вакансии в работе» рядом с существующим блоком «Вакансии» (матчинг). Существующий блок матчинга НЕ удалять (это «куда подходит по AI», другое).

- [ ] **Step 3: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Ручная проверка**

Открыть `/candidates/<CAND_ID>`. Убедиться: блок триажа показывает текущий статус, смена через дропдаун сохраняется (перезагрузка подтверждает); «Вакансии в работе» показывает вакансии с этапом и историей; «Переместить этап» работает; «+ Добавить в вакансию» создаёт запись на «Одобрен ДЛ».

- [ ] **Step 5: Commit**

```bash
git add src/app/candidates/[id]/candidate-pipelines.tsx src/app/candidates/[id]/page.tsx
git commit -m "feat(pipeline): триаж и Вакансии в работе в карточке кандидата"
```

---

## Task 10: Удаление shortlist + кнопка «Одобрить» в матчинге

Финальная задача: удаляем shortlist целиком и заменяем тумблер «в шорт-лист» на «Одобрить под вакансию». Все правки ссылок + drop схемы делаются в одном коммите, чтобы билд оставался зелёным.

**Files:**
- Delete: `src/app/api/vacancies/[id]/shortlist/route.ts`
- Modify: `prisma/schema.prisma`, `src/app/api/candidates/[id]/route.ts`, `src/app/api/vacancies/[id]/route.ts`, `src/app/api/vacancies/route.ts`, `src/app/vacancies/[id]/page.tsx`, `src/app/vacancies/page.tsx`, `src/server/routes/candidates.ts`, `src/server/routes/vacancies.ts`

- [ ] **Step 1: Удалить shortlist-роут**

```bash
git rm src/app/api/vacancies/[id]/shortlist/route.ts
```

- [ ] **Step 2: Обновить include/`_count` в API**

- `src/app/api/candidates/[id]/route.ts`: заменить блок `shortlistEntries: { include: { vacancy: ... } }` на `pipelines: { include: { vacancy: { select: { id: true, title: true } } } }`.
- `src/app/api/vacancies/[id]/route.ts`: заменить `shortlist: {...}` include на `pipelines: { include: { candidate: { select: { id: true, name: true, role: true, grade: true } } }, orderBy: { createdAt: "desc" } }`; в `_count.select` заменить `shortlist: true` на `pipelines: true`.
- `src/app/api/vacancies/route.ts`: в `_count.select` заменить `shortlist: true` на `pipelines: true`.
- `src/server/routes/candidates.ts:86`: `shortlistEntries` → `pipelines`.
- `src/server/routes/vacancies.ts:109,142`: `shortlist` → `pipelines` (в `_count.select` и в include).

- [ ] **Step 3: Заменить UI шорт-листа на «Одобрить»**

- `src/app/vacancies/[id]/page.tsx`: убрать `ShortlistEntry`-интерфейс, `shortlistIds`/`shortlistLoading` state, `handleAddToShortlist`, обращения к `/shortlist`. В списке матчинга: если кандидат уже в `pipelines` вакансии — показать бейдж этапа; иначе — кнопку «Одобрить», которая шлёт `POST /api/vacancies/{id}/pipeline {candidateId, actor}` и обновляет состояние. Заменить `vacancy._count.shortlist`-строку (≈779) на `_count.pipelines` с подписью «в воронке».
- `src/app/vacancies/page.tsx`: в типе `_count` заменить `shortlist` → `pipelines`; строку «N в шорт.» (≈198-199) заменить на «N в воронке» по `v._count.pipelines`.

- [ ] **Step 4: Удалить shortlist из схемы**

В `prisma/schema.prisma`:
- удалить `model ShortlistEntry { ... }`;
- удалить `enum ShortlistStatus { ... }`;
- удалить relation `shortlistEntries ShortlistEntry[]` из `Candidate` и `shortlist ShortlistEntry[]` из `Vacancy` (поля `pipelines` остаются).

- [ ] **Step 5: Применить миграцию и перегенерировать**

Run: `npx prisma migrate dev --name drop_shortlist && npx prisma generate`
Expected: миграция дропает таблицу `ShortlistEntry` и тип `ShortlistStatus`; sync без ошибок.

- [ ] **Step 6: Проверить типы и сборку**

Run: `npx tsc --noEmit && npm run build`
Expected: без ошибок (нет упоминаний shortlist/ShortlistStatus).

- [ ] **Step 7: Ручная проверка**

Открыть страницу вакансии: в матчинге у не-одобренных кандидатов кнопка «Одобрить»; нажатие → кандидат появляется в воронке (Task 8) на «Одобрен ДЛ», кнопка меняется на бейдж. Счётчики «в воронке» на списке вакансий и в шапке корректны. Открыть карточку кандидата — никаких ошибок по shortlist.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(pipeline): удалить shortlist, заменить на одобрение в воронку"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx vitest run` — все unit-тесты зелёные.
- [ ] `npx tsc --noEmit && npm run build` — чисто.
- [ ] `grep -rn "shortlist\|Shortlist\|ShortlistStatus" src/ prisma/schema.prisma` — пусто (кроме истории миграций).
- [ ] Удалить временный макет `public/mockup-pipeline.html` (если не нужен).
- [ ] Сквозной сценарий вручную: одобрить кандидата из матчинга → подвигать по доске → проверить историю в карточке кандидата → сменить триаж.
