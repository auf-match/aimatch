/**
 * Backfill: генерирует семантические эмбеддинги для существующих кандидатов.
 *
 * По умолчанию обрабатывает только кандидатов БЕЗ эмбеддинга.
 * Флаг --force перегенерирует у всех.
 *
 * Запуск:
 *   npx tsx scripts/backfill-embeddings.ts
 *   npx tsx scripts/backfill-embeddings.ts --force
 */

import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  generateEmbedding,
  buildCandidateEmbeddingText,
  EMBEDDING_MODEL,
} from "../src/server/services/embeddings";

dotenv.config();

const prisma = new PrismaClient();

const FORCE = process.argv.includes("--force");
const BATCH_SIZE = 5; // параллельных вызовов за раз (бережём free-tier rate limit)
const BATCH_DELAY_MS = 1000; // пауза между батчами

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Фильтруем в JS: старые строки имеют embedding = NULL (миграция без default),
  // а Prisma-фильтр isEmpty не ловит NULL. Читаем всех и отбираем без вектора.
  const all = await prisma.candidate.findMany({ include: { experiences: true } });
  const candidates = FORCE ? all : all.filter((c) => !c.embedding || c.embedding.length === 0);

  console.log(
    `[backfill] Найдено ${candidates.length} из ${all.length} кандидатов для обработки${FORCE ? " (--force: все)" : " (без эмбеддинга)"}.`,
  );
  if (candidates.length === 0) {
    console.log("[backfill] Нечего делать.");
    return;
  }

  let done = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (c) => {
        try {
          const embeddingText = buildCandidateEmbeddingText(c);
          const vector = await generateEmbedding(embeddingText, "document");
          await prisma.candidate.update({
            where: { id: c.id },
            data: {
              embedding: vector,
              embeddingText,
              embeddingModel: EMBEDDING_MODEL,
              embeddingUpdatedAt: new Date(),
            },
          });
          done++;
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[backfill] ✗ ${c.name} (${c.id}): ${msg.slice(0, 120)}`);
        }
      }),
    );

    console.log(`[backfill] Прогресс: ${done + failed}/${candidates.length} (ok=${done}, fail=${failed})`);

    if (i + BATCH_SIZE < candidates.length) await sleep(BATCH_DELAY_MS);
  }

  console.log(`[backfill] Готово. Успешно: ${done}, ошибок: ${failed}.`);
}

main()
  .catch((e) => {
    console.error("[backfill] Фатальная ошибка:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
