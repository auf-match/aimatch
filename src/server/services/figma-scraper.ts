import type { ScreenshotMeta } from "@/lib/screenshot-select";
/**
 * Скрейпер Figma-файлов для портфолио кандидатов.
 *
 * Использует Figma REST API вместо Playwright:
 *   1. GET /v1/files/:key — структура файла (страницы, фреймы, тексты)
 *   2. GET /v1/images/:key?ids=... — рендер выбранных фреймов в PNG
 *
 * Логика выбора что рендерить:
 *   - Берём top-level фреймы первого уровня каждой страницы (это обычно
 *     обложки кейсов / экраны / mockup-borды)
 *   - Сортируем по площади (большие → важнее, обычно это hero/cover)
 *   - Ограничиваем общим лимитом MAX_IMAGES чтобы не сжечь токены Gemini
 *
 * Не использует Playwright — не нужно ждать рендеринга, всё через REST.
 */

const FIGMA_API = "https://api.figma.com/v1";
const MAX_IMAGES = 8;
// Кейс = верхнеуровневый фрейм, экраны кейса = его вложенные блоки.
// Раньше всё приходило одной лентой без границ, и рубрика не могла
// проверить главное — удержана ли визуальная система между экранами.
const MAX_CASES = 5;              // столько же, сколько берём с веб-площадок
const MAX_SCREENS_PER_CASE = 8;   // дальше рендер и скачивание не окупаются
const MIN_CHILD_AREA = 40000;     // ~200×200: мельче — декор, а не экран             // Figma рендерит ~10 за раз, берём с запасом
const MAX_DEPTH = 3;              // не лезем глубже 3 уровней
const MAX_TEXT_LAYERS = 200;      // защита от файлов с тысячами текстовых слоёв
const MAX_TEXT_CHARS = 20000;     // итоговый лимит длины текста
const IMAGE_SCALE = 1;            // 1x — достаточно для AI-анализа, не вызывает timeout

export class FigmaScraperError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FigmaScraperError";
  }
}

// ── Figma API типы (только то что используем) ─────────────────────
interface FigmaRect {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  characters?: string;            // для TEXT
  absoluteBoundingBox?: FigmaRect;
  children?: FigmaNode[];
}

interface FigmaFileResponse {
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
  document: FigmaNode;
}

interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

// ── Извлечение file_key из URL ────────────────────────────────────
export function isFigmaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "figma.com" || host === "www.figma.com" || host.endsWith(".figma.com");
  } catch {
    return false;
  }
}

export function extractFigmaFileKey(url: string): string | null {
  try {
    const u = new URL(url);
    // URL форматы:
    //   /file/<key>/<name>
    //   /design/<key>/<name>     (новый формат)
    //   /proto/<key>/<name>      (прото — file_key тот же)
    //   /board/<key>/<name>      (FigJam)
    //   /community/file/<id>     — это другой ID, /files API не поддерживает
    const m = u.pathname.match(/^\/(file|design|proto|board)\/([^/]+)/);
    if (m) return m[2];
    return null;
  } catch {
    return null;
  }
}

