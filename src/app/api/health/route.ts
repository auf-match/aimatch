import { NextResponse } from "next/server";
import { prisma, poolSettings } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — диагностика окружения на сервере.
 *
 * Показывает, видит ли контейнер переменные окружения и доходит ли до базы.
 * Значения секретов НЕ раскрываются — только факт наличия и длина, чтобы
 * поймать обрезанную/пустую строку подключения.
 *
 * Закрыт общим Basic Auth (middleware), снаружи без пароля недоступен.
 */
export async function GET() {
  const dbUrl = process.env.DATABASE_URL ?? "";

  // Разбираем строку подключения, не показывая пароль.
  let dbTarget = "не задан";
  if (dbUrl) {
    try {
      const u = new URL(dbUrl);
      dbTarget = `${u.protocol}//${u.username}:***@${u.hostname}${u.pathname}${u.search}`;
    } catch {
      dbTarget = "НЕВАЛИДНЫЙ URL";
    }
  }

  const env = {
    NODE_ENV: process.env.NODE_ENV ?? null,
    DATABASE_URL_length: dbUrl.length,
    DATABASE_URL_target: dbTarget,
    GEMINI_API_KEY_set: !!process.env.GEMINI_API_KEY,
    UPLOAD_DIR: process.env.UPLOAD_DIR ?? null,
    BASIC_AUTH_set: !!process.env.BASIC_AUTH_USER && !!process.env.BASIC_AUTH_PASS,
    pool: poolSettings(),
  };

  // Пробуем реально сходить в базу.
  let db: Record<string, unknown>;
  try {
    const started = Date.now();
    const candidates = await prisma.candidate.count();
    const vacancies = await prisma.vacancy.count();
    db = { ok: true, candidates, vacancies, ms: Date.now() - started };
  } catch (error) {
    db = {
      ok: false,
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message.slice(0, 800) : String(error).slice(0, 800),
    };
  }

  return NextResponse.json({ env, db }, { status: 200 });
}
