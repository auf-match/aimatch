# Drag-and-drop перемещение по этапам воронки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перемещать кандидатов по этапам воронки перетаскиванием (drag-and-drop) на обеих досках — странице вакансии и общей странице «Этапы» — сохранив существующее меню перемещения по клику.

**Architecture:** `@dnd-kit/core`. Общий модуль `src/components/pipeline-dnd.tsx` с обёртками `DraggableCardWrapper` / `DroppableColumnWrapper` и хелпером `usePipelineSensors()` (PointerSensor, `activationConstraint: { distance: 8 }` — отделяет клик от drag). Оба board-компонента оборачивают ряд колонок в `<DndContext>`, колонки — в droppable, карточки — в draggable, и на `onDragEnd` вызывают уже существующий `handleMove(row, targetStage)`. Меню по клику остаётся (порог 8px не даёт клику стартовать drag).

**Tech Stack:** Next.js 15 (App Router, client components), React 19, `@dnd-kit/core`, Tailwind v4. Spec: `docs/superpowers/specs/2026-07-03-pipeline-drag-and-drop-design.md`.

---

## Карта файлов

**Создаётся:**
- `src/components/pipeline-dnd.tsx` — `"use client"`; общие DnD-обёртки и хелпер сенсоров.

**Изменяются:**
- `package.json` / `package-lock.json` — зависимость `@dnd-kit/core`.
- `src/app/vacancies/[id]/pipeline-board.tsx` — обернуть в DndContext, карточки draggable, колонки droppable, onDragEnd → handleMove.
- `src/app/pipeline/all-pipelines-board.tsx` — то же (id карточки составной).

**Ключевой контракт `handleMove` (уже есть в обоих):** `handleMove(targetRow: PipelineRow, toStage: PipelineStage)` — оптимистичное обновление state + POST на move-эндпойнт + revert рефетчем при ошибке. Drag НЕ меняет эту функцию, только вызывает.

**Резолвинг row по draggable-id (прямой lookup, без парсинга):**
- Доска вакансии: draggable id = `row.candidateId`; поиск `rows.find(r => r.candidateId === activeId)`.
- Общая доска: draggable id = `\`${row.candidateId}::${row.vacancyId}\``; поиск `rows.find(r => \`${r.candidateId}::${r.vacancyId}\` === activeId)`.

Тестов юнит нет (drag — интеграционный UI); проверка вручную.

---

## Task 1: Зависимость + общий DnD-модуль

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/pipeline-dnd.tsx`

- [ ] **Step 1: Установить `@dnd-kit/core`**

Run: `npm install @dnd-kit/core`
Expected: пакет добавлен в `dependencies`, `package-lock.json` обновлён, без ошибок.

- [ ] **Step 2: Проверить, что установилось**

Run: `node -e "require('@dnd-kit/core'); console.log('ok')"`
Expected: печатает `ok`.

- [ ] **Step 3: Реализовать `src/components/pipeline-dnd.tsx`**

```tsx
"use client";

import { useSensor, useSensors, PointerSensor, useDraggable, useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

/**
 * Сенсоры для досок воронки. Порог 8px отделяет клик (открытие меню)
 * от перетаскивания: пока курсор не сдвинулся на 8px — drag не стартует,
 * и onClick карточки срабатывает нормально.
 */
export function usePipelineSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
}

/**
 * Обёртка карточки: делает её draggable. Прокидывает listeners/attributes
 * на корневой div, чтобы drag стартовал с самой карточки. `isDragging`
 * приглушает оригинал (клон рисуется в DragOverlay родителя).
 */
