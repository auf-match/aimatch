# АУФ Match — AI-система матчинга дизайнеров

## О проекте

АУФ Match — внутренний инструмент рекрутингового агентства АУФ, специализирующегося на найме дизайнеров. Система автоматически анализирует резюме и портфолио кандидатов, структурирует данные, и матчит кандидатов с вакансиями, выдавая отфильтрованный рабочий пул из 30-60 человек вместо 2600.

**Продукт не заменяет дизайн-лида в оценке кандидатов.** Продукт убирает мусор и даёт рабочий пул, который дизайн-лид просматривает и корректирует сам.

### Пользователи
- **Дизайн-лид** (Слава) — просматривает отфильтрованный пул, оценивает качество портфолио, принимает финальные решения по кандидатам
- **Рекрутер** — управляет вакансиями, загружает кандидатов, формирует шорт-листы

### Главные боли, которые решаем
1. При новой вакансии никто не просматривает всю базу (2600+ кандидатов) — упускаются хорошие люди из архива
2. Квалификация пула дизайнеров отнимает очень много времени дизайн-лида
3. Рекрутеру нужно много времени на сборку подборки
4. Нет механизма отслеживания роста кандидатов (джуны/миддлы, которые через год могут стать крутыми)

### Критерий успеха
- Рабочий пул не содержит явно нерелевантных кандидатов — «мусора» в списке нет
- В пуле присутствуют кандидаты, которых раньше бы пропустили (из архивной базы)
- Сокращение времени дизайн-лида на первичный скрининг минимум в 3-5 раз
- Больший объём кандидатов, которых удаётся просмотреть

---

## Стек технологий

### Backend
- **Runtime**: Node.js (TypeScript)
- **Framework**: Express.js или Fastify
- **ORM**: Prisma
- **Database**: PostgreSQL
- **File storage**: локальная файловая система (MVP), S3-совместимое хранилище (позже)

### Frontend
- **Framework**: Next.js (React, TypeScript)
- **Styling**: Tailwind CSS
- **UI компоненты**: shadcn/ui
- **State management**: React Query (TanStack Query) для серверного состояния

### AI / ML
- **LLM**: Claude API (Anthropic) — claude-sonnet-4-20250514
- **Задачи AI**: парсинг резюме, анализ портфолио, матчинг кандидат↔вакансия, генерация summary
- **Веб-скрейпинг**: Playwright (для парсинга портфолио с сайтов и Notion)

### Инфраструктура (MVP)
- **Деплой**: VPS или Railway/Render
- **Переменные окружения**: .env файл

---

## Структура проекта

```
auf-match/
├── CLAUDE.md                    # ← этот файл
├── .env.example
├── package.json
├── tsconfig.json
│
├── prisma/
│   └── schema.prisma            # схема БД
│
├── src/
│   ├── server/                  # Backend
│   │   ├── index.ts             # точка входа, Express app
│   │   ├── routes/
│   │   │   ├── candidates.ts    # CRUD кандидатов
│   │   │   ├── vacancies.ts     # CRUD вакансий
│   │   │   ├── matching.ts      # эндпоинты матчинга
│   │   │   └── upload.ts        # загрузка файлов
│   │   ├── services/
│   │   │   ├── resume-parser.ts     # парсинг резюме через Claude
│   │   │   ├── portfolio-analyzer.ts # анализ портфолио
│   │   │   ├── matching-engine.ts    # движок матчинга
│   │   │   ├── scraper.ts           # веб-скрейпинг портфолио
│   │   │   └── claude.ts            # обёртка над Claude API
│   │   ├── prompts/
│   │   │   ├── resume-parse.ts      # промпт парсинга резюме
│   │   │   ├── portfolio-analyze.ts # промпт анализа портфолио
│   │   │   ├── matching.ts          # промпт матчинга
│   │   │   └── summary.ts          # промпт генерации summary
│   │   └── utils/
│   │       ├── file-processing.ts   # извлечение текста из PDF/DOCX
│   │       └── validators.ts
│   │
│   └── app/                     # Frontend (Next.js app router)
│       ├── layout.tsx
│       ├── page.tsx             # дашборд
│       ├── candidates/
│       │   ├── page.tsx         # список кандидатов
│       │   ├── [id]/page.tsx    # карточка кандидата
│       │   └── upload/page.tsx  # загрузка нового кандидата
│       ├── vacancies/
│       │   ├── page.tsx         # список вакансий
│       │   ├── [id]/page.tsx    # вакансия + результаты матчинга
│       │   └── new/page.tsx     # создание вакансии
│       └── components/
│           ├── CandidateCard.tsx
│           ├── VacancyForm.tsx
│           ├── MatchResults.tsx
│           ├── ScoreBadge.tsx
│           └── ...
│
├── uploads/                     # загруженные файлы (gitignore)
└── scripts/
    └── seed.ts                  # тестовые данные
```

