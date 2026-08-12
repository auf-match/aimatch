import { PrismaClient } from "@prisma/client";

/**
 * Клиент Prisma с явно заданным пулом соединений.
 *
 * Без настроек Prisma вычисляет размер пула из числа ядер, а в контейнере
 * видит ядра хоста — на Railway это давало пул на 97 соединений против
 * пулера Neon. Когда соединения зависали, пул выедался, и КАЖДЫЙ запрос
 * к базе висел до таймаута: статика и страницы без БД при этом отвечали
 * за полсекунды, то есть снаружи это выглядело как «отвалилась база».
 *
 * connection_limit — сколько соединений держит один контейнер.
 * pool_timeout — сколько ждать свободное соединение, прежде чем упасть.
 *   Лучше быстрая понятная ошибка, чем запрос, висящий минуту.
 * pgbouncer=true — обязателен для пулера Neon: он работает в transaction
 *   mode, где подготовленные выражения между запросами не переживают.
 *
 * Значения из окружения имеют приоритет: если в DATABASE_URL параметр уже
 * задан руками, мы его не трогаем.
 */
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const params = url.searchParams;

    if (!params.has("connection_limit")) params.set("connection_limit", "10");
    if (!params.has("pool_timeout")) params.set("pool_timeout", "20");
    // Пулер Neon узнаётся по «-pooler» в хосте.
    if (url.hostname.includes("-pooler") && !params.has("pgbouncer")) {
      params.set("pgbouncer", "true");
    }

    return url.toString();
  } catch {
    // Невалидный URL — отдаём как есть, пусть Prisma ругается понятно.
    return raw;
  }
}

/** Что реально применилось к строке подключения — для /api/health. */
export function poolSettings(): Record<string, string> {
  const built = buildDatabaseUrl();
  if (!built) return {};
  try {
    const p = new URL(built).searchParams;
    return {
      connection_limit: p.get("connection_limit") ?? "по умолчанию",
      pool_timeout: p.get("pool_timeout") ?? "по умолчанию",
      pgbouncer: p.get("pgbouncer") ?? "нет",
    };
  } catch {
    return {};
  }
}

// В dev Next.js перезагружает модули на каждое изменение. Без кэша в globalThis
// каждая перезагрузка создавала бы новый клиент со своим пулом.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