// ── Низкоуровневые fetch-обёртки ──────────────────────────────────
async function figmaFetch<T>(path: string): Promise<T> {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new FigmaScraperError(
      "Не настроен FIGMA_ACCESS_TOKEN — обратитесь к админу системы",
    );
  }

  const res = await fetch(`${FIGMA_API}${path}`, {
    headers: { "X-Figma-Token": token },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new FigmaScraperError(
        "Файл Figma не найден или закрыт от доступа. Попросите кандидата открыть доступ по ссылке («Anyone with the link»).",
        404,
      );
    }
    if (res.status === 403) {
      throw new FigmaScraperError(
        "Нет доступа к файлу. Возможно, токен невалиден или файл приватный.",
        403,
      );
    }
    if (res.status === 429) {
      throw new FigmaScraperError(
        "Превышен лимит запросов к Figma API. Попробуйте позже.",
        429,
      );
    }
    const body = await res.text().catch(() => "");
    throw new FigmaScraperError(
      `Figma API вернул ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

// ── Обход дерева: собираем текст + список фреймов для рендера ────
interface FigmaChild {
  id: string;
  name: string;
  area: number;
  y: number;
  x: number;
}

interface CollectedFrame {
  id: string;
  name: string;
  page: string;
  area: number;
  /** Прямые дети — это экраны внутри кейса */
  children: FigmaChild[];
}

interface CollectedData {
  pageNames: string[];
  texts: string[];
  frames: CollectedFrame[];
}

function collectFromDocument(doc: FigmaNode): CollectedData {
  const pageNames: string[] = [];
  const texts: string[] = [];
  const frames: CollectedFrame[] = [];

  const pages = doc.children ?? [];

  for (const page of pages) {
    if (page.visible === false) continue;
    if (page.type !== "CANVAS") continue;

    pageNames.push(page.name);

    // На странице берём top-level фреймы (FRAME, COMPONENT, SECTION, GROUP)
    const topLevel = (page.children ?? []).filter(
      (n) =>
        n.visible !== false &&
        ["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION", "GROUP", "INSTANCE"].includes(
          n.type,
        ),
    );

    for (const frame of topLevel) {
      const box = frame.absoluteBoundingBox;
      const area = box ? box.width * box.height : 0;
      if (area > 1000) {
        // фильтруем пиксельную мелочь
        // Дети кейса — его экраны. Мелочь отсекаем: подписи, стрелки,
        // декоративные плашки экранами не являются.
        const children: FigmaChild[] = (frame.children ?? [])
          .filter((c) => c.visible !== false && c.absoluteBoundingBox)
          .map((c) => {
            const b = c.absoluteBoundingBox!;
            return {
              id: c.id,
              name: c.name,
              area: b.width * b.height,
              y: b.y ?? 0,
              x: b.x ?? 0,
            };
          })
          .filter((c) => c.area >= MIN_CHILD_AREA)
          // Порядок чтения: сверху вниз, при равной высоте — слева направо
          .sort((a, b) => a.y - b.y || a.x - b.x);

        frames.push({
          id: frame.id,
          name: frame.name,
          page: page.name,
          area,
          children,
        });
      }
    }

    // Текстовые слои — обход в глубину с лимитом
    collectTexts(page, texts, 0);
  }

  return { pageNames, texts, frames };
}

function collectTexts(node: FigmaNode, out: string[], depth: number) {
  if (out.length >= MAX_TEXT_LAYERS) return;
  if (depth > MAX_DEPTH * 3) return; // тексты обходим чуть глубже но не бесконечно
  if (node.visible === false) return;

  if (node.type === "TEXT" && node.characters) {
    const t = node.characters.trim();
    if (t.length >= 3 && t.length < 5000) {
      out.push(t);
    }
  }

  if (node.children) {
    for (const child of node.children) {
      collectTexts(child, out, depth + 1);
    }
  }
}

// ── Получение картинок ───────────────────────────────────────────
async function renderFramesBatch(
  fileKey: string,
  frameIds: string[],
  scale: number,
): Promise<Map<string, string>> {
  const ids = frameIds.join(",");
  const res = await figmaFetch<FigmaImagesResponse>(
    `/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=${scale}`,
  );

  if (res.err) {
    throw new FigmaScraperError(`Figma не смогла отрендерить картинки: ${res.err}`, 400);
  }

  const out = new Map<string, string>();
  for (const [id, url] of Object.entries(res.images)) {
    if (url) out.set(id, url);
  }
  return out;
}

async function renderFrames(
  fileKey: string,
  frameIds: string[],
): Promise<Map<string, string>> {
  if (frameIds.length === 0) return new Map();

  try {
    // Первая попытка: все фреймы разом
    return await renderFramesBatch(fileKey, frameIds, IMAGE_SCALE);
  } catch (e) {
    if (e instanceof FigmaScraperError && e.status === 400 && frameIds.length > 4) {
      // Figma timeout — пробуем половину фреймов
      console.warn("[figma] render timeout, retrying with fewer frames");
      const half = frameIds.slice(0, Math.ceil(frameIds.length / 2));
      try {
        return await renderFramesBatch(fileKey, half, IMAGE_SCALE);
      } catch {
        // Совсем плохо — возвращаем пустой результат, не падаем
        console.warn("[figma] second render attempt also failed, skipping images");
        return new Map();
      }
    }
    throw e;
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new FigmaScraperError(`Не удалось скачать рендер с Figma CDN: ${res.status}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

// ── Главная функция ─────────────────────────────────────────────
export interface FigmaScrapeResult {
  text: string;
  title: string;
  url: string;
  screenshots: Buffer[];
  /** Метаданные кадров (параллельно screenshots) — для подписей в промпте. */
  screenshotMeta: ScreenshotMeta[];
  /**
   * У Figma отдельного сбора картинок нет: рендеры узлов и так приходят
   * готовыми файлами, а не снимками экрана. Поле есть ради единого типа.
   */
  pageImages: { buffer: Buffer; caseTitle?: string; width: number; height: number }[];
}

export async function scrapeFigma(url: string): Promise<FigmaScrapeResult> {
  const fileKey = extractFigmaFileKey(url);
  if (!fileKey) {
    throw new FigmaScraperError(
      "Не удалось извлечь идентификатор файла из ссылки Figma. Ожидается формат вида figma.com/file/... или /design/...",
    );
  }

  console.log(`[figma] file ${fileKey}`);

  // 1. Структура файла
  const file = await figmaFetch<FigmaFileResponse>(`/files/${fileKey}?depth=4`);

  const collected = collectFromDocument(file.document);
  console.log(
    `[figma] ${collected.pageNames.length} страниц, ${collected.texts.length} текстовых слоёв, ${collected.frames.length} фреймов`,
  );

  // 2. Кейсы: самые крупные верхнеуровневые фреймы, не больше двух со
  // страницы — иначе одна страница «Архив» заняла бы весь лимит.
  const byPage = new Map<string, CollectedFrame[]>();
  for (const f of collected.frames) {
    const arr = byPage.get(f.page) ?? [];
    arr.push(f);
    byPage.set(f.page, arr);
  }

  const candidates: CollectedFrame[] = [];
  for (const [, frames] of byPage) {
    frames.sort((a, b) => b.area - a.area);
    candidates.push(...frames.slice(0, 2));
  }
  candidates.sort((a, b) => b.area - a.area);
  const toRender = candidates.slice(0, MAX_CASES);

  // 3. Экраны каждого кейса — его вложенные блоки. Если крупных блоков
  // внутри нет, рендерим сам фрейм: кейс из одного экрана лучше, чем
  // пропущенный.
  interface Shot {
    id: string;
    caseIndex: number;
    caseTitle: string;
    frame: number;
    frameTotal: number;
  }
  const shots: Shot[] = [];
  toRender.forEach((c, i) => {
    const screens = c.children.slice(0, MAX_SCREENS_PER_CASE);
    const ids = screens.length > 0 ? screens.map((s) => s.id) : [c.id];
    ids.forEach((id, k) => {
      shots.push({
        id,
        caseIndex: i + 1,
        caseTitle: c.name,
        frame: k + 1,
        frameTotal: ids.length,
      });
    });
  });

  // 4. Рендерим и скачиваем. Порядок держим по shots: раньше картинки
  // складывались в порядке ЗАВЕРШЕНИЯ загрузки, и подписи разъезжались
  // с изображениями — модель читала чужой заголовок над кадром.
  const imageUrls = await renderFrames(
    fileKey,
    shots.map((s) => s.id),
  );

  const downloaded = await Promise.all(
    shots.map(async (s) => {
      const imgUrl = imageUrls.get(s.id);
      if (!imgUrl) return null;
      try {
        return await downloadImage(imgUrl);
      } catch (e) {
        console.warn(
          `[figma] не скачался узел «${s.caseTitle}»:`,
          (e as Error).message,
        );
        return null;
      }
    }),
  );

  const screenshots: Buffer[] = [];
  const screenshotMeta: ScreenshotMeta[] = [];
  shots.forEach((s, i) => {
    const buf = downloaded[i];
    if (!buf) return;
    screenshots.push(buf);
    screenshotMeta.push({
      source: "case",
      caseIndex: s.caseIndex,
      caseTitle: s.caseTitle,
      frame: s.frame,
      frameTotal: s.frameTotal,
    });
  });

  // 5. Текст: название файла + страницы + контент текстовых слоёв
  const textParts: string[] = [];
  textParts.push(`Figma-файл: ${file.name}`);
  textParts.push(`Последнее обновление: ${file.lastModified}`);

  if (collected.pageNames.length > 0) {
    textParts.push("");
    textParts.push("Страницы в файле:");
    textParts.push(...collected.pageNames.map((n) => `- ${n}`));
  }

  if (toRender.length > 0) {
    textParts.push("");
    textParts.push("Основные фреймы (отрендерены и приложены как изображения):");
    textParts.push(...toRender.map((f) => `- [${f.page}] ${f.name}`));
  }

  if (collected.texts.length > 0) {
    textParts.push("");
    textParts.push("Текст из файла:");
    textParts.push(collected.texts.join("\n"));
  }

  const fullText = textParts.join("\n").slice(0, MAX_TEXT_CHARS);

  console.log(
    `[figma] ${url}: ${fullText.length} chars, ${screenshots.length} картинок`,
  );

  // Рендеры Figma — это уже файлы работ, поэтому кладём их и как pageImages:
  // в карточку кандидата пойдут они, а не снимки экрана.
  return {
    text: fullText,
    title: file.name,
    url,
    screenshots,
    screenshotMeta,
    pageImages: screenshots.map((buffer, i) => ({
      buffer,
      caseTitle: screenshotMeta[i]?.caseTitle,
      width: 0,
      height: 0,
    })),
  };
}
