# Временная страница мониторинга AI-анализа — дизайн

**Версия:** 2026-07-21
**Статус:** утверждён к реализации

## Проблема

После импорта из Huntflow в очереди на порционный AI-анализ стоит ~2213 кандидатов (`status: NEW`, `source: huntflow`/`behance`). Анализ гоняется пачками (`analyze-batch`, `CONCURRENCY = 3`), каждый кандидат — до ~3 минут (скрейп портфолио + несколько AI-вызовов). Сейчас невозможно увидеть:
1. **кого анализирует прямо сейчас** — статус кандидата остаётся `NEW` всю обработку и меняется только в самом конце (`PORTFOLIO_ANALYZED`/`PARSED`/`ANALYSIS_FAILED`), поэтому по БД «в процессе» не отличить от «ещё в очереди»;
2. **у кого ошибка и какая** — при сбое пишется только `status: ANALYSIS_FAILED` + лог в консоль сервера; текст ошибки нигде не сохраняется.

Нужен временный монитор на время большого прогона. **Инструмент временный** — уберётся вручную, когда очередь будет разобрана.

## Принятые решения

1. **«В обработке сейчас»** — из in-memory трекера в процессе сервиса анализа (не из БД). Проект работает одним долгоживущим Node-процессом (VPS/Railway, см. `CLAUDE.md`), поэтому Map в памяти корректно переживает между запросами. При перезапуске сервера список пустеет — приемлемо для временного инструмента, отдельный статус `PROCESSING` в схему не вводим.
2. **Текст ошибки** — новое поле `lastAnalysisError` в `Candidate`, сервис пишет туда сообщение при каждом сбое. Смотреть логи сервера на 2000+ кандидатах непрактично.
3. **Обновление** — авто-поллинг раз в 4 секунды.
4. **Точка входа** — прямая ссылка `/candidates/analyze-status`, в сайдбар не добавляем (временный инструмент).

## Архитектура

### 1. In-memory трекер — `src/server/services/analysis-tracker.ts`

Новый модуль, единственная ответственность — держать список «сейчас в обработке».

```ts
interface ProcessingEntry {
  id: string;
  name: string;
  portfolioLink: string;
  startedAt: number; // Date.now()
}

// Модульный синглтон. Живёт в памяти процесса.
const processing = new Map<string, ProcessingEntry>();

export function markStarted(entry: ProcessingEntry): void;
export function markFinished(id: string): void;
export function getProcessing(): ProcessingEntry[]; // снимок, отсортирован по startedAt
```

**Важно про синглтон в dev-режиме:** Next.js в dev пересобирает модули на hot-reload, из-за чего модульная переменная может пересоздаться и трекер потеряет записи посреди прогона. Кладём Map в `globalThis` (стандартный Next.js-приём против hot-reload; в `src/server/db.ts` его сейчас НЕ применяют — там просто `new PrismaClient()`, так что образца в проекте нет). В проде (один процесс, без hot-reload) это тоже безопасно.

**Обязательно — типизация global (проект на `strict: true`):** доступ к `globalThis.__analysisTracker` без объявления не компилируется (TS2339). В проекте нет ни одного global-augmentation для образца, поэтому объявляем прямо в модуле трекера:
```ts
declare global {
  // eslint-disable-next-line no-var
  var __analysisTracker: Map<string, ProcessingEntry> | undefined;
}
const processing: Map<string, ProcessingEntry> =
  (globalThis.__analysisTracker ??= new Map());
```

### 2. Инструментирование `candidate-analysis.ts`

`analyzeImportedCandidate` оборачивается трекером. `markStarted` — после того как кандидат найден в БД и известна ссылка (нельзя раньше: до `findUnique` нет имени/ссылки; если кандидат не найден или нет ссылки — ранний `return`, трекер не трогаем). `markFinished` — в `finally`, чтобы гарантированно снять запись при любом исходе.

Текущая структура функции — один внешний `try/catch`, где `catch` ставит `ANALYSIS_FAILED`, плюс ранние `return` для «нет кандидата» и «нет ссылки». Нужна аккуратность:
- «нет кандидата» → `return` до трекинга, ничего не трекаем;
- «нет ссылки» → пишем `ANALYSIS_FAILED` + `lastAnalysisError: "Нет ссылки на портфолио"`, трекер не задействован (обработка не начиналась);
- после `markStarted` — обернуть всё в `try/finally` c `markFinished`, при этом существующий `try/catch` (обработка ошибок по стадиям) сохраняется внутри. То есть добавляется внешний `finally`, а не переписывается вся логика.

