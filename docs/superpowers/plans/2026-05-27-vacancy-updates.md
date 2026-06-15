# Журнал уточнений к вакансии — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить вакансии append-only журнал уточнений со встреч (текст или аудио), AI предлагает поштучный дифф к полям вакансии, пользователь применяет выбранное, скоры кандидатов помечаются устаревшими и пересчитываются по кнопке.

**Architecture:** Новая модель `VacancyUpdate` (FK на `Vacancy`) с фоновой обработкой fire-and-forget (форма быстро возвращает запись со статусом `PROCESSING`, UI поллит). Транскрибация переиспользует существующий `briefing-audio.ts`; парсинг диффа — новый промпт `vacancy-update-parse.ts`. Чистая логика применения диффа выносится в `src/lib/vacancy-update.ts` под Vitest. Пересчёт устаревших скоров — отдельный endpoint, дергает существующий `detailed-scorer`. UI секции «Уточнения» и бейджа «Скор устарел» — на странице вакансии.

**Tech Stack:** Next.js 15 (App Router, route handlers с `maxDuration = 300`), Prisma + PostgreSQL, React 19, Tailwind, Vitest. Spec: `docs/superpowers/specs/2026-05-27-vacancy-updates-design.md`.

---

## Карта файлов

**Создаются:**
- `src/lib/vacancy-update.ts` — чистая логика: `applyDiffSelection`, `diffTouchesScoringFields`, `isStaleScore`, константа `SCORING_FIELDS` (поля, изменение которых инвалидирует скоры), `FIELD_LABELS` (русские подписи полей для UI).
- `src/lib/vacancy-update.test.ts` — Vitest-тесты чистой логики.
- `src/server/prompts/vacancy-update-parse.ts` — промпт: на вход текущая вакансия (структурированно) + текст уточнения → JSON массив предложений `[{ field, op, currentValue, proposedValue, reason }]`.
- `src/server/services/vacancy-update.ts` — оркестрация: `processVacancyUpdate(updateId)` — читает запись, опционально транскрибирует аудио через `briefing-audio.ts`, гонит через парсинг-промпт, сохраняет `proposedDiff` и меняет статус. Используется как fire-and-forget из POST-роута.
- `src/app/api/vacancies/[id]/updates/route.ts` — POST (создать запись + кикнуть обработку) и GET (список с историей desc).
- `src/app/api/vacancies/[id]/updates/[updateId]/apply/route.ts` — POST (применить выбранные пункты).
- `src/app/api/vacancies/[id]/updates/[updateId]/dismiss/route.ts` — POST (`status=DISMISSED`).
- `src/app/api/vacancies/[id]/updates/[updateId]/retry/route.ts` — POST (перезапустить обработку упавшей записи).
- `src/app/api/vacancies/[id]/rescore-stale/route.ts` — POST (прогон устаревших через `detailedScore`).
- `src/app/vacancies/[id]/vacancy-updates.tsx` — клиентский компонент: форма, timeline, поллинг, дифф-превью.

**Изменяются:**
- `prisma/schema.prisma` — модель `VacancyUpdate`, enum'ы, поле `criteriaUpdatedAt` на `Vacancy`, relation.
- `src/app/vacancies/[id]/page.tsx` — встроить `<VacancyUpdates>`, добавить бейдж «Скор устарел» и кнопку «Пересчитать устаревших» в список матчинга.

---

## Task 1: Схема — VacancyUpdate + criteriaUpdatedAt

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить enums**

В `prisma/schema.prisma`, после `enum PipelineStage { ... }`:

```prisma
enum VacancyUpdateKind {
  TEXT
  AUDIO
}

enum VacancyUpdateStatus {
  PROCESSING
  PENDING
  APPLIED
  DISMISSED
  EMPTY
  FAILED
}
```

- [ ] **Step 2: Добавить поле и relation на `Vacancy`**

После строки `closedAt DateTime?` в `model Vacancy`:

```prisma
  // --- Журнал уточнений ---
  criteriaUpdatedAt DateTime?
  updates           VacancyUpdate[]
```

- [ ] **Step 3: Добавить модель `VacancyUpdate`**

После `model StageTransition { ... }`:

```prisma
model VacancyUpdate {
  id            String              @id @default(cuid())
  vacancyId     String
  vacancy       Vacancy             @relation(fields: [vacancyId], references: [id], onDelete: Cascade)
  createdAt     DateTime            @default(now())
  actor         String

  kind          VacancyUpdateKind
  rawText       String?
  audioFileUrl  String?
  transcript    String?

  status        VacancyUpdateStatus @default(PROCESSING)
  proposedDiff  Json?
  appliedDiff   Json?
  appliedAt     DateTime?
  errorMessage  String?

  @@index([vacancyId, createdAt])
}
```

- [ ] **Step 4: Применить миграцию**

Run: `npx prisma migrate dev --name add_vacancy_updates`
Expected: «Your database is now in sync with your schema» без ошибок. Миграция должна быть чисто аддитивной (`CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE ADD COLUMN`). Если Prisma запрашивает reset — НЕ соглашаться, сначала разобраться с дрейфом.

