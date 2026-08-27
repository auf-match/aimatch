import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Эталонные экраны для оценки визуала.
 *
 * Зачем: абсолютная шкала 0–100 не работает. Проверяли трижды — после
 * разделения запросов, после отбора кадров и после трёх переписываний
 * рубрики портфолио, которое дизайн-лид считает слабым, стабильно получало
 * 90. У модели нет опоры, что такое 60, и она жмётся к верхней части.
 *
 * Сравнение при этом работает: на тех же кадрах вопрос «какое из двух лучше»
 * два прогона подряд дал верный ответ с разбором по отступам и кеглям.
 *
 * Поэтому эталоны идут в каждый запрос, и модель размещает кандидата
 * относительно них, а не выставляет балл из головы.
 *
 * Картинки лежат в репозитории, а не в окружении: они часть правил оценки,
 * и без них оценка меняется. Читаются один раз и держатся в памяти —
 * процесс долгоживущий, а файлов полтора десятка.
 */

const ROOT = join(process.cwd(), "assets", "visual-anchors");

/** Сколько эталонов каждой стороны отправлять. Больше — дороже без пользы. */
const MAX_PER_SIDE = 6;

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface AnchorImage {
  data: string;
  mimeType: string;
}

export interface VisualAnchors {
  strong: AnchorImage[];
  weak: AnchorImage[];
}

let cached: VisualAnchors | null = null;

function loadSide(dir: string): AnchorImage[] {
  let names: string[];
  try {
    names = readdirSync(join(ROOT, dir)).sort();
  } catch {
    return [];
  }

  const out: AnchorImage[] = [];
  for (const name of names) {
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const mimeType = MIME[ext];
    // Молча пропускаем всё, что модель не примет: .DS_Store и прочий сор
    if (!mimeType) continue;
    try {
      out.push({
        data: readFileSync(join(ROOT, dir, name)).toString("base64"),
        mimeType,
      });
    } catch {
      continue;
    }
    if (out.length >= MAX_PER_SIDE) break;
  }
  return out;
}

/**
 * Возвращает эталоны или null, если их нет. Отсутствие — не ошибка:
 * оценка тогда идёт по старой схеме, без опорных точек.
 */
export function loadVisualAnchors(): VisualAnchors | null {
  if (cached) return cached;

  const strong = loadSide("strong");
  const weak = loadSide("weak");

  // Одна сторона без другой бесполезна: сравнивать будет не с чем,
  // и модель начнёт тянуть всех к единственному имеющемуся полюсу.
  if (strong.length === 0 || weak.length === 0) {
    console.warn(
      `[visual-anchors] эталоны не загружены (сильных ${strong.length}, слабых ${weak.length}) — оценка пойдёт без опорных точек`,
    );
    return null;
  }

  cached = { strong, weak };
  console.log(
    `[visual-anchors] загружено: сильных ${strong.length}, слабых ${weak.length}`,
  );
  return cached;
}