export function DraggableCardWrapper({
  id, children, className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${className ?? ""} ${isDragging ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * Обёртка колонки: делает её droppable. `isOver` подсвечивает колонку
 * при наведении перетаскиваемой карточки.
 */
export function DroppableColumnWrapper({
  id, children, className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-inset ring-primary/40" : ""}`}
    >
      {children}
    </div>
  );
}
```

Примечание про `listeners` на корне карточки: `@dnd-kit` слушает pointerdown и стартует drag только после порога 8px; клики (pointerup без движения) проходят к `onClick` карточки. Отдельный «хэндл» не нужен.

Примечание про подсветку колонки: `BoardColumn` в обоих board'ах имеет корневой div с `overflow-hidden`, поэтому используем `ring-inset` (внутренняя обводка) — обычный `ring` был бы обрезан.

- [ ] **Step 4: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/pipeline-dnd.tsx
git commit -m "feat(drag-drop): зависимость @dnd-kit и общий модуль pipeline-dnd"
```

---

## Task 2: Drag на доске вакансии

**Files:**
- Modify: `src/app/vacancies/[id]/pipeline-board.tsx`

Прочитать текущий файл. Он рендерит: `<DndContext>`-нет, ряд колонок (`BoardColumn`), каждая — список `CandidateCard`; есть `handleMove(targetRow, toStage)`, `groupPipelineByStage(rows)`, `PIPELINE_STAGE_ORDER`, state `rows`, `menuState`. Карточка `CandidateCard` имеет `onClick` (открывает меню).

Изменения:

- [ ] **Step 1: Импорты**

Добавить:
```ts
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { usePipelineSensors, DraggableCardWrapper, DroppableColumnWrapper } from "@/components/pipeline-dnd";
```

- [ ] **Step 2: Сенсоры и активная карточка**

В компоненте `PipelineBoard` добавить:
```ts
const sensors = usePipelineSensors();
const [activeId, setActiveId] = useState<string | null>(null);
```

- [ ] **Step 3: Обернуть карточку в draggable**

В `BoardColumn` (или там, где рендерится `<CandidateCard>`), обернуть каждую карточку:
```tsx
<DraggableCardWrapper key={row.candidateId} id={row.candidateId}>
  <CandidateCard row={row} onMenu={onCardMenu} />
</DraggableCardWrapper>
```
(Если `CandidateCard` сам был `key`-элементом в map — перенести `key` на wrapper.)

`CandidateCard` НЕ трогаем внутри — его `onClick` продолжает открывать меню.

- [ ] **Step 4: Обернуть колонку в droppable**

Внешний контейнер колонки в `BoardColumn` обернуть:
```tsx
<DroppableColumnWrapper id={stage} className="...существующие классы контейнера...">
  {/* существующее содержимое колонки: header + список карточек */}
</DroppableColumnWrapper>
```
Либо навесить droppable на существующий корневой div колонки — эквивалентно; главное, чтобы droppable-id = `stage` (значение `PipelineStage`).

- [ ] **Step 5: Обернуть ряд колонок в DndContext + DragOverlay**

Ряд колонок (`<div className="flex gap-2.5 min-w-max ...">{PIPELINE_STAGE_ORDER.map(...)}</div>`) обернуть в `<DndContext>`:
```tsx
<DndContext
  sensors={sensors}
  autoScroll
  onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
  onDragEnd={handleDragEnd}
>
  {/* существующий overflow-x wrapper + ряд колонок */}
  <DragOverlay>
    {activeId
      ? (() => {
          const row = rows.find((r) => r.candidateId === activeId);
          return row ? <CandidateCard row={row} onMenu={() => {}} /> : null;
        })()
      : null}
  </DragOverlay>
</DndContext>
```

- [ ] **Step 6: Обработчик `handleDragEnd`**

```ts
const handleDragEnd = (e: DragEndEvent) => {
  setActiveId(null);
  const overId = e.over?.id;
  if (!overId) return; // брошено мимо
  const row = rows.find((r) => r.candidateId === String(e.active.id));
  if (!row) return;
  const toStage = overId as PipelineStage;
  if (row.stage === toStage) return; // та же колонка — no-op
  handleMove(row, toStage);
};
```

- [ ] **Step 7: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.
Run: `npx vitest run`
Expected: существующие тесты проходят.
НЕ запускать dev/build — контроллер проверит визуально.

- [ ] **Step 8: Commit**

```bash
git add "src/app/vacancies/[id]/pipeline-board.tsx"
git commit -m "feat(drag-drop): перетаскивание карточек на доске вакансии"
```

---

## Task 3: Drag на общей доске «Этапы»

**Files:**
- Modify: `src/app/pipeline/all-pipelines-board.tsx`

Тот же паттерн, что в Task 2, но id карточки — составной, и есть фильтр (не влияет на drag).

- [ ] **Step 1: Импорты** (как в Task 2)

```ts
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { usePipelineSensors, DraggableCardWrapper, DroppableColumnWrapper } from "@/components/pipeline-dnd";
```

- [ ] **Step 2: Сенсоры + активная карточка**

```ts
const sensors = usePipelineSensors();
const [activeId, setActiveId] = useState<string | null>(null);
```

- [ ] **Step 3: Обернуть карточку в draggable (составной id)**

```tsx
<DraggableCardWrapper key={`${row.candidateId}::${row.vacancyId}`} id={`${row.candidateId}::${row.vacancyId}`}>
  <CandidateCard row={row} onMenu={onCardMenu} />
</DraggableCardWrapper>
```

- [ ] **Step 4: Обернуть колонку в droppable** (id = `stage`, как в Task 2).

- [ ] **Step 5: DndContext + DragOverlay**

```tsx
<DndContext
  sensors={sensors}
  autoScroll
  onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
  onDragEnd={handleDragEnd}
>
  {/* существующий overflow-x wrapper + ряд колонок */}
  <DragOverlay>
    {activeId
      ? (() => {
          const row = rows.find((r) => `${r.candidateId}::${r.vacancyId}` === activeId);
          return row ? <CandidateCard row={row} onMenu={() => {}} /> : null;
        })()
      : null}
  </DragOverlay>
</DndContext>
```

- [ ] **Step 6: `handleDragEnd` (составной lookup)**

```ts
const handleDragEnd = (e: DragEndEvent) => {
  setActiveId(null);
  const overId = e.over?.id;
  if (!overId) return;
  const row = rows.find((r) => `${r.candidateId}::${r.vacancyId}` === String(e.active.id));
  if (!row) return;
  const toStage = overId as PipelineStage;
  if (row.stage === toStage) return;
  handleMove(row, toStage);
};
```

- [ ] **Step 7: Проверить типы + тесты**

Run: `npx tsc --noEmit` → без ошибок.
Run: `npx vitest run` → существующие тесты проходят.
НЕ запускать dev/build.

- [ ] **Step 8: Commit**

```bash
git add "src/app/pipeline/all-pipelines-board.tsx"
git commit -m "feat(drag-drop): перетаскивание карточек на общей доске Этапы"
```

---

## Финальная проверка (после всех задач)

- [ ] `npx tsc --noEmit && npm run build` — чисто.
- [ ] `npx vitest run` — существующие тесты зелёные.
- [ ] Ручной сквозной сценарий (dev-сервер, после чистого рестарта `rm -rf .next && npm run dev` если кэш подозрителен):
  1. **Доска вакансии:** перетащить карточку в другую колонку → этап меняется, перезагрузка сохраняет.
  2. **Общая доска «Этапы»:** то же.
  3. **Клик** по карточке по-прежнему открывает меню (быстрый клик, без сдвига — drag не стартует).
  4. Перетащить и бросить на **ту же** колонку → ничего не происходит (API не дёргается — проверить Network).
  5. Бросить **мимо** доски → карточка возвращается, ничего не меняется.
  6. Во время drag — колонка под курсором подсвечивается (`isOver`), оригинал приглушён, клон едет за курсором.
  7. Перетащить к правому краю широкой доски → авто-скролл.