**Запись `lastAnalysisError`:** в каждом месте, где сейчас выставляется `status: "ANALYSIS_FAILED"` (их три: нет ссылки, мёртвая Behance-страница, внешний catch), добавить `lastAnalysisError` с осмысленным текстом:
- нет ссылки → `"Нет ссылки на портфолио"`;
- мёртвая страница → `"Страница портфолио недоступна (dead page)"`;
- внешний catch → `String(err instanceof Error ? err.message : err)`, обрезать до 500 символов.

При успешном завершении (`PORTFOLIO_ANALYZED`/`PARSED`) поле НЕ трогаем — это `undefined` в Prisma-update, старое значение остаётся. Оно неважно при успехе; обнулять не нужно.

### 3. Схема — `prisma/schema.prisma`

В модель `Candidate` добавить:
```prisma
  lastAnalysisError String?
```
Миграция аддитивная (`ALTER TABLE ... ADD COLUMN`), без DROP.

### 4. API — `GET /api/candidates/analyze-status-debug/route.ts`

```ts
{
  processing: Array<{ id: string; name: string; portfolioLink: string; startedAt: number }>,
  failed: Array<{ id: string; name: string; lastAnalysisError: string | null; updatedAt: string }>,
  pending: number, // status: NEW, source in IMPORT_SOURCES, portfolioLinks не пуст — как в analyze-batch/status
}
```

- `processing` — из `getProcessing()`.
- `failed` — `prisma.candidate.findMany({ where: { status: "ANALYSIS_FAILED", source: { in: IMPORT_SOURCES } }, orderBy: { updatedAt: "desc" }, take: 50, select: { id, name, lastAnalysisError, updatedAt } })`.
- `pending` — тот же `count`, что в существующем `analyze-batch/status` (переиспользовать фильтр), чтобы видеть, сколько ещё осталось.

Имя `analyze-status-debug`, чтобы не путать с существующим `analyze-batch/status` и подчеркнуть временность.

### 5. Страница — `src/app/candidates/analyze-status/page.tsx`

`"use client"`, поллинг `GET /api/candidates/analyze-status-debug` раз в 4 секунды (интервал чистится на unmount; guard от гонки при размонтировании). Три блока:

- **Шапка:** «Осталось в очереди: {pending}» + «В обработке: {processing.length}» + «С ошибкой: {failed.length}».
- **В обработке сейчас** — строки: имя (ссылка на `/candidates/{id}`), домен портфолио-ссылки, «идёт {N} с» (из `startedAt`, считается на клиенте). Пусто → «Сейчас никто не обрабатывается».
- **Ошибки (последние 50)** — строки: имя (ссылка на карточку), текст `lastAnalysisError`, когда (`updatedAt`). Пусто → «Ошибок нет».

Стиль — минимальный, в духе существующих страниц (`bg-card`, `text-sm`, `text-muted-foreground`, красный текст ошибки как `text-xs text-red-500`). Без пагинации, без фильтров, без действий (ретрай уже есть в карточке кандидата — кнопка «Повторить анализ» для `ANALYSIS_FAILED`).

## Пограничные случаи

- **Кандидат завершился между поллами** — исчезает из `processing` при следующем поле, нормально.
- **Перезапуск сервера во время прогона** — `processing` пустеет, но `failed`/`pending` из БД корректны. Приемлемо (временный инструмент).
- **Один и тот же кандидат в обработке дважды** (повторный запуск пачки — известное ограничение батча) — Map по `id`, вторая запись перезапишет первую, дубля в списке не будет.
- **`markFinished` для незнакомого id** — no-op (Map.delete молча игнорирует).
- **Гонка `finally` vs исключение до `markStarted`** — `markStarted` вызывается до `try/finally`-обёртки только после успешного `findUnique`; если исключение раньше — трекер не задействован, снимать нечего.

## Тестирование

- Vitest на `analysis-tracker.ts`: `markStarted`/`getProcessing`/`markFinished` — добавление, снимок отсортирован по `startedAt`, удаление, `markFinished` неизвестного id не бросает, двойной `markStarted` одного id не создаёт дубль.
- Роут и страница — без юнит-тестов (тонкая обёртка над БД + трекером); проверяются вручную на живом прогоне: открыть `/candidates/analyze-status` во время работающей пачки, убедиться, что видно 1-3 «в обработке», по завершении они уходят, упавшие появляются в «Ошибках» с текстом.

## Что не делаем (YAGNI)

- Не вводим статус `PROCESSING` в enum (in-memory достаточно для временного инструмента).
- Не храним историю всех попыток — только последняя ошибка.
- Не трогаем механизм батчинга/конкурентности.
- Не добавляем пункт в сайдбар, не делаем автоудаление страницы — уберём вручную.
- Не добавляем ретрай на эту страницу — он уже есть в карточке кандидата.