---

## Схема базы данных (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// КАНДИДАТЫ
// ============================================

model Candidate {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // --- Базовые данные (из резюме) ---
  name                   String
  role                   CandidateRole
  grade                  Grade
  yearsOfExperience      Int?
  specializations        String[]      // ["product design", "UX research"]
  domains                String[]      // ["fintech", "e-commerce", "SaaS"]
  segment                Segment?      // B2B, B2C, BOTH
  platforms              String[]      // ["mobile", "web", "desktop"]
  skills                 String[]      // ["research", "design systems", "prototyping"]
  tools                  String[]      // ["Figma", "Sketch"]
  location               String?
  timezone               String?
  languages              Json?         // [{"lang": "English", "level": "C1"}]
  salaryExpectations     String?
  education              String?

  // --- Флаги опыта ---
  hasBigtechExperience      Boolean @default(false)
  hasStudioExperience       Boolean @default(false)
  hasInternationalExperience Boolean @default(false)

  // --- AI-анализ ---
  aiSummary              String?       // краткое описание от AI
  aiStrengths            String[]      // сильные стороны
  aiConcerns             String[]      // риски / пробелы
  aiConfidenceScore      Int?          // 0-100, уверенность парсинга

  // --- Глубокий AI-анализ (из портфолио) ---
  systemThinking         Int?          // 0-100
  productMaturity        Int?          // 0-100
  visualStrength         Int?          // 0-100
  uxStrength             Int?          // 0-100
  argumentationQuality   Int?          // 0-100
  metricsImpact          Int?          // 0-100
  researchDepth          Int?          // 0-100

  // --- Контакты и источник ---
  telegramContact        String?
  email                  String?
  linkedinUrl            String?
  source                 String?       // откуда пришёл кандидат

  // --- Статус ---
  status                 CandidateStatus @default(NEW)

  // --- Файлы и портфолио ---
  resumeFileUrl          String?       // путь к файлу резюме
  resumeRawText          String?       // извлечённый текст резюме
  portfolioLinks         String[]      // ссылки на портфолио
  portfolioAnalysis      Json?         // полный JSON анализа портфолио

  // --- Опыт работы ---
  experiences            Experience[]

  // --- Связи ---
  matchResults           MatchResult[]
  shortlistEntries       ShortlistEntry[]
  notes                  CandidateNote[]

  // --- Ручные корректировки ---
  manualOverrides        Json?         // поля, исправленные вручную
}

model Experience {
  id          String    @id @default(cuid())
  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  company         String
  role            String
  startDate       String?
  endDate         String?
  duration        String?
  keyAchievements String[]
  isBigtech       Boolean @default(false)
  isStudio        Boolean @default(false)
}

model CandidateNote {
  id          String    @id @default(cuid())
  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  authorName  String                // кто оставил заметку
  content     String
  createdAt   DateTime  @default(now())
}

// ============================================
// ВАКАНСИИ
// ============================================

model Vacancy {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // --- Основная информация ---
  title                  String
  status                 VacancyStatus   @default(OPEN)
  clientName             String?
  clientLead             String?         // лид со стороны клиента
  productDescription     String?         // описание продукта/команды/проекта
  reasonForHiring        String?         // почему возникла потребность

  // --- Параметры позиции ---
  role                   CandidateRole
  grade                  Grade
  designersNeeded        Int             @default(1)
  employmentType         EmploymentType  @default(FULL_TIME)
  workFormat             WorkFormat      @default(REMOTE)
  location               String?
  timezone               String?
  salaryRange            String?
  desiredStartDate       String?
  duration               String?         // продолжительность контракта

  // --- Требования ---
  keyTasks               String[]        // ключевые задачи
  requiredSkills         String[]        // требуемые навыки
  niceToHaveSkills       String[]        // будет плюсом
  preferredDomains       String[]        // желателен опыт в
  requiredTools          String[]        // владение инструментами
  needsInternational     Boolean         @default(false)
  specialCompetencies    String[]        // узкоспециализированные компетенции
  redFlags               String[]        // стоп-факторы

  // --- Портрет кандидата ---
  portfolioReferences    String[]        // референсы / примеры портфолио
  teamComposition        String?         // с кем будет работать
  decisionMaker          String?         // кто принимает решение
  hiringStages           Int?            // количество этапов
  testTask               String?         // описание тестового задания

  // --- Веса критериев для матчинга ---
  // JSON формат: [{"criterion": "enterprise UX", "weight": 30, "type": "required"}, ...]
  // type: "required" | "nice_to_have" | "stop_factor"
  scoringCriteria        Json?

  // --- Внутренние заметки ---
  clientNotes            String?         // комментарии по клиенту
  internalNotes          String?

  // --- Приоритеты ---
  // JSON: [{"skill": "product thinking", "priority": 1}, ...]
  clientPriorities       Json?

  // --- Связи ---
  matchResults           MatchResult[]
  shortlist              ShortlistEntry[]

  openedAt               DateTime        @default(now())
  closedAt               DateTime?
}

