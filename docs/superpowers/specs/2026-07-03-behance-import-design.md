# Импорт базы дизайнеров из Behance-JSON + порционный AI-анализ — дизайн

**Версия:** 2026-07-03 (v2)
**Статус:** утверждён к реализации

## Цель

Залить ~2000 профилей дизайнеров из выгрузки Behance (JSON) в базу одним действием, без AI и без затрат. Карточка на этом этапе — имя + ссылка на портфолио (+ контакты, если есть в JSON). Полноценный AI-анализ (роль, грейд, навыки, оценки портфолио, эмбеддинг) запускается позже порциями, когда пользователь готов тратить время и деньги. **После анализа кандидат становится полноценным и участвует в матчинге.**

## Контекст

JSON — выгрузка профилей Behance. В каждой записи: `display_name`, `first_name`/`last_name`, `url` (профиль Behance), `location`/`city`/`country`, `occupation` (грязная строка), `fields`, `website` (иногда telegram/инстаграм/сайт, иногда пусто), `company` (иногда содержит email), `stats`, `images`.

**Чего в JSON нет:** резюме, грейда, опыта, навыков.

**Проверено эмпирически:**
- Скрейпер **успешно** обрабатывает живой Behance-профиль (18k символов + 18 скриншотов).
- На удалённом профиле Behance отдаёт страницу с заголовком `«Не удалось найти эту страницу. :: Behance»`, но скрейпер **этого не замечает** и возвращает 15k символов мусора (меню/футер). На 2000 профилей это сожжёт заметную часть AI-бюджета впустую.

**Ключевой факт о существующем коде** (определяет весь дизайн): роут `POST /api/candidates/upload` при загрузке **только ссылки** (без файла резюме) скрейпит портфолио и подаёт полученный текст в `parseResume` — именно оттуда берутся `role`, `grade`, `skills`, `domains`, `aiSummary`. Затем `classifyDirection` → `analyzePortfolio`/`analyzePortfolioComm` → `create` + `generateEmbedding`.

Роут `POST /api/candidates/[id]/reanalyze-portfolio` для этой цели **не подходит**: он `role`/`grade` только читает и не обновляет, эмбеддинг не трогает. Опора на него оставила бы импортированных навсегда с `role: OTHER` — то есть невидимыми для матчинга.

## Ключевые решения

- **Импорт без AI.** Заливаем всех, кого нашли в файле. Секунды, $0.
- **Роль и грейд не угадываем из JSON.** Поля в схеме обязательные → ставим заглушки `role: OTHER`, `grade: MIDDLE`. Их **заменит** AI-анализ (через `parseResume` по тексту портфолио).
- **Следствие, принятое осознанно:** импортированные не участвуют в матчинге, пока не проанализированы (хард-фильтр отбирает по `role: vacancy.role`). После анализа — участвуют.
- **Заливаем всех**, без фильтрации по `fields`/`occupation`.
- **Дедуп по Behance-URL профиля.**
- **Порционный анализ по кнопке** — пользователь выбирает темп и расход.
- **Отсечка мёртвых профилей до AI** — экономия бюджета.
- **`occupation`/`fields`/`stats` из JSON не сохраняем** (YAGNI): всё это AI и так увидит при скрейпинге, а `aiSummary` он перезапишет своим.

## Архитектура

### Схема (Prisma)

Одно аддитивное изменение — новый статус:

```prisma
enum CandidateStatus {
  NEW
  PARSED
  PORTFOLIO_ANALYZED
  ANALYSIS_FAILED   // ← новый: анализ не удался (мёртвый профиль/ошибка)
  ACTIVE
  IN_PROCESS
  ARCHIVED
}
```

Без него неудачный кандидат остаётся `NEW` и попадает в каждую следующую пачку, снова жгя бюджет.

Статусы в фиче: `NEW` (импортирован, очередь) → `PORTFOLIO_ANALYZED` (успех) или `ANALYSIS_FAILED` (не вышло).

### Чистая логика (Vitest)

`src/lib/behance-import.ts`:
- `extractBehanceProfiles(json: unknown): BehanceProfile[]` — рекурсивно обходит произвольную вложенность и собирает объекты, у которых есть строковый `url`, содержащий `behance.net/`, и непустое имя (`display_name` либо `first_name`/`last_name`). Устойчиво к обёрткам вокруг массива.
- `mapProfileToCandidate(p): CandidateImportRow | null` — маппинг; `null` если нет имени или URL.
- `isDeadBehancePage(title: string): boolean` — `true`, если заголовок содержит (регистронезависимо) `«не удалось найти эту страницу»` или `«page not found»`.

