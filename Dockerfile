# АУФ Match — образ для Railway (и любого Docker-хостинга).
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

# Прод-сборка Next.js.
RUN npm run build

EXPOSE 3000

# На старте: применяем миграции к БД (Neon), затем поднимаем сервер.
# Railway задаёт $PORT — next start читает его из окружения автоматически.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