- [ ] **Step 5: Перегенерировать клиент и проверить типы**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(vacancy-updates): схема VacancyUpdate и criteriaUpdatedAt"
```

---

## Task 2: Чистая логика и константы (TDD)

**Files:**
- Create: `src/lib/vacancy-update.ts`
- Test: `src/lib/vacancy-update.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`src/lib/vacancy-update.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyDiffSelection,
  diffTouchesScoringFields,
  isStaleScore,
  SCORING_FIELDS,
  type DiffItem,
} from "./vacancy-update";

describe("isStaleScore", () => {
  it("returns false if criteriaUpdatedAt is null", () => {
    expect(isStaleScore(new Date("2026-01-01"), null)).toBe(false);
  });
  it("returns true if score is older than criteriaUpdatedAt", () => {
    expect(isStaleScore(new Date("2026-01-01"), new Date("2026-02-01"))).toBe(true);
  });
  it("returns false if score is newer than criteriaUpdatedAt", () => {
    expect(isStaleScore(new Date("2026-02-02"), new Date("2026-02-01"))).toBe(false);
  });
  it("treats equal timestamps as not stale", () => {
    const t = new Date("2026-02-01");
    expect(isStaleScore(t, t)).toBe(false);
  });
});

describe("diffTouchesScoringFields", () => {
  it("returns true if any applied item touches a scoring field", () => {
    const applied: DiffItem[] = [
      { field: "productDescription", op: "set", proposedValue: "x", reason: "" },
      { field: "keyTasks", op: "add", proposedValue: "Новая задача", reason: "" },
    ];
    expect(diffTouchesScoringFields(applied)).toBe(true);
  });
  it("returns false if no applied item touches a scoring field", () => {
    const applied: DiffItem[] = [
      { field: "productDescription", op: "set", proposedValue: "x", reason: "" },
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
    ];
    expect(diffTouchesScoringFields(applied)).toBe(false);
  });
  it("returns false for empty list", () => {
    expect(diffTouchesScoringFields([])).toBe(false);
  });
});

describe("applyDiffSelection", () => {
  const baseVacancy = {
    keyTasks: ["A", "B", "C"],
    salaryRange: "150-200k",
    scoringCriteria: [
      { criterion: "Опыт B2C", weight: 30, type: "required" },
      { criterion: "Метрики", weight: 20, type: "nice_to_have" },
    ],
  };

  it("set: replaces scalar value", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200-250k", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ salaryRange: "200-250k" });
  });

  it("add: appends item to array field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "add", proposedValue: "D", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "B", "C", "D"] });
  });

  it("remove: removes matching item from array field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "remove", proposedValue: "B", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "C"] });
  });

  it("modify: replaces item in array field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "modify", proposedValue: { from: "B", to: "B2" }, reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "B2", "C"] });
  });

  it("scoringCriteria add: appends full criterion object", () => {
    const proposed: DiffItem[] = [
      {
        field: "scoringCriteria",
        op: "add",
        proposedValue: { criterion: "Аргументация", weight: 15, type: "required" },
        reason: "",
      },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect((result.payload.scoringCriteria as any[]).length).toBe(3);
    expect((result.payload.scoringCriteria as any[])[2]).toEqual({
      criterion: "Аргументация",
      weight: 15,
      type: "required",
    });
  });

  it("scoringCriteria remove: matches by criterion name", () => {
    const proposed: DiffItem[] = [
      { field: "scoringCriteria", op: "remove", proposedValue: "Метрики", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect((result.payload.scoringCriteria as any[]).length).toBe(1);
    expect((result.payload.scoringCriteria as any[])[0].criterion).toBe("Опыт B2C");
  });

  it("scoringCriteria modify: replaces object matched by 'from' name", () => {
    const proposed: DiffItem[] = [
      {
        field: "scoringCriteria",
        op: "modify",
        proposedValue: {
          from: "Опыт B2C",
          to: { criterion: "Опыт B2C", weight: 40, type: "required" },
        },
        reason: "",
      },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect((result.payload.scoringCriteria as any[])[0].weight).toBe(40);
  });

  it("respects user edits via edits parameter", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [
      { index: 0, editedValue: "220k" },
    ]);
    expect(result.payload).toEqual({ salaryRange: "220k" });
  });

  it("accumulates multiple selections on the same field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "add", proposedValue: "D", reason: "" },
      { field: "keyTasks", op: "add", proposedValue: "E", reason: "" },
      { field: "keyTasks", op: "remove", proposedValue: "A", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [
      { index: 0 },
      { index: 1 },
      { index: 2 },
    ]);
    expect(result.payload).toEqual({ keyTasks: ["B", "C", "D", "E"] });
  });

  it("ignores unselected items", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
      { field: "keyTasks", op: "add", proposedValue: "D", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 1 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "B", "C", "D"] });
  });

  it("returns appliedDiff for audit", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [
      { index: 0, editedValue: "220k" },
    ]);
    expect(result.appliedDiff).toEqual([
      { field: "salaryRange", op: "set", proposedValue: "220k", reason: "" },
    ]);
  });
});

describe("SCORING_FIELDS", () => {
  it("contains the expected matching-relevant fields", () => {
    expect(SCORING_FIELDS).toContain("scoringCriteria");
    expect(SCORING_FIELDS).toContain("keyTasks");
    expect(SCORING_FIELDS).toContain("requiredSkills");
    expect(SCORING_FIELDS).not.toContain("productDescription");
    expect(SCORING_FIELDS).not.toContain("salaryRange");
  });
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `npx vitest run src/lib/vacancy-update.test.ts`
Expected: FAIL — `Failed to resolve import "./vacancy-update"`.

- [ ] **Step 3: Реализовать `src/lib/vacancy-update.ts`**

```ts
export type DiffOp = "set" | "add" | "remove" | "modify";