// ============================================
// МАТЧИНГ
// ============================================

model MatchResult {
  id          String    @id @default(cuid())
  createdAt   DateTime  @default(now())

  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  vacancyId   String
  vacancy     Vacancy   @relation(fields: [vacancyId], references: [id], onDelete: Cascade)

  // --- Скоринг ---
  overallScore           Int             // 0-100, итоговый % соответствия
  criteriaScores         Json            // [{"criterion": "enterprise UX", "score": 85, "weight": 30, "explanation": "..."}]

  // --- AI-объяснения ---
  matchExplanation       String          // почему подходит
  strengthsForVacancy    String[]        // сильные стороны под эту вакансию
  gaps                   String[]        // чего не хватает
  clarificationQuestions String[]        // что нужно доуточнить у кандидата
  clarificationMessage   String?         // готовое сообщение для рекрутера

  // --- Ручная корректировка ---
  manualScoreOverride    Int?            // ручная коррекция score
  humanFeedback          String?         // обратная связь человека
  feedbackRating         FeedbackRating? // GOOD, BAD, NEUTRAL

  @@unique([candidateId, vacancyId])
}

model ShortlistEntry {
  id          String    @id @default(cuid())
  createdAt   DateTime  @default(now())

  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  vacancyId   String
  vacancy     Vacancy   @relation(fields: [vacancyId], references: [id], onDelete: Cascade)

  addedBy     String                    // кто добавил
  notes       String?
  status      ShortlistStatus @default(PENDING)

  @@unique([candidateId, vacancyId])
}

// ============================================
// ENUMS
// ============================================

enum CandidateRole {
  PRODUCT_DESIGNER
  UX_DESIGNER
  UI_DESIGNER
  COMMUNICATION_DESIGNER
  UX_RESEARCHER
  DESIGN_LEAD
  ART_DIRECTOR
  BRAND_DESIGNER
  MOTION_DESIGNER
  OTHER
}

enum Grade {
  JUNIOR
  MIDDLE
  MIDDLE_PLUS
  SENIOR
  SENIOR_PLUS
  LEAD
  HEAD
}

enum Segment {
  B2B
  B2C
  BOTH
}

enum CandidateStatus {
  NEW               // только загружен
  PARSED            // AI обработал резюме
  PORTFOLIO_ANALYZED // портфолио проанализировано
  ACTIVE            // готов к матчингу
  IN_PROCESS        // в работе по вакансии
  ARCHIVED          // в архиве
}

enum VacancyStatus {
  DRAFT
  OPEN
  IN_PROGRESS
  PAUSED
  CLOSED
  FILLED
}

enum EmploymentType {
  FULL_TIME
  PART_TIME
  CONTRACT
}

enum WorkFormat {
  REMOTE
  HYBRID
  OFFICE
}

enum FeedbackRating {
  GOOD
  BAD
  NEUTRAL
}

