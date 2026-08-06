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
const MAX_IMAGES = 8;             // Figma рендерит ~10 за раз, берём с запасом
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
interface CollectedFrame {
  id: string;
  name: string;
  page: string;
  area: number;
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
        frames.push({
          id: frame.id,
          name: frame.name,
          page: page.name,
          area,
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

  // 2. Выбираем фреймы для рендера: самые крупные с разных страниц
  // Группируем по странице, берём топ-3 с каждой, потом отсекаем по общему лимиту
  const byPage = new Map<string, CollectedFrame[]>();
  for (const f of collected.frames) {
    const arr = byPage.get(f.page) ?? [];
    arr.push(f);
    byPage.set(f.page, arr);
  }

  const selected: CollectedFrame[] = [];
  for (const [, frames] of byPage) {
    frames.sort((a, b) => b.area - a.area);
    selected.push(...frames.slice(0, 2));
  }
  selected.sort((a, b) => b.area - a.area);
  const toRender = selected.slice(0, MAX_IMAGES);

  // 3. Рендерим
  const imageUrls = await renderFrames(
    fileKey,
    toRender.map((f) => f.id),
  );

  // 4. Скачиваем картинки параллельно
  const screenshots: Buffer[] = [];
  await Promise.all(
    toRender.map(async (frame) => {
      const imgUrl = imageUrls.get(frame.id);
      if (!imgUrl) return;
      try {
        const buf = await downloadImage(imgUrl);
        screenshots.push(buf);
      } catch (e) {
        console.warn(`[figma] не скачался фрейм ${frame.name}:`, (e as Error).message);
      }
    }),
  );

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

  return {
    text: fullText,
    title: file.name,
    url,
    screenshots,
  };
}