export interface DiffItem {
  field: string;
  op: DiffOp;
  /** Текущее значение (для UI; в applyDiffSelection не используется). */
  currentValue?: unknown;
  /** Что станет после применения этого пункта (семантика зависит от op — см. спеку). */
  proposedValue: unknown;
  reason: string;
}

export interface SelectedItem {
  index: number;
  editedValue?: unknown;
}

/** Поля, изменение которых инвалидирует уже посчитанные DetailedScore. */
export const SCORING_FIELDS = [
  "scoringCriteria",
  "keyTasks",
  "requiredSkills",
  "niceToHaveSkills",
  "preferredDomains",
  "requiredTools",
  "redFlags",
  "specialCompetencies",
  "needsInternational",
] as const;

/** Русские подписи полей для UI. */
export const FIELD_LABELS: Record<string, string> = {
  scoringCriteria: "Критерии скоринга",
  keyTasks: "Ключевые задачи",
  requiredSkills: "Обязательные навыки",
  niceToHaveSkills: "Будет плюсом",
  preferredDomains: "Предпочтительные домены",
  requiredTools: "Инструменты",
  redFlags: "Red flags",
  specialCompetencies: "Специальные компетенции",
  needsInternational: "Нужен международный опыт",
  productDescription: "Описание продукта",
  salaryRange: "Зарплата",
  clientNotes: "Комментарии по клиенту",
  reasonForHiring: "Причина найма",
  teamComposition: "Команда",
  keyResponsibilities: "Ключевые обязанности",
};

export function isStaleScore(
  scoreCreatedAt: Date,
  criteriaUpdatedAt: Date | null,
): boolean {
  if (!criteriaUpdatedAt) return false;
  return scoreCreatedAt.getTime() < criteriaUpdatedAt.getTime();
}

export function diffTouchesScoringFields(applied: DiffItem[]): boolean {
  return applied.some((item) =>
    (SCORING_FIELDS as readonly string[]).includes(item.field),
  );
}

/**
 * Применяет выбранные элементы диффа к вакансии. Возвращает payload для
 * `prisma.vacancy.update` и applied-список (с учётом пользовательских правок).
 *
 * Семантика proposedValue:
 *   - set: новое значение поля целиком
 *   - add (массив): добавляемый элемент
 *   - remove (массив): элемент для точного удаления
 *   - modify (массив): объект { from, to }
 *   - scoringCriteria add: целый объект { criterion, weight, type }
 *   - scoringCriteria remove: строка-имя критерия
 *   - scoringCriteria modify: { from: имя, to: { criterion, weight, type } }
 */
export function applyDiffSelection(
  vacancy: Record<string, unknown>,
  proposedDiff: DiffItem[],
  selections: SelectedItem[],
): { payload: Record<string, unknown>; appliedDiff: DiffItem[] } {
  // Работаем по копии полей, чтобы добавления/удаления к массиву одного поля не мешали друг другу.
  const working: Record<string, unknown> = {};
  const appliedDiff: DiffItem[] = [];

  for (const sel of selections) {
    const original = proposedDiff[sel.index];
    if (!original) continue;
    const value = sel.editedValue !== undefined ? sel.editedValue : original.proposedValue;
    const item: DiffItem = { ...original, proposedValue: value };
    appliedDiff.push(item);

    const current =
      working[item.field] !== undefined
        ? working[item.field]
        : vacancy[item.field];

    if (item.field === "scoringCriteria") {
      const arr = (Array.isArray(current) ? [...(current as unknown[])] : []) as Array<{
        criterion: string;
        weight: number;
        type: string;
      }>;
      if (item.op === "add") {
        arr.push(item.proposedValue as { criterion: string; weight: number; type: string });
      } else if (item.op === "remove") {
        const name = item.proposedValue as string;
        working[item.field] = arr.filter((c) => c.criterion !== name);
        continue;
      } else if (item.op === "modify") {
        const { from, to } = item.proposedValue as {
          from: string;
          to: { criterion: string; weight: number; type: string };
        };
        const idx = arr.findIndex((c) => c.criterion === from);
        if (idx >= 0) arr[idx] = to;
      } else if (item.op === "set") {
        working[item.field] = item.proposedValue;
        continue;
      }
      working[item.field] = arr;
      continue;
    }

    if (item.op === "set") {
      working[item.field] = item.proposedValue;
    } else if (Array.isArray(current)) {
      const arr = [...(current as unknown[])];
      if (item.op === "add") {
        arr.push(item.proposedValue);
      } else if (item.op === "remove") {
        const idx = arr.findIndex((x) => x === item.proposedValue);
        if (idx >= 0) arr.splice(idx, 1);
      } else if (item.op === "modify") {
        const { from, to } = item.proposedValue as { from: unknown; to: unknown };
        const idx = arr.findIndex((x) => x === from);
        if (idx >= 0) arr[idx] = to;
      }
      working[item.field] = arr;
    }
  }

  return { payload: working, appliedDiff };
}
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run src/lib/vacancy-update.test.ts`
Expected: PASS (все describe зелёные).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vacancy-update.ts src/lib/vacancy-update.test.ts
git commit -m "feat(vacancy-updates): чистая логика применения диффа и определение устаревших скоров"
```