enum ShortlistStatus {
  PENDING
  CONTACTED
  INTERESTED
  NOT_INTERESTED
  INTERVIEWING
  OFFERED
  HIRED
  REJECTED
}
```

---

## AI-промпты

Все промпты хранятся в `src/server/prompts/`. Каждый промпт — отдельный файл, экспортирующий функцию, которая принимает контекст и возвращает строку.

### Принципы промптов
1. Всегда возвращать чистый JSON (без markdown, без backticks)
2. Для неизвестных полей возвращать `null`, не выдумывать
3. confidence_score показывает, насколько AI уверен в извлечённых данных
4. Промпт матчинга получает на вход структурированную вакансию + структурированного кандидата

### Ключевые промпты

**resume-parse.ts** — извлечение структурированных данных из резюме. На вход: текст/PDF резюме. На выход: JSON с полями кандидата.

**portfolio-analyze.ts** — анализ портфолио по скрейпнутому контенту. На вход: текст со страницы портфолио + скриншоты кейсов. На выход: оценки по шкалам (визуал, продуктовое мышление, метрики, процесс и т.д.) + описание кейсов.

**matching.ts** — сравнение кандидата с вакансией. На вход: JSON кандидата + JSON вакансии с весами критериев. На выход: overall score, оценки по каждому критерию с весом, объяснение, сильные стороны, пробелы, вопросы для уточнения.

**summary.ts** — генерация summary и сообщения для рекрутера. На вход: результат матчинга. На выход: готовое сообщение кандидату в TOV Прагматики.

---

## План разработки MVP

### Фаза 1: Фундамент + Загрузка кандидатов (неделя 1-2)

**Задача**: пользователь загружает резюме (PDF/DOCX) + ссылку на портфолио → система парсит и создаёт структурированную карточку кандидата.

1. Инициализация проекта (Next.js + Express + Prisma + PostgreSQL)
2. Настройка базы данных, миграции
3. Эндпоинт загрузки файла (multer)
4. Сервис извлечения текста из PDF (pdf-parse) и DOCX (mammoth)
5. Сервис парсинга резюме через Claude API
6. Сервис скрейпинга портфолио (Playwright: Notion, личные сайты)
7. Сервис анализа портфолио через Claude API (текст + скриншоты)
8. API: POST /api/candidates (загрузка + парсинг)
9. API: GET /api/candidates, GET /api/candidates/:id
10. UI: страница загрузки кандидата
11. UI: список кандидатов
12. UI: карточка кандидата с возможностью редактирования

### Фаза 2: Вакансии (неделя 3)

**Задача**: создание вакансий со структурированными требованиями и весами критериев.

1. API: CRUD вакансий
2. UI: форма создания вакансии (все поля из портрета позиции)
3. AI-превращение свободного текста в структурированный scorecard
4. Настройка весов критериев (drag-and-drop приоритизация)
5. Режим уточняющих вопросов по вакансии
6. UI: список вакансий
7. UI: страница вакансии

### Фаза 3: Матчинг (неделя 4-5)

**Задача**: по вакансии получить ранжированный список кандидатов с % соответствия.

1. Движок матчинга: берёт вакансию + всех кандидатов, прогоняет через AI
2. Batch-обработка (не гонять 2600 кандидатов через AI — сначала фильтрация по hard criteria, потом AI-скоринг топ-N)
3. Предварительная фильтрация: роль, грейд, платформа, домен, локация → отсечь явно нерелевантных
4. AI-скоринг оставшихся: Claude оценивает каждого по критериям вакансии
5. Ранжирование по overall score с учётом весов
6. API: POST /api/vacancies/:id/match
7. API: GET /api/vacancies/:id/matches
8. UI: страница результатов матчинга (список кандидатов, отсортированных по score)
9. UI: по каждому кандидату — объяснение, сильные стороны, пробелы, вопросы
10. UI: генерация сообщения кандидату для доуточнений

### Фаза 4: Shortlist + Human-in-the-loop (неделя 5-6)

1. UI: выбор кандидатов в шорт-лист
2. UI: ручная коррекция score / перемещение кандидатов
3. UI: редактирование карточки кандидата → пересчёт %
4. Сохранение обратной связи (фидбек по качеству рекомендаций)
5. Экспорт шорт-листа

---

## Переменные окружения (.env)

```
DATABASE_URL=postgresql://user:password@localhost:5432/auf_match
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
UPLOAD_DIR=./uploads
NODE_ENV=development
```

---

## Команды

```bash
# Установка зависимостей
npm install

# Создание базы данных
npx prisma migrate dev

# Запуск в dev-режиме
npm run dev

# Сид тестовых данных
npx tsx scripts/seed.ts
```

---

## Важные решения

1. **Точность > полнота**: лучше показать меньше кандидатов, но релевантных, чем засыпать слабыми. Если в топ-10 меньше 3 сильных — продукт бесполезен.

2. **Предфильтрация перед AI**: не гонять всех 2600+ кандидатов через Claude. Сначала SQL-фильтрация по hard criteria (роль, грейд, платформа), затем AI-скоринг топ-100-200.

3. **Веса критериев задаёт пользователь**: каждая вакансия имеет свой набор критериев с весами (%). Итоговый score = взвешенная сумма.

4. **Критерии делятся на 3 типа**: обязательные (не прошёл — не попадает в список), желательные (влияют на score), стоп-факторы (автоматический отсев).

5. **Портфолио на старте**: парсим Notion и личные сайты через Playwright. Behance и Figma — следующая итерация.

6. **Human-in-the-loop обязателен**: AI рекомендует, человек корректирует. Обратная связь сохраняется для улучшения системы.

7. **TOV сообщений**: все автогенерируемые сообщения кандидатам — в тоне Прагматики (профессионально, уважительно, по делу).
