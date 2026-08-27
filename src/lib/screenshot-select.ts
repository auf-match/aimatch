/**
 * Отбор скриншотов портфолио для отправки в AI-анализ.
 *
 * Зачем: главный признак сильного визуала — не «красивый экран», а способность
 * УДЕРЖАТЬ визуальную систему через разные экраны одного продукта (Home →
 * Profile → Empty state → Error → Settings). Чтобы модель могла это оценить,
 * ей нужны кадры ИЗ КАЖДОГО кейса, а не равномерная нарезка всей ленты
 * прокрутки (так было раньше — модель видела случайные куски и не понимала,
 * где границы продуктов).
 *
 * Здесь — чистая логика: на вход метаданные кадров, на выход индексы выбранных.
 * Покрыта юнит-тестами.
 */

export interface ScreenshotMeta {
  /** Откуда кадр: обложка/лента портфолио или конкретный кейс. */
  source: "main" | "case";
  /** Номер кейса (1-based). Только для source === "case". */
  caseIndex?: number;
  /** Заголовок кейса — идёт в подпись для модели. */
  caseTitle?: string;
  /** Номер кадра внутри своего источника (1-based). */
  frame: number;
  /** Всего кадров в этом источнике. */
  frameTotal: number;
}

/** Ключ группировки: main или case-N. */
function groupKey(m: ScreenshotMeta): string {
  return m.source === "main" ? "main" : `case-${m.caseIndex ?? 0}`;
}

/**
 * Равномерно выбирает `count` элементов из массива индексов, всегда включая
 * первый и последний (начало и конец кейса — самые разные экраны).
 */
function spread(indexes: number[], count: number): number[] {
  if (count >= indexes.length) return [...indexes];
  if (count <= 0) return [];
  if (count === 1) return [indexes[0]];
  const out: number[] = [];
  const step = (indexes.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    out.push(indexes[Math.round(i * step)]);
  }
  return [...new Set(out)];
}

/**
 * Возвращает индексы кадров для отправки в модель.
 *
 * Принципы:
 *  - каждый кейс представлен (минимум 1 кадр), даже если кейсов много;
 *  - главная страница получает не больше `mainQuota` — она нужна для общего
 *    впечатления, но экраны продуктов важнее;
 *  - внутри кейса кадры берутся равномерно (начало → конец), чтобы поймать
 *    разные экраны, а не первые скроллы подряд.
 */
export function selectScreenshotIndexes(
  metas: ScreenshotMeta[],
  max: number,
  mainQuota = 3,
): number[] {
  if (metas.length === 0 || max <= 0) return [];
  if (metas.length <= max) return metas.map((_, i) => i);

  // Группируем индексы по источникам, сохраняя исходный порядок.
  const groups = new Map<string, number[]>();
  metas.forEach((m, i) => {
    const k = groupKey(m);
    const arr = groups.get(k);
    if (arr) arr.push(i);
    else groups.set(k, [i]);
  });

  const mainIdx = groups.get("main") ?? [];
  const caseKeys = [...groups.keys()].filter((k) => k !== "main");

  // Главная — ограниченная квота (но не больше, чем есть и чем max).
  const mainTake = Math.min(mainIdx.length, mainQuota, max);
  const selected = new Set<number>(spread(mainIdx, mainTake));

  if (caseKeys.length === 0) {
    // Кейсов нет — добираем оставшееся из главной.
    return spread(mainIdx, Math.min(max, mainIdx.length)).sort((a, b) => a - b);
  }

  // Остаток делим между кейсами поровну; каждый кейс получает минимум 1 кадр.
  let budget = max - selected.size;
  const perCase = Math.max(1, Math.floor(budget / caseKeys.length));

  for (const key of caseKeys) {
    if (budget <= 0) break;
    const idx = groups.get(key)!;
    const take = Math.min(perCase, idx.length, budget);
    for (const i of spread(idx, take)) selected.add(i);
    budget = max - selected.size;
  }

  // Если после равного дележа остался бюджет — раздаём его кейсам с самым
  // большим числом неиспользованных кадров (длинные кейсы информативнее).
  if (budget > 0) {
    const rest = caseKeys
      .map((k) => ({ k, left: groups.get(k)!.filter((i) => !selected.has(i)) }))
      .filter((x) => x.left.length > 0)
      .sort((a, b) => b.left.length - a.left.length);
    for (const { left } of rest) {
      if (budget <= 0) break;
      for (const i of spread(left, Math.min(budget, left.length))) {
        selected.add(i);
      }
      budget = max - selected.size;
    }
  }

  return [...selected].sort((a, b) => a - b).slice(0, max);
}