---

## Task 3: Промпт парсинга диффа

**Files:**
- Create: `src/server/prompts/vacancy-update-parse.ts`

- [ ] **Step 1: Реализовать промпт**

```ts
/**
 * Промпт: на вход текущая вакансия (структурированно) + текст уточнения со встречи.
 * На выход — JSON массив предложений по изменениям полей вакансии.
 */
export function buildVacancyUpdateParsePrompt(args: {
  vacancy: Record<string, unknown>;
  updateText: string;
}): string {
  return `Ты помогаешь рекрутёру обновить вакансию по итогам встречи с клиентом.

Текущая структура вакансии (JSON):
${JSON.stringify(args.vacancy, null, 2)}

Текст уточнения со встречи:
"""
${args.updateText}
"""

Твоя задача — предложить точечные изменения полей вакансии на основе того, что РЕАЛЬНО прозвучало в уточнении. Очень важно:

1. НЕ ПРЕДЛАГАЙ изменений, которые уже отражены в текущей вакансии. Если задача "Дизайн-системы" уже в keyTasks — не предлагай её добавить.
2. Не выдумывай и не интерпретируй сверх сказанного. Если в тексте нет информации о зарплате — не трогай salaryRange.
3. Каждое предложение должно соответствовать ОДНОМУ полю и ОДНОЙ операции.
4. Используй только эти операции (op):
   - "set" — для скалярных полей (productDescription, salaryRange, reasonForHiring, clientNotes, teamComposition, needsInternational). proposedValue = новое значение целиком.
   - "add" — добавить элемент в массив (keyTasks, requiredSkills, niceToHaveSkills, preferredDomains, requiredTools, redFlags, specialCompetencies). proposedValue = один добавляемый элемент (строка).
   - "remove" — удалить элемент из массива. proposedValue = существующий элемент массива для точного совпадения (строка).
   - "modify" — заменить элемент массива. proposedValue = { "from": "старый", "to": "новый" }.
   - Для scoringCriteria: "add" — { "criterion": "...", "weight": число 1-100, "type": "required" | "nice_to_have" | "stop_factor" }. "remove" — строка-имя критерия. "modify" — { "from": "имя", "to": { "criterion": ..., "weight": ..., "type": ... } }.
5. Если критерий уже есть, но вес другой — используй modify со scoringCriteria.
6. currentValue — что сейчас в этом поле (для UI). Для add это весь массив или null если поле пустое. Для set — текущее скалярное значение.
7. reason — одно короткое предложение, почему это предлагается (что именно в тексте уточнения это обосновывает).

Верни ТОЛЬКО валидный JSON (без markdown, без backticks) в формате:
{
  "items": [
    { "field": "имя поля", "op": "set|add|remove|modify", "currentValue": ..., "proposedValue": ..., "reason": "..." }
  ]
}

Если в тексте уточнения нет ничего, что меняет вакансию — верни { "items": [] }.`;
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/server/prompts/vacancy-update-parse.ts
git commit -m "feat(vacancy-updates): промпт парсинга диффа из уточнения"
```

---

## Task 4: Сервис оркестрации обработки

**Files:**
- Create: `src/server/services/vacancy-update.ts`

- [ ] **Step 1: Реализовать сервис**