Маппинг:

| JSON | → Candidate |
|---|---|
| `display_name`, иначе `first_name + last_name` (trim) | `name` |
| `url` | `portfolioLinks: [url]` |
| `website`, если НЕ t.me и непустой | добавить вторым в `portfolioLinks` |
| `location`, иначе `city, country` (непустые части) | `location` |
| `website`, если хост `t.me` | `telegramContact` |
| `company`, если содержит `@` и `.` | `email` |
| — | `role: "OTHER"`, `grade: "MIDDLE"`, `status: "NEW"`, `source: "behance"` |

`occupation`, `fields`, `stats`, `images` — не переносим.

### Импорт

`POST /api/candidates/import-json` — multipart с JSON-файлом:
1. Распарсить, `extractBehanceProfiles`.
2. Смаппить; невалидные (без имени/URL) → счётчик `skippedInvalid`.
3. Дедуп внутри файла по Behance-URL.
4. Дедуп против базы: `prisma.candidate.findMany({ where: { portfolioLinks: { hasSome: behanceUrls } }, select: { portfolioLinks: true } })` — **сравниваем только по Behance-URL профиля** (не по `website`, иначе общий сайт-агрегатор у двух людей даст ложный пропуск). Найденные исключаем → `skippedExisting`.
5. `createMany` пачкой. **Без `skipDuplicates`** — уникального индекса на `portfolioLinks` нет, флаг был бы no-op и создавал ложное чувство защиты; реальный дедуп — шаги 3–4.
6. Ответ: `{ found, imported, skippedExisting, skippedInvalid }`.

2000 профилей — единицы МБ, лимит тела уже поднят (`middlewareClientMaxBodySize: "210mb"`).

### Порционный AI-анализ

Новый сервис `src/server/services/candidate-analysis.ts`, функция `analyzeImportedCandidate(candidateId): Promise<void>` — **повторяет путь `upload`-роута, но с `update` вместо `create`**:

1. Взять кандидата; первая ссылка из `portfolioLinks` — целевая.
2. `scrapePortfolio(url)`.
3. **Если `isDeadBehancePage(scrapeResult.title)` → `status: ANALYSIS_FAILED`, выход. AI не вызывается.**
4. `parseResume(scrapeResult.text, …)` → `role`, `grade`, `name`, `skills`, `domains`, `specializations`, `aiSummary` и пр.
5. `classifyDirection(...)` → направление (product/communication).
   **Отличие от `upload`:** там при `needsManualClassification` возвращается 409 и человек выбирает. В batch-режиме отвечать некому → берём `classification.direction` как есть, без блокировки.
6. `analyzePortfolio` или `analyzePortfolioComm` (по направлению) → оценки и `portfolioAnalysis`.
7. `prisma.candidate.update`: `role`, `grade`, `specializations`, `domains`, `skills`, `tools`, оценки по шкалам, `aiSummary`, `portfolioAnalysis`, `resumeRawText` (текст скрейпа), `status: "PORTFOLIO_ANALYZED"`.
   **Имя не перезаписываем** — из JSON оно достовернее, чем вывод AI по портфолио.
8. `generateEmbedding(...)` → `embedding`, `embeddingText`, `embeddingModel`, `embeddingUpdatedAt` (как в `upload`).
9. Любая ошибка на шагах 2–8 → `status: "ANALYSIS_FAILED"`, не бросаем наружу (fire-and-forget безопасен).

**Существующий роут `reanalyze-portfolio` не трогаем** — его поведение остаётся прежним. Новый сервис самостоятелен.

Эндпоинты:
- `POST /api/candidates/analyze-batch` — body `{ limit: 10|20|50 }`. Берёт `limit` кандидатов со `status: "NEW"` и непустым `portfolioLinks`, запускает fire-and-forget обработку с параллелизмом **3**, сразу отвечает `{ started: N }`. `export const maxDuration = 300` (как в аудио-роутах; при `limit: 50` обработка может не уложиться — см. Пограничные случаи).
- `GET /api/candidates/analyze-batch/status` — `{ pending, failed }` (счётчики по `NEW` / `ANALYSIS_FAILED`).
- `POST /api/candidates/[id]/analyze-import` — точечный (пере)запуск `analyzeImportedCandidate(id)` для одного кандидата; fire-and-forget, отвечает `{ ok: true }`. Нужен для повтора после `ANALYSIS_FAILED`.

