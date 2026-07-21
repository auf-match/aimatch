# Заполнение вакансии из вставленного текста — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать на `/vacancies/new` третий способ автозаполнения формы — вставить текст → AI заполняет что может, пустое оставляет для ручного ввода.

**Architecture:** Логику раскладки распарсенных полей выносим в чистую тестируемую функцию `buildFieldsUpdate` (её начинают звать и аудио-путь, и новый текстовый — DRY). Тонкий роут `parse-text` переиспользует существующую `parseVacancyFromTranscript(text)`. UI — textarea + кнопка рядом с карточками загрузки PDF/аудио.

**Tech Stack:** Next.js 15 (App Router, route handlers), TypeScript (strict), Vitest, Gemini (через существующий сервис). Спека: `docs/superpowers/specs/2026-07-21-vacancy-text-parse-design.md`.

---

## Карта файлов

**Создаются:**
- `src/app/vacancies/new/parse-fill.ts` — общие типы (`VacancyFormData`, `ScoringCriterion`, `FieldStatus`) + чистая `buildFieldsUpdate`.
- `src/app/vacancies/new/parse-fill.test.ts` — Vitest.
- `src/app/api/vacancies/parse-text/route.ts` — POST-роут.

**Изменяются:**
- `src/app/vacancies/new/page.tsx` — импорт типов и `buildFieldsUpdate` из `parse-fill`; аудио-хендлер переходит на общую функцию; добавляется UI-блок и хендлер текста.

**Не трогаем:** `parseVacancyFromTranscript`, промпт `briefing-parse` (только если проверка покажет, что мажет — см. финальную проверку), PDF/аудио-роуты, схему БД.

---

## Task 1: Чистая функция раскладки `buildFieldsUpdate` (TDD) + рефактор аудио-хендлера

Сейчас логика раскладки (~строки 270-334 в `page.tsx`) зашита в аудио-хендлер. Выносим в чистую функцию, покрываем тестами, аудио-путь переводим на неё. Текстовый путь (Task 3) будет звать её же.

**Files:**
- Create: `src/app/vacancies/new/parse-fill.ts`, `src/app/vacancies/new/parse-fill.test.ts`
- Modify: `src/app/vacancies/new/page.tsx`

- [ ] **Step 1: Написать падающие тесты**

`src/app/vacancies/new/parse-fill.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFieldsUpdate, type ParsedFields } from "./parse-fill";

describe("buildFieldsUpdate", () => {
  it("применяет заполненные high-поля, hints пуст", () => {
    const fields: ParsedFields = {
      title: { value: "Продуктовый дизайнер", confidence: "high" },
      role: { value: "PRODUCT_DESIGNER", confidence: "high" },
      keyTasks: { value: ["дизайн-система"], confidence: "high" },
    };
    const { data, hints } = buildFieldsUpdate(fields);
    expect(data.title).toBe("Продуктовый дизайнер");
    expect(data.role).toBe("PRODUCT_DESIGNER");
    expect(data.keyTasks).toEqual(["дизайн-система"]);
    expect(hints.size).toBe(0);
  });

  it("null / пустая строка / пустой массив → дефолт + hint missing", () => {
    const fields: ParsedFields = {
      title: { value: null, confidence: null },
      location: { value: "  ", confidence: null },
      keyTasks: { value: [], confidence: null },
    };
    const { data, hints } = buildFieldsUpdate(fields);
    expect(data.title).toBe("");
    expect(data.location).toBe("");
    expect(data.keyTasks).toEqual([]);
    expect(hints.get("title")).toBe("missing");
    expect(hints.get("location")).toBe("missing");
    expect(hints.get("keyTasks")).toBe("missing");
  });

  it("непустое значение с confidence low → hint low", () => {
    const fields: ParsedFields = {
      salaryRange: { value: "200-250к", confidence: "low" },
    };
    const { data, hints } = buildFieldsUpdate(fields);
    expect(data.salaryRange).toBe("200-250к");
    expect(hints.get("salaryRange")).toBe("low");
  });

  it("применяет дефолты для полей-энамов и чисел", () => {
    const { data } = buildFieldsUpdate({});
    expect(data.role).toBe("PRODUCT_DESIGNER");
    expect(data.grade).toBe("MIDDLE");
    expect(data.designersNeeded).toBe(1);
    expect(data.employmentType).toBe("FULL_TIME");
    expect(data.workFormat).toBe("REMOTE");
    expect(data.needsInternational).toBe(false);
    expect(data.hiringStages).toBeNull();
  });

  it("неизвестный ключ не роняет и не попадает в data", () => {
    const fields = { totallyUnknown: { value: "x", confidence: "high" } } as unknown as ParsedFields;
    const { data } = buildFieldsUpdate(fields);
    expect("totallyUnknown" in data).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падают**

Run: `npx vitest run src/app/vacancies/new/parse-fill.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-fill"`.