```ts
/**
 * Обработка записи VacancyUpdate (выполняется как fire-and-forget из POST-роута):
 *   1. Читает запись из БД.
 *   2. Если kind === AUDIO и есть audioFileUrl — транскрибирует через briefing-audio.
 *   3. Гонит итоговый текст + текущую вакансию через vacancy-update-parse.
 *   4. Сохраняет proposedDiff и переводит status: PENDING / EMPTY / FAILED.
 */
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/server/db";
import { transcribeAudio, getAudioMimeType } from "@/server/services/briefing-audio";
import { callGemini } from "@/server/services/claude";
import { buildVacancyUpdateParsePrompt } from "@/server/prompts/vacancy-update-parse";

// Поля вакансии, которые видит AI при парсинге диффа.
const VACANCY_FIELDS_FOR_AI = [
  "title",
  "productDescription",
  "reasonForHiring",
  "keyTasks",
  "requiredSkills",
  "niceToHaveSkills",
  "preferredDomains",
  "requiredTools",
  "redFlags",
  "specialCompetencies",
  "needsInternational",
  "scoringCriteria",
  "salaryRange",
  "teamComposition",
  "clientNotes",
] as const;

function pickVacancyForAi(v: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of VACANCY_FIELDS_FOR_AI) out[k] = v[k];
  return out;
}

function parseJsonResponse(text: string): { items: unknown[] } {
  // Снять возможные backticks/markdown
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(cleaned);
}

export async function processVacancyUpdate(updateId: string): Promise<void> {
  try {
    const update = await prisma.vacancyUpdate.findUnique({
      where: { id: updateId },
      include: { vacancy: true },
    });
    if (!update) return;
    if (update.status !== "PROCESSING") return;

    let updateText = update.rawText?.trim() || "";
    let transcript: string | null = update.transcript;

    if (update.kind === "AUDIO" && update.audioFileUrl && !transcript) {
      const absPath = path.isAbsolute(update.audioFileUrl)
        ? update.audioFileUrl
        : path.join(process.cwd(), update.audioFileUrl);
      const buffer = await fs.readFile(absPath);
      const mimeType = getAudioMimeType(path.basename(absPath));
      if (!mimeType) throw new Error("Неподдерживаемый формат аудио");
      transcript = await transcribeAudio(buffer, mimeType);
      await prisma.vacancyUpdate.update({
        where: { id: updateId },
        data: { transcript },
      });
      updateText = [updateText, transcript].filter(Boolean).join("\n\n").trim();
    }

    if (!updateText) {
      await prisma.vacancyUpdate.update({
        where: { id: updateId },
        data: { status: "FAILED", errorMessage: "Пустой текст уточнения" },
      });
      return;
    }

    const prompt = buildVacancyUpdateParsePrompt({
      vacancy: pickVacancyForAi(update.vacancy as unknown as Record<string, unknown>),
      updateText,
    });

    const raw = await callGemini(prompt);
    const parsed = parseJsonResponse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    if (items.length === 0) {
      await prisma.vacancyUpdate.update({
        where: { id: updateId },
        data: { status: "EMPTY", proposedDiff: items },
      });
      return;
    }

    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: { status: "PENDING", proposedDiff: items },
    });
  } catch (err) {
    console.error("processVacancyUpdate failed:", err);
    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Неизвестная ошибка",
      },
    });
  }
}
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок. (Если `callGemini` имеет другую сигнатуру в текущем `claude.ts` — поправить вызов; имя берётся из существующих usages в `briefing-audio.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/server/services/vacancy-update.ts
git commit -m "feat(vacancy-updates): оркестрация обработки записи (транскрипт + парсинг диффа)"
```

---

## Task 5: API создания и листинга записей

**Files:**
- Create: `src/app/api/vacancies/[id]/updates/route.ts`

- [ ] **Step 1: Реализовать route handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/server/db";
import { getAudioMimeType, MAX_AUDIO_BYTES } from "@/server/services/briefing-audio";
import { processVacancyUpdate } from "@/server/services/vacancy-update";

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
      return NextResponse.json(
        { error: "Нужен текст или аудио" },
        { status: 400 },
      );
    }

    let audioFileUrl: string | null = null;
    let kind: "TEXT" | "AUDIO" = "TEXT";

    if (audio) {
      const mimeType = getAudioMimeType(audio.name);
      if (!mimeType) {
        return NextResponse.json(
          { error: "Поддерживаются только .m4a, .mp3, .aac" },
          { status: 400 },
        );
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: "Файл слишком большой (максимум 200 MB)" },
          { status: 400 },
        );
      }
      if (audio.size < 1024) {
        return NextResponse.json({ error: "Файл слишком маленький" }, { status: 400 });
      }
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const ext = path.extname(audio.name);
      const fileName = `vacancy-update-${randomUUID()}${ext}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      await fs.writeFile(filePath, Buffer.from(await audio.arrayBuffer()));
      audioFileUrl = filePath;
      kind = "AUDIO";
    }

    const created = await prisma.vacancyUpdate.create({
      data: {
        vacancyId,
        actor,
        kind,
        rawText,
        audioFileUrl,
        status: "PROCESSING",
      },
    });

    // Fire-and-forget: обработка идёт в фоне, клиент поллит GET.
    // ВАЖНО: рассчитано на долгоживущий Node-процесс (VPS / Railway / Render).
    // На serverless с заморозкой функции после ответа (Vercel) фон НЕ выполнится —
    // тогда нужно перейти на синхронный inline-вариант или внешнюю очередь.
    void processVacancyUpdate(created.id).catch((err) => {
      console.error("background processVacancyUpdate threw:", err);
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST vacancy update error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const updates = await prisma.vacancyUpdate.findMany({
      where: { vacancyId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(updates);
  } catch (error) {
    console.error("GET vacancy updates error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Проверить типы и сборку**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Ручная проверка (после старта dev-сервера)**

Использовать реальный id вакансии. Текстовое уточнение:
```bash
curl -s -X POST localhost:3000/api/vacancies/<VAC_ID>/updates \
  -F "rawText=Клиент уточнил: зарплата подросла до 250к, добавилась задача анализа метрик." \
  -F "actor=smoke-test" | head
# Подождать ~10-20с, затем
curl -s localhost:3000/api/vacancies/<VAC_ID>/updates | head -c 800
```
Expected: POST → 201 с `status: "PROCESSING"`. Через несколько секунд GET → массив, где первая запись имеет `status: "PENDING"` и `proposedDiff` с предложениями (или `EMPTY` если AI не нашёл изменений).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vacancies/[id]/updates/route.ts
git commit -m "feat(vacancy-updates): API создания и листинга записей"
```

---

## Task 6: API apply / dismiss / retry

**Files:**
- Create: `src/app/api/vacancies/[id]/updates/[updateId]/apply/route.ts`
- Create: `src/app/api/vacancies/[id]/updates/[updateId]/dismiss/route.ts`
- Create: `src/app/api/vacancies/[id]/updates/[updateId]/retry/route.ts`

- [ ] **Step 1: apply route**

`.../apply/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import {
  applyDiffSelection,
  diffTouchesScoringFields,
  type DiffItem,
  type SelectedItem,
} from "@/lib/vacancy-update";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id: vacancyId, updateId } = await params;
  try {
    const { selections } = (await req.json()) as { selections: SelectedItem[] };
    if (!Array.isArray(selections)) {
      return NextResponse.json({ error: "selections обязателен" }, { status: 400 });
    }

    const update = await prisma.vacancyUpdate.findUnique({
      where: { id: updateId },
      include: { vacancy: true },
    });
    if (!update || update.vacancyId !== vacancyId) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (update.status !== "PENDING") {
      return NextResponse.json(
        { error: "Запись не в статусе PENDING" },
        { status: 409 },
      );
    }

    const proposed = (update.proposedDiff || []) as unknown as DiffItem[];
    const { payload, appliedDiff } = applyDiffSelection(
      update.vacancy as unknown as Record<string, unknown>,
      proposed,
      selections,
    );

    const touchesScoring = diffTouchesScoringFields(appliedDiff);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.vacancy.update({
        where: { id: vacancyId },
        data: {
          ...payload,
          ...(touchesScoring ? { criteriaUpdatedAt: now } : {}),
        },
      });
      await tx.vacancyUpdate.update({
        where: { id: updateId },
        data: {
          status: "APPLIED",
          appliedDiff: appliedDiff as unknown as object,
          appliedAt: now,
        },
      });
    });

    return NextResponse.json({ ok: true, applied: appliedDiff.length, touchesScoring });
  } catch (error) {
    console.error("POST apply error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 2: dismiss route**

`.../dismiss/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id: vacancyId, updateId } = await params;
  try {
    const update = await prisma.vacancyUpdate.findUnique({ where: { id: updateId } });
    if (!update || update.vacancyId !== vacancyId) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (update.status !== "PENDING" && update.status !== "EMPTY") {
      return NextResponse.json({ error: "Нечего отклонять" }, { status: 409 });
    }
    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: { status: "DISMISSED" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST dismiss error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 3: retry route**

`.../retry/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { processVacancyUpdate } from "@/server/services/vacancy-update";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id: vacancyId, updateId } = await params;
  try {
    const update = await prisma.vacancyUpdate.findUnique({ where: { id: updateId } });
    if (!update || update.vacancyId !== vacancyId) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }
    if (update.status !== "FAILED") {
      return NextResponse.json({ error: "Перезапуск возможен только для FAILED" }, { status: 409 });
    }
    await prisma.vacancyUpdate.update({
      where: { id: updateId },
      data: { status: "PROCESSING", errorMessage: null },
    });
    void processVacancyUpdate(updateId).catch((err) =>
      console.error("retry processVacancyUpdate threw:", err),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST retry error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Типчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Ручная проверка**

С реальной PENDING-записью:
```bash
# apply одного пункта
curl -s -X POST localhost:3000/api/vacancies/<VAC>/updates/<UID>/apply \
  -H 'content-type: application/json' \
  -d '{"selections":[{"index":0}]}'
# dismiss другой PENDING-записи
curl -s -X POST localhost:3000/api/vacancies/<VAC>/updates/<UID2>/dismiss
```
Expected: apply → `{ok:true, applied:1, touchesScoring: true|false}`; вакансия обновилась (GET вакансии покажет новое значение); запись в `APPLIED`. dismiss → запись в `DISMISSED`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/vacancies/[id]/updates/[updateId]/
git commit -m "feat(vacancy-updates): API применения, отказа и повтора обработки"
```

---

## Task 7: API пересчёта устаревших скоров

**Files:**
- Create: `src/app/api/vacancies/[id]/rescore-stale/route.ts`

- [ ] **Step 1: Реализовать роут**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { detailedScore } from "@/server/services/detailed-scorer";
import { isStaleScore } from "@/lib/vacancy-update";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: vacancyId } = await params;
  try {
    const vacancy = await prisma.vacancy.findUnique({
      where: { id: vacancyId },
      select: { id: true, criteriaUpdatedAt: true },
    });
    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 });
    }
    if (!vacancy.criteriaUpdatedAt) {
      return NextResponse.json({ rescored: 0 });
    }

    const stale = await prisma.detailedScore.findMany({
      where: { vacancyId },
      select: { candidateId: true, createdAt: true },
    });
    const toRescore = stale.filter((s) =>
      isStaleScore(s.createdAt, vacancy.criteriaUpdatedAt),
    );

    let rescored = 0;
    for (const s of toRescore) {
      try {
        const result = await detailedScore(vacancyId, s.candidateId);
        // delete + create в транзакции — иначе createdAt не обновится:
        // `@default(now())` срабатывает только при INSERT, а у Prisma `update`
        // явное `createdAt: new Date()` тоже не помогает, если столбец только
        // дефолт. Без бампа createdAt запись осталась бы вечно устаревшей.
        await prisma.$transaction([
          prisma.detailedScore.delete({
            where: { candidateId_vacancyId: { candidateId: s.candidateId, vacancyId } },
          }),
          prisma.detailedScore.create({
            data: {
              candidateId: s.candidateId,
              vacancyId,
              overallScore: result.overallScore,
              criteriaScores: result.criteriaScores as unknown as object,
              matchExplanation: result.matchExplanation,
              strengthsForVacancy: result.strengthsForVacancy,
              gaps: result.gaps,
              clarificationQuestions: result.clarificationQuestions,
              clarificationMessage: result.clarificationMessage,
            },
          }),
        ]);
        rescored++;
      } catch (err) {
        console.error(`rescore failed for candidate ${s.candidateId}:`, err);
      }
    }

    return NextResponse.json({ rescored, total: toRescore.length });
  } catch (error) {
    console.error("POST rescore-stale error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
```

Примечание: `DetailedScore` уникален по `candidateId_vacancyId` — поэтому delete+create в одной транзакции безопасны (нет конкурирующего ключа). Других полей у модели нет — все они переписываются из `result`. Сторонние записи (`MatchResult`) не трогаем.

- [ ] **Step 2: Типчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Ручная проверка**

```bash
curl -s -X POST localhost:3000/api/vacancies/<VAC>/rescore-stale -H 'content-type: application/json' -d '{}'
```
Expected: `{rescored: N, total: M}`. Если устаревших нет (`criteriaUpdatedAt` пуст или скоры свежие) — `{rescored: 0}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/vacancies/[id]/rescore-stale/route.ts
git commit -m "feat(vacancy-updates): API пересчёта устаревших скоров"
```

---

## Task 8: UI секции «Уточнения» — компонент

**Files:**
- Create: `src/app/vacancies/[id]/vacancy-updates.tsx`

- [ ] **Step 1: Реализовать компонент**

`"use client"`. Props: `{ vacancyId: string }`.

Контракт:
- На mount `GET /api/vacancies/{vacancyId}/updates`. Хранит `updates` в state.
- Поллинг: если в списке есть `PROCESSING`, `setInterval(refetch, 3000)`. Останавливается, когда `PROCESSING` исчезают или компонент размонтирован.
- Состояние формы: `text`, `audioFile?`, `showForm`. Кнопка «+ Добавить уточнение» открывает форму (textarea + file picker для аудио, accept=`.m4a,.mp3,.aac`). Submit → `POST /api/vacancies/{id}/updates` (multipart с `rawText`, `audio`, `actor=getPipelineActor()`), затем optimistic prepend созданной записи в state и refetch.
- Timeline: каждая запись (новые сверху) — карточка с датой (русский формат), `actor`, превью `rawText` или `transcript` (3 строки + «развернуть»), бейдж статуса. Бейджи:
  - `PROCESSING` — серый «AI обрабатывает…» со спиннером.
  - `PENDING` — оранжевый «Готов дифф (N предложений)»; клик раскрывает превью.
  - `APPLIED` — зелёный «Применено N из M».
  - `DISMISSED` — приглушённый «Отклонено».
  - `EMPTY` — приглушённый «AI не нашёл изменений».
  - `FAILED` — красный «Ошибка: {errorMessage}» + кнопка «Повторить» → `POST /retry` → обновить state.
- Раскрытие `PENDING` — превью диффа: список предложений, сгруппированных по полю (`FIELD_LABELS` из `@/lib/vacancy-update`). Каждое предложение — чекбокс + поле редактирования `proposedValue` (текст; для объектов scoringCriteria — три инпута: критерий/вес/тип). Для `op: modify` показать «было → стало». Для `scoringCriteria + op: modify` пользователь правит только `to` (имя `from` — ключ для поиска и не меняется); UI редактирует объект `to`, а `from` сохраняет неизменным. Внизу — кнопки «Применить отмеченное (N)» (дизейблится при N=0) и «Отказаться от всего».
- «Применить отмеченное» → `POST /apply` body `{ selections: [{ index, editedValue? }] }` → обновить state. «Отказаться от всего» → `POST /dismiss`.
- Раскрытие `APPLIED` — список применённых пунктов (без чекбоксов), просто читабельный диф.
- Используй опаковые попапы (`bg-white dark:bg-zinc-900`) — конвенция проекта.
- Актор — из `getPipelineActor()` (`@/lib/pipeline`).

Реализуй как один компонент в одном файле; если превысит ~350 строк — выноси `<DiffPreview>` в отдельный файл `vacancy-update-diff.tsx`.

- [ ] **Step 2: Типчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Vitest**

Run: `npx vitest run`
Expected: все существующие тесты проходят (новых юнит-тестов на UI нет; верифицируем вручную).

- [ ] **Step 4: Commit**

```bash
git add "src/app/vacancies/[id]/vacancy-updates.tsx"
git commit -m "feat(vacancy-updates): UI компонент журнала уточнений (форма, timeline, diff-превью, поллинг)"
```

---

## Task 9: Интеграция на странице вакансии + стейл-бейджи

**Files:**
- Modify: `src/app/vacancies/[id]/page.tsx`

- [ ] **Step 1: Встроить `<VacancyUpdates>`**

Прочитать `src/app/vacancies/[id]/page.tsx` и в режиме просмотра (не `editMode`) добавить новую секцию «Уточнения» (заголовок + `<VacancyUpdates vacancyId={id} />`) перед секцией «Воронка». Импорт: `import VacancyUpdates from "./vacancy-updates";`.

- [ ] **Step 2: Прокинуть `criteriaUpdatedAt` в интерфейс вакансии**

Если локальный интерфейс типизирует вакансию без `criteriaUpdatedAt: string | null` — добавить поле. GET `/api/vacancies/[id]` возвращает его автоматически (это скаляр).

- [ ] **Step 3: Бейдж «Скор устарел» в списке матчинга**

В блоке рендера матч-результатов, для каждого кандидата:
- Получить `score.createdAt` (поле уже есть на `MatchResult`/`DetailedScore`).
- Если `isStaleScore(new Date(score.createdAt), vacancy.criteriaUpdatedAt ? new Date(vacancy.criteriaUpdatedAt) : null)` → рядом с процентом показать приглушённый бейдж «Скор устарел» (`amber` цвет).

Импорт: `import { isStaleScore } from "@/lib/vacancy-update";`.

- [ ] **Step 4: Кнопка «Пересчитать устаревших (N)»**

Над списком матчинга (рядом с заголовком/счётчиками) — если есть хотя бы один устаревший, показать кнопку «Пересчитать устаревших (N)». Клик → `POST /api/vacancies/{id}/rescore-stale` (актор не нужен; кнопка дизейблится пока запрос в полёте), затем рефетч вакансии. N — посчитанное число устаревших.

- [ ] **Step 5: Типчек**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Vitest**

Run: `npx vitest run`
Expected: все тесты проходят.

- [ ] **Step 7: Ручная проверка (dev-сервер)**

Открыть `/vacancies/<VAC_ID>`:
1. В секции «Уточнения» нажать «+ Добавить уточнение», ввести текст вроде «Клиент уточнил: зарплата 250к, добавить задачу анализа метрик». Submit → запись появляется со статусом «AI обрабатывает», через 5–15 с переходит в `PENDING` с превью.
2. Отметить пункт по `scoringCriteria` или `keyTasks`, нажать «Применить отмеченное» → запись `APPLIED N/M`, поле в вакансии обновилось, в списке матчинга у уже проскоренных кандидатов появился бейдж «Скор устарел».
3. Нажать «Пересчитать устаревших (N)» → после завершения бейджи пропадают, скоры обновлены.
4. Добавить ещё одно уточнение с явной чушью («Клиент сказал "привет"») → запись становится `EMPTY`.
5. Кейс ошибки протестировать не критично — оставить.

- [ ] **Step 8: Commit**

```bash
git add "src/app/vacancies/[id]/page.tsx"
git commit -m "feat(vacancy-updates): интеграция секции и стейл-бейджей на странице вакансии"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx vitest run` — все unit-тесты зелёные.
- [ ] `npx tsc --noEmit && npm run build` — чисто.
- [ ] Сквозной сценарий вручную: создать текстовое уточнение → дождаться PENDING → применить пункт по scoringCriteria → проверить, что `criteriaUpdatedAt` поднялся (GET вакансии), а в списке матчинга кандидаты помечены устаревшими → нажать «Пересчитать устаревших» → стейл пропал.
- [ ] (опционально) Один аудио-сценарий: загрузить короткую запись брифа (< 2 мин) как уточнение → проверить переход PROCESSING → PENDING.
