# АУФ Match — образ для любого Docker-хостинга.
#
# Базовый node-образ + системные библиотеки Chromium ставим через
# `playwright install --with-deps` — так браузер для скрейпинга портфолио
# всегда совпадает с версией пакета playwright и не требует ручной возни
# с apt-зависимостями. output: standalone НЕ используем ради простоты:
# в проде запускаем обычный `next start` с полным node_modules.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# --- Зависимости (кешируется, пока не менялись package*.json) ---
COPY package.json package-lock.json ./
# devDependencies нужны для сборки: там @types/*, typescript, tailwind.
# --include=dev обязателен: выше стоит NODE_ENV=production, а в этом режиме
# `npm ci` молча пропускает devDependencies — и сборка падает на первом же
# файле с «Could not find a declaration file for module ...».
RUN npm ci --include=dev

# --- Исходники ---
COPY . .

# Prisma client — до next build (сборка импортирует @prisma/client).
RUN npx prisma generate

# Chromium + системные зависимости для Playwright.
RUN npx playwright install --with-deps chromium

# DATABASE_URL на этапе сборки: `next build` инстанцирует PrismaClient при
# сборе данных страниц, и без переменной падает ещё до обращения к базе.
# Хостинги, прокидывающие переменные сервиса в сборку сами, это скрывали;
# в чистом `docker build` строку нужно задать явно. Значение фиктивное,
# соединения не открывает: настоящее приходит в рантайме из окружения
# контейнера. ARG, а не ENV — не остаётся в образе.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build

# Прод-сборка Next.js.
RUN npm run build

EXPOSE 3000

# На старте: применяем миграции к БД (Neon), затем поднимаем сервер.
# Порт берётся из $PORT, если задан, иначе 3000 — next start читает его сам.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