**Почему отдельный эндпоинт для повтора, а не существующая кнопка в карточке.** Кнопка «Переанализировать портфолио» в `src/app/candidates/[id]/page.tsx` бьёт в `reanalyze-portfolio` — тот самый роут, который `role`/`grade` не обновляет. Если использовать её для повтора импортированного, кандидат получит `status: PORTFOLIO_ANALYZED`, но останется `role: OTHER` — будет выглядеть проанализированным и при этом останется невидимым для хард-фильтра. Поэтому повтор идёт через новый сервис.

## UI

### Импорт — блок на `/candidates/upload`

Рядом с существующей ручной загрузкой — блок «Импорт из JSON»:
- File picker (`accept=".json"`), кнопка «Импортировать».
- Результат: «Импортировано M, пропущено (уже в базе) K, без имени/ссылки L».
- Ошибки: «Не удалось разобрать файл» / «Не найдено профилей Behance в файле» — inline.

### Порционный анализ — на `/candidates`

В шапке, только если `pending > 0`:
- «N кандидатов без AI-анализа» + селект (10/20/50) + кнопка «Проанализировать».
- На время работы кнопка дизейблится; клиент поллит `GET .../status` каждые 5с и показывает, как уменьшается `pending`.
- Если `failed > 0` — приглушённо «M с ошибкой анализа» (информативно).

**Повтор для `ANALYSIS_FAILED`.** В карточке кандидата, если `status === "ANALYSIS_FAILED"`, показывается кнопка «Повторить анализ» → `POST /api/candidates/[id]/analyze-import` (НЕ существующая «Переанализировать портфолио» — см. выше). Массового повтора всех failed в v1 нет.

**Новый статус в UI.** Добавление `ANALYSIS_FAILED` требует двух правок отображения: подпись в `CANDIDATE_STATUS_LABELS` (`src/lib/constants.ts`) — напр. «Ошибка анализа», и класс бейджа в списке кандидатов (`src/app/candidates/page.tsx`, где статусы красятся) — красный/приглушённый.

## Пограничные случаи

- **Битый JSON** → 400 «Не удалось разобрать файл».
- **JSON не того формата** (нет behance-профилей) → 400 «Не найдено профилей Behance в файле».
- **Запись без имени/URL** → пропуск, `skippedInvalid`.
- **Кандидат уже есть** (по Behance-URL) → пропуск, `skippedExisting`; существующая карточка не перезаписывается.
- **Мёртвый профиль** → `ANALYSIS_FAILED` без вызова AI.
- **Behance забанил/таймаут/ошибка AI** → `ANALYSIS_FAILED`, повтор точечно позже.
- **Кандидат без `portfolioLinks`** → в пачку не берётся.
- **Низкая уверенность классификатора направления** → берём предложенное направление, не блокируем (в batch некому отвечать).
- **Параллельные нажатия «Проанализировать»** → возможен захват пересекающихся наборов; на v1 не защищаем транзакционно (внутренний инструмент, один пользователь), кнопка дизейблится на время запроса.
- **Пачка не успела за `maxDuration`** (риск при `limit: 50`: ~50 профилей × скрейп+AI при параллелизме 3 может превысить 300с) → рантайм оборвёт обработку, недообработанные останутся `NEW` и просто попадут в следующую пачку. Данные не портятся, потерь нет. Поэтому дефолт в селекте — **20**; 50 доступно, но на свой риск.

## Что не делаем (YAGNI)

- Фильтрацию по `fields`/`occupation` при импорте.
- Угадывание роли/грейда эвристикой из `occupation`.
- Сохранение `occupation`/`fields`/`stats`/`images` из JSON.
- Обновление существующих карточек при повторном импорте (только пропуск).
- Автозапуск анализа после импорта.
- Отдельную таблицу очереди — очередь выражается статусом `NEW`.
- Массовый повтор всех `ANALYSIS_FAILED`.
- Рефакторинг существующего `reanalyze-portfolio`.
