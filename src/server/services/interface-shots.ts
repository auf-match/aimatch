import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ScreenshotMeta } from "@/lib/screenshot-select";

/**
 * Сохраняет экраны интерфейсов из портфолио, чтобы дизайн-лид смотрел их
 * прямо в карточке, не открывая портфолио.
 *
 * Зачем это вместо автоматической оценки: три дня замеров показали, что
 * модель не различает сильный и слабый интерфейсный визуал — слабое
 * портфолио получало высшую оценку так же часто, как сильное. А вот
 * ОТБИРАТЬ кадры с интерфейсом она научилась: у одного портфолио это
 * 45% кадров, у другого 79%, и разница совпадает с тем, что видно глазом.
 *
 * Поэтому цифру не показываем, а показываем сами экраны. Решение остаётся
 * за человеком, но вместо «открыть портфолио и пролистать» это десять
 * секунд в карточке.
 *
 * Файлы кладём рядом с остальными загрузками — им нужен тот же постоянный
 * том, что и резюме с записями звонков.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const SUBDIR = "portfolio-shots";

/** Сколько экранов держим. Больше в карточку всё равно не поместится. */
const MAX_SHOTS = 8;

export interface SavedShot {
  /**
   * Путь относительно папки portfolio-shots — маршрут отдачи уже
   * укоренён в ней, приставка привела бы к задвоению.
   */
  path: string;
  /** Подпись: из какого кейса кадр */
  caption?: string;
}

/**
 * Раскладывает выбор по кейсам: берём поровну с каждого, чтобы в карточку
 * не попали восемь экранов одного продукта.
 */
function spreadAcrossCases(
  indexes: number[],
  metas: ScreenshotMeta[],
  limit: number,
): number[] {
  const byCase = new Map<number, number[]>();
  for (const i of indexes) {
    const key = metas[i]?.caseIndex ?? 0;
    const arr = byCase.get(key) ?? [];
    arr.push(i);
    byCase.set(key, arr);
  }

  const out: number[] = [];
  const очереди = [...byCase.values()];
  let слой = 0;
  // По кругу: первый кадр каждого кейса, потом второй каждого, и так далее
  while (out.length < limit) {
    let добавили = false;
    for (const очередь of очереди) {
      if (слой < очередь.length && out.length < limit) {
        out.push(очередь[слой]);
        добавили = true;
      }
    }
    if (!добавили) break;
    слой++;
  }
  return out;
}

/**
 * Сохраняет картинки, взятые со страницы файлами.
 *
 * Предпочтительный путь: в отличие от снимков экрана это цельные работы,
 * без обрезков и текста описания рядом. Снимки остаются запасным вариантом
 * для страниц, где интерфейс нарисован прямо в вёрстке — например Notion.
 */
export function savePageImages(
  candidateId: string,
  images: { buffer: Buffer; caseTitle?: string }[],
): SavedShot[] {
  if (images.length === 0) return [];

  const dir = join(UPLOAD_DIR, SUBDIR, candidateId);
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn(
      `[interface-shots] не создать папку для ${candidateId}:`,
      (e as Error).message.slice(0, 100),
    );
    return [];
  }

  // По кругу с каждого кейса: иначе в карточку попадут работы одного продукта
  const byCase = new Map<string, typeof images>();
  for (const img of images) {
    const key = img.caseTitle ?? "";
    const arr = byCase.get(key) ?? [];
    arr.push(img);
    byCase.set(key, arr);
  }
  const очереди = [...byCase.values()];
  const chosen: typeof images = [];
  let слой = 0;
  while (chosen.length < MAX_SHOTS) {
    let добавили = false;
    for (const очередь of очереди) {
      if (слой < очередь.length && chosen.length < MAX_SHOTS) {
        chosen.push(очередь[слой]);
        добавили = true;
      }
    }
    if (!добавили) break;
    слой++;
  }

  const saved: SavedShot[] = [];
  chosen.forEach((img, n) => {
    const name = `${String(n + 1).padStart(2, "0")}.jpg`;
    try {
      writeFileSync(join(dir, name), img.buffer);
      saved.push({ path: `${candidateId}/${name}`, caption: img.caseTitle });
    } catch (e) {
      console.warn(
        `[interface-shots] не сохранить ${name}:`,
        (e as Error).message.slice(0, 80),
      );
    }
  });

  if (saved.length > 0) {
    console.log(
      `[interface-shots] ${candidateId}: сохранено ${saved.length} картинок со страниц`,
    );
  }
  return saved;
}

export function saveInterfaceShots(
  candidateId: string,
  screenshots: Buffer[],
  metas: ScreenshotMeta[] | undefined,
  interfaceIndexes: number[],
): SavedShot[] {
  if (interfaceIndexes.length === 0) return [];

  const chosen = metas
    ? spreadAcrossCases(interfaceIndexes, metas, MAX_SHOTS)
    : interfaceIndexes.slice(0, MAX_SHOTS);

  const dir = join(UPLOAD_DIR, SUBDIR, candidateId);
  try {
    // Чистим прошлый разбор: иначе после повторного анализа в карточке
    // окажется смесь старых и новых экранов
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn(
      `[interface-shots] не создать папку для ${candidateId}:`,
      (e as Error).message.slice(0, 100),
    );
    return [];
  }

  const saved: SavedShot[] = [];
  chosen.forEach((idx, n) => {
    const name = `${String(n + 1).padStart(2, "0")}.jpg`;
    try {
      writeFileSync(join(dir, name), screenshots[idx]);
      saved.push({
        path: `${candidateId}/${name}`,
        caption: metas?.[idx]?.caseTitle || undefined,
      });
    } catch (e) {
      console.warn(
        `[interface-shots] не сохранить кадр ${name}:`,
        (e as Error).message.slice(0, 80),
      );
    }
  });

  if (saved.length > 0) {
    console.log(
      `[interface-shots] ${candidateId}: сохранено ${saved.length} экранов`,
    );
  }
  return saved;
}