- [ ] **Step 3: Реализовать `src/app/vacancies/new/parse-fill.ts`**

Типы `ScoringCriterion`, `VacancyFormData`, `FieldStatus` переносятся СЮДА из `page.tsx` (точь-в-точь как там объявлены, см. `page.tsx:16,32-109`). Функция повторяет текущую inline-логику 1:1.

```ts
// Общие типы формы вакансии + чистая логика раскладки AI-распарсенных полей.
// Зовут клиентские хендлеры на /vacancies/new: аудио-путь (handleAudioUpload)
// и текстовый (handleTextParse). Сами роуты parse-audio/parse-text только
// возвращают fields — раскладку делает клиент.

export interface ScoringCriterion {
  criterion: string;
  weight: number;
  type: "required" | "nice_to_have" | "stop_factor";
}

export interface VacancyFormData {
  title: string;
  clientName: string;
  clientLead: string;
  productDescription: string;
  reasonForHiring: string;
  role: string;
  grade: string;
  designersNeeded: number;
  employmentType: string;
  workFormat: string;
  location: string;
  timezone: string;
  salaryRange: string;
  desiredStartDate: string;
  duration: string;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  needsInternational: boolean;
  specialCompetencies: string[];
  redFlags: string[];
  portfolioReferences: string[];
  teamComposition: string;
  decisionMaker: string;
  hiringStages: number | null;
  testTask: string;
  scoringCriteria: ScoringCriterion[];
  clientNotes: string;
  internalNotes: string;
}

// "low" — AI неуверен; "missing" — AI не нашёл значение.
export type FieldStatus = "low" | "missing";

export interface ParsedField {
  value: unknown;
  confidence: "high" | "low" | null;
}
export type ParsedFields = Record<string, ParsedField | undefined>;

export interface FieldsUpdate {
  data: Partial<VacancyFormData>;
  hints: Map<string, FieldStatus>;
}

/**
 * Раскладывает fields из AI-парсера в частичный апдейт формы + карту подсветок.
 * Пустое значение (null/undefined/пустая строка/пустой массив) → дефолт поля,
 * статус "missing". Непустое значение с confidence "low" → статус "low".
 */
export function buildFieldsUpdate(fields: ParsedFields): FieldsUpdate {
  const hints = new Map<string, FieldStatus>();
  const data: Partial<VacancyFormData> = {};

  const apply = <K extends keyof VacancyFormData>(
    key: K,
    rawValue: unknown,
    defaultValue: VacancyFormData[K],
  ) => {
    const v = rawValue ?? defaultValue;
    (data[key] as VacancyFormData[K]) = v as VacancyFormData[K];
  };

  for (const [key, info] of Object.entries(fields)) {
    const v = info?.value;
    const conf = info?.confidence;
    const isMissing =
      v === null ||
      v === undefined ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === "string" && v.trim() === "");
    if (isMissing) hints.set(key, "missing");
    else if (conf === "low") hints.set(key, "low");
  }

  apply("title", fields.title?.value, "");
  apply("clientName", fields.clientName?.value, "");
  apply("clientLead", fields.clientLead?.value, "");
  apply("productDescription", fields.productDescription?.value, "");
  apply("reasonForHiring", fields.reasonForHiring?.value, "");
  apply("role", fields.role?.value, "PRODUCT_DESIGNER");
  apply("grade", fields.grade?.value, "MIDDLE");
  apply("designersNeeded", fields.designersNeeded?.value, 1);
  apply("employmentType", fields.employmentType?.value, "FULL_TIME");
  apply("workFormat", fields.workFormat?.value, "REMOTE");
  apply("location", fields.location?.value, "");
  apply("timezone", fields.timezone?.value, "");
  apply("salaryRange", fields.salaryRange?.value, "");
  apply("desiredStartDate", fields.desiredStartDate?.value, "");
  apply("duration", fields.duration?.value, "");
  apply("keyTasks", fields.keyTasks?.value, []);
  apply("requiredSkills", fields.requiredSkills?.value, []);
  apply("niceToHaveSkills", fields.niceToHaveSkills?.value, []);
  apply("preferredDomains", fields.preferredDomains?.value, []);
  apply("requiredTools", fields.requiredTools?.value, []);
  apply("needsInternational", fields.needsInternational?.value, false);
  apply("specialCompetencies", fields.specialCompetencies?.value, []);
  apply("redFlags", fields.redFlags?.value, []);
  apply("portfolioReferences", fields.portfolioReferences?.value, []);
  apply("teamComposition", fields.teamComposition?.value, "");
  apply("decisionMaker", fields.decisionMaker?.value, "");
  apply("hiringStages", fields.hiringStages?.value, null);
  apply("testTask", fields.testTask?.value, "");
  apply("scoringCriteria", fields.scoringCriteria?.value, []);
  apply("clientNotes", fields.clientNotes?.value, "");
  apply("internalNotes", fields.internalNotes?.value, "");

  return { data, hints };
}
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `npx vitest run src/app/vacancies/new/parse-fill.test.ts`
Expected: PASS.

- [ ] **Step 5: Перевести `page.tsx` на общие типы + функцию**

В `src/app/vacancies/new/page.tsx`:
1. Удалить локальные объявления `interface ScoringCriterion`, `interface VacancyFormData`, `type FieldStatus` (строки ~16, 32-75). Добавить в блок импортов:
   ```ts
   import {
     buildFieldsUpdate,
     type VacancyFormData,
     type ScoringCriterion,
     type FieldStatus,
   } from "./parse-fill";
   ```
   (`INITIAL_DATA` и `FieldHintsContext` остаются в `page.tsx` — их не трогаем; `FieldHintsContext` использует импортированный теперь `FieldStatus`.)
   **Важно:** `type FieldStatus` сейчас объявлен ВЫШE блока импортов (строка 16, до `import {...} from "@/lib/constants"` на строке 23). Импорт из `./parse-fill` кладём в общий блок импортов, старое объявление на строке 16 удаляем — `FieldHintsContext` ниже подхватит импортированный тип.
2. В аудио-хендлере заменить весь блок раскладки (от `const fields = json.fields as ...` (строка ~270) до `setBriefingLoaded(true);` **включительно** (строка ~335) — то есть захватить и `setData`, и `setFieldHints`, и `setBriefingLoaded`, чтобы не остался дублирующий вызов) на:
   ```ts
   const { data: newData, hints } = buildFieldsUpdate(
     json.fields as import("./parse-fill").ParsedFields,
   );
   setData((prev) => ({ ...prev, ...newData }));
   setFieldHints(hints);
   setBriefingLoaded(true);
   ```
   (`ParsedFields` тоже можно добавить в именованный импорт вместо inline `import(...)` — на усмотрение имплементера, лишь бы без дублей типа.)

- [ ] **Step 6: Проверка**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → все тесты зелёные.
Run: `npm run build` → успех (страница `/vacancies/new` собирается).

- [ ] **Step 7: Commit**

```bash
git add src/app/vacancies/new/parse-fill.ts src/app/vacancies/new/parse-fill.test.ts src/app/vacancies/new/page.tsx
git commit -m "refactor(vacancy): чистая buildFieldsUpdate, аудио-путь переведён на неё"
```

---

## Task 2: Роут `POST /api/vacancies/parse-text`

**Files:**
- Create: `src/app/api/vacancies/parse-text/route.ts`

- [ ] **Step 1: Реализовать роут**

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  parseVacancyFromTranscript,
  BriefingAudioError,
} from "@/server/services/briefing-audio";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const text = body?.text;
    if (typeof text !== "string" || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Текст слишком короткий — вставьте описание вакансии" },
        { status: 400 },
      );
    }

    const parsed = await parseVacancyFromTranscript(text.trim());
    // summary не возвращаем — форме не нужен, текст не храним
    return NextResponse.json({ fields: parsed.fields });
  } catch (error) {
    if (error instanceof BriefingAudioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[parse-text] error:", error);
    const msg = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

Перед финалом свериться: `parseVacancyFromTranscript` и `BriefingAudioError` экспортируются из `@/server/services/briefing-audio` (да — их же импортирует `parse-audio/route.ts`).

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npm run build` → успех, роут `ƒ /api/vacancies/parse-text` в списке.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/vacancies/parse-text/route.ts
git commit -m "feat(vacancy): роут parse-text (вставленный текст → поля вакансии)"
```

---

## Task 3: UI-блок ввода текста + хендлер

**Files:**
- Modify: `src/app/vacancies/new/page.tsx`

- [ ] **Step 1: Состояние + хендлер**

Рядом с состоянием аудио (`audioParsing` и т.п., ~строки 139-147) добавить:
```ts
const [textInput, setTextInput] = useState("");
const [textParsing, setTextParsing] = useState(false);
```

Рядом с `handleAudioUpload` добавить хендлер (переиспользует `buildFieldsUpdate`, уже импортированную в Task 1):
```ts
const handleTextParse = useCallback(async () => {
  const text = textInput.trim();
  if (text.length < 20) return;
  setTextParsing(true);
  setError("");
  try {
    const res = await fetch("/api/vacancies/parse-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || `Ошибка ${res.status}`);
    }
    const { data: newData, hints } = buildFieldsUpdate(json.fields);
    setData((prev) => ({ ...prev, ...newData }));
    setFieldHints(hints);
    setBriefingLoaded(true); // прячет кнопки загрузки; summary-карточка не появится (briefingSummary === null)
  } catch (err) {
    setError(
      err instanceof Error
        ? `AI не смог структурировать текст: ${err.message}. Заполните форму вручную.`
        : "Не удалось обработать текст. Заполните форму вручную.",
    );
  } finally {
    setTextParsing(false);
  }
}, [textInput]);
```

- [ ] **Step 2: UI-карточка**

В интро-блоке, рядом с карточками аудио/PDF (после аудио-блока `{/* Audio briefing upload */}` ~строка 456, перед summary-карточкой), добавить блок, показываемый на тех же условиях, что и кнопки загрузки (`!briefingLoaded && !pdfLoaded`), в стиле соседних карточек:

Контракт блока:
- `<textarea>` (`value={textInput}`, `onChange`), плейсхолдер «Вставьте описание вакансии: письмо от клиента, сообщение, заметки…», `disabled={textParsing}`, разумная высота (напр. `rows={5}`), классы бордера/паддингов как у соседних dashed-контейнеров (`rounded-lg border border-dashed border-foreground/20 ...`).
- Кнопка «Заполнить из текста»: `onClick={handleTextParse}`, `disabled={textParsing || textInput.trim().length < 20 || pdfParsing || audioParsing}`. В процессе — спиннер + «AI заполняет вакансию…» (как у аудио/PDF loading-state).
- Весь блок — внутри условия `!briefingLoaded && !pdfLoaded ? (…) : null`, чтобы после успешного парсинга (любого из способов) он скрывался, как и кнопки загрузки.

Точную вёрстку имплементер повторяет по образцу существующих карточек аудио (`page.tsx:421-456`) и PDF (`page.tsx:490-560`) — те же контейнеры, спиннер, отступы (`mb-3`/`mb-8`). Не изобретать новый визуальный язык.

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → тесты проходят.
НЕ запускать dev/build — контроллер проверит визуально.

- [ ] **Step 4: Commit**

```bash
git add src/app/vacancies/new/page.tsx
git commit -m "feat(vacancy): UI ввода текста для автозаполнения формы"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx vitest run` — все тесты зелёные (включая `buildFieldsUpdate`).
- [ ] `npx tsc --noEmit && npm run build` — чисто; роут `/api/vacancies/parse-text` в выводе.
- [ ] Ручной сквозной сценарий (dev-сервер):
  1. `/vacancies/new` → в интро виден блок ввода текста рядом с загрузкой PDF/аудио.
  2. Вставить реальное описание вакансии (письмо/сообщение) → «Заполнить из текста».
  3. Форма заполнилась; поля, которых не было в тексте, — пустые и подсвечены «AI не нашёл, заполни вручную»; неуверенные — жёлтой рамкой.
  4. Дозаполнить вручную → создать вакансию → сохранилась корректно (никакой лишний транскрипт/summary не сохранён).
  5. Пустая summary-карточка НЕ появляется (проверка, что `briefingLoaded` без `briefingSummary` ничего не рисует).
- [ ] **Проверка риска промпта** (ключевое): прогнать 2-3 реальных текста разного стиля (сухое описание, сообщение в ТГ, письмо). Оценить адекватность извлечения — не выдумывает ли AI лишнего из-за «транскрипт»-рамки промпта.
  - Если ок → готово.
  - Если мажет → применить фолбэк из спеки: параметризовать `buildBriefingParsePrompt(input, source)`, `source: "text"` смягчает формулировки про устную речь (вводная + правила confidence «на встрече проговорили» → «в тексте указано»); `parse-text` передаёт `source: "text"`. Схема ответа без изменений. Это отдельный маленький коммит, если понадобится.