/** Человекочитаемая подпись кадра — уходит в промпт перед изображением. */
export function captionFor(m: ScreenshotMeta): string {
  if (m.source === "main") {
    return `Главная страница портфолио — кадр ${m.frame} из ${m.frameTotal}`;
  }
  const title = m.caseTitle ? `«${m.caseTitle}»` : "";
  return `Кейс ${m.caseIndex ?? "?"} ${title} — экран ${m.frame} из ${m.frameTotal}`.replace(/\s+/g, " ").trim();
}

/**
 * Выбрасывает «кейсы», которые оказались служебными страницами площадки.
 *
 * Стоп-листом путей эту войну не выиграть: отсекаешь /cases/recommended —
 * на его место встаёт /info, потом «Выбор Жюри», потом страница профиля.
 * У каждой площадки свои разделы, и список никогда не будет полным.
 *
 * Зато есть признак, работающий везде: служебная страница КОРОТКАЯ.
 * На реальных портфолио разрыв не пограничный, а кратный — 19–34 кадра
 * у настоящих кейсов против 2–6 у агрегатов и профилей.
 *
 * Поэтому меряем относительно самого большого кейса: всё, что не дотянуло
 * до его четверти, — не кейс. Абсолютный порог не годится, портфолио
 * бывают и целиком короткими.
 *
 * Текст таких страниц остаётся: он безвреден, а вот кадры рекламы,
 * подписанные как работа кандидата, прямо портят оценку визуала.
 */
/** Номера кейсов, которые оказались служебными страницами. */
export function thinCaseIndexes(metas: ScreenshotMeta[]): Set<number> {
  const frames = new Map<number, number>();
  for (const m of metas) {
    if (m.source !== "case") continue;
    const key = m.caseIndex ?? 0;
    frames.set(key, (frames.get(key) ?? 0) + 1);
  }
  if (frames.size < 2) return new Set();

  const biggest = Math.max(...frames.values());
  const floor = Math.max(3, Math.ceil(biggest * 0.25));
  const thin = [...frames.entries()].filter(([, n]) => n < floor).map(([i]) => i);
  // Если отсеялось всё — значит разрыва нет и делить было нечего
  if (thin.length === frames.size) return new Set();
  return new Set(thin);
}

export function dropThinCases(metas: ScreenshotMeta[]): ScreenshotMeta[] {
  const frames = new Map<number, number>();
  for (const m of metas) {
    if (m.source !== "case") continue;
    const key = m.caseIndex ?? 0;
    frames.set(key, (frames.get(key) ?? 0) + 1);
  }
  if (frames.size < 2) return metas;

  const biggest = Math.max(...frames.values());
  const floor = Math.max(3, Math.ceil(biggest * 0.25));
  const keep = new Set(
    [...frames.entries()].filter(([, n]) => n >= floor).map(([i]) => i),
  );
  // Если отсеялось всё — значит разрыва нет и делить было нечего
  if (keep.size === 0) return metas;

  // Нумеруем заново: пропуски в номерах сбили бы подписи для модели
  const renumber = new Map<number, number>();
  let next = 0;
  for (const [index] of frames) {
    if (keep.has(index)) renumber.set(index, ++next);
  }

  return metas.filter((m) => {
    if (m.source !== "case") return true;
    return keep.has(m.caseIndex ?? 0);
  }).map((m) => {
    if (m.source !== "case") return m;
    return { ...m, caseIndex: renumber.get(m.caseIndex ?? 0) ?? m.caseIndex };
  });
}
