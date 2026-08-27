import { chromium, type Browser } from "playwright";
import { isFigmaUrl, scrapeFigma, FigmaScraperError } from "./figma-scraper";
import { selectCaseLinks, type LinkCandidate } from "@/lib/case-links";
import { thinCaseIndexes, type ScreenshotMeta } from "@/lib/screenshot-select";
import { downloadImages, findPageImages } from "./portfolio-images";

export class ScraperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScraperError";
  }
}

interface ScrapeResult {
  text: string;
  title: string;
  url: string;
  screenshots: Buffer[];
  /**
   * Метаданные кадров, параллельный массив к `screenshots` (одинаковая длина).
   * Нужны, чтобы модель понимала структуру: какой экран из какого кейса.
   * Без этого нельзя оценить, удержана ли визуальная система внутри продукта.
   */
  screenshotMeta: ScreenshotMeta[];
  /**
   * Картинки, взятые со страницы файлами, а не снимками экрана.
   *
   * Снимок области просмотра режет макет пополам и прихватывает текст
   * описания — в карточку кандидата попадала половина интерфейса. Дизайнеры
   * же кладут работы готовыми файлами, их можно взять целиком.
   */
  pageImages: { buffer: Buffer; caseTitle?: string; width: number; height: number }[];
}

let browserInstance: Browser | null = null;
let cachedUserAgent: string | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  browserInstance = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  return browserInstance;
}

/**
 * User-agent для контекста. Берём РЕАЛЬНЫЙ UA запущенного Chromium и убираем
 * токен "Headless" — так версия Chrome всегда актуальна (растёт вместе с
 * Playwright) и совпадает с движком. Раньше UA был захардкожен "Chrome/124":
 * Notion считал такой браузер устаревшим и редиректил на unsupported-browser.html
 * (пустая заглушка → "страница не отрисовала контент"). Привязка к настоящей
 * версии не даёт этому повториться при следующем устаревании.
 */
async function getUserAgent(browser: Browser): Promise<string> {
  if (cachedUserAgent) return cachedUserAgent;
  const probe = await browser.newContext();
  try {
    const page = await probe.newPage();
    const ua = await page.evaluate(() => navigator.userAgent);
    cachedUserAgent = ua.replace(/HeadlessChrome/g, "Chrome");
  } finally {
    await probe.close();
  }
  return cachedUserAgent;
}

/**
 * Дождаться, пока страница реально отрисует <body> с контентом.
 *
 * Заходим с waitUntil: "commit" (первый байт) ради скорости — но к этому
 * моменту body может ещё не существовать, или сайт делает клиентский редирект
 * (Notion, Behance). Раньше код сразу читал document.body.scrollHeight и падал
 * с "Cannot read properties of null" / "Execution context was destroyed".
 * Здесь ждём domcontentloaded + появления непустого body, глотая таймауты —
 * пусть лучше отскрейпим что успело отрисоваться, чем упадём.
 */
async function waitForReady(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  timeout = 15000,
): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page
    .waitForFunction(() => !!document.body && document.body.scrollHeight > 0, {
      timeout,
    })
    .catch(() => {});
}

/** Высота страницы с защитой от null body (может быть null во время навигации). */
/**
 * Ждёт, пока страница перестанет дорисовываться.
 *
 * Порог «текста больше N знаков» здесь не работает: у приложений-конструкторов
 * каркас сам по себе даёт текст. buildin.ai проходил порог в 200 знаков на
 * 1.8 секунде — но это были «Subscribe» и «Go to Buildin», а портфолио
 * появлялось на четвёртой. Мы снимали оболочку и уходили.
 *
 * Поэтому ждём не объём, а СТАБИЛЬНОСТЬ: пока текст растёт, страница ещё
 * дорисовывается. Два одинаковых замера подряд — можно снимать.
 *
 * Ошибки глушим: при клиентском редиректе контекст исполнения умирает,
 * и ронять из-за этого весь скрейп нельзя.
 */
async function waitForContent(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  maxMs = 12000,
): Promise<void> {
  const started = Date.now();
  let previous = -1;
  let stable = 0;

  while (Date.now() - started < maxMs) {
    await page.waitForTimeout(600);
    let length = 0;
    try {
      length = await page.evaluate(
        () => document.body?.innerText?.trim().length ?? 0,
      );
    } catch {
      continue; // контекст пересоздаётся после редиректа — пробуем снова
    }

    if (length > 0 && length === previous) {
      stable++;
      if (stable >= 2) return;
    } else {
      stable = 0;
    }
    previous = length;
  }
}

/**
 * Где на самом деле прокручивается страница.
 *
 * Раньше мерили document.body.scrollHeight и крутили window. На обычных
 * сайтах это верно, но приложения-конструкторы (Notion, и почти наверняка
 * не только он) рендерят содержимое внутри собственного контейнера с
 * overflow: у body высота ровно с экран, окно не прокручивается вовсе.
 *
 * Из-за этого с каждой страницы Notion снимался ОДИН кадр вместо шести:
 * body.scrollHeight = 900 при настоящих 4810 внутри .notion-scroller.
 * Рубрика visualStrength оценивает удержание системы между экранами —
 * по одному кадру этого не видно, но модель всё равно выносила оценку.
 *
 * Ищем контейнер, который прокручивается заметно и занимает почти весь
 * экран: боковое меню под это условие не подходит.
 */
interface ScrollArea {
  /** Полная высота прокручиваемого содержимого */
  height: number;
  /** Высота одного экрана — шаг прокрутки */
  step: number;
  /** Крутить внутренний контейнер, а не окно */
  inner: boolean;
}

async function findScrollArea(
  page: Awaited<ReturnType<Browser["newPage"]>>,
): Promise<ScrollArea> {
  return page.evaluate(() => {
    const viewport = window.innerHeight || 900;
    const windowHeight = document.body?.scrollHeight ?? 0;

    // Окно прокручивается — обычный сайт, ничего искать не нужно
    if (windowHeight > viewport + 100) {
      return { height: windowHeight, step: viewport, inner: false };
    }

    let best: HTMLElement | null = null;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("div"))) {
      if (el.scrollHeight <= el.clientHeight + 200) continue;
      // Контейнер во весь экран, а не боковая колонка со своим скроллом
      if (el.clientHeight < viewport * 0.6) continue;
      if (!best || el.scrollHeight > best.scrollHeight) best = el;
    }

    if (best) {
      (best as HTMLElement & { dataset: DOMStringMap }).dataset.scrapeScroller = "1";
      return { height: best.scrollHeight, step: best.clientHeight, inner: true };
    }
    return { height: windowHeight, step: viewport, inner: false };
  });
}

/** Прокручивает то, что нашла findScrollArea. */
async function scrollAreaTo(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  y: number,
  inner: boolean,
): Promise<void> {
  await page.evaluate(
    ({ y, inner }: { y: number; inner: boolean }) => {
      if (inner) {
        const el = document.querySelector<HTMLElement>("[data-scrape-scroller]");
        if (el) {
          el.scrollTop = y;
          return;
        }
      }
      window.scrollTo(0, y);
    },
    { y, inner },
  );
}

function isNotionUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "notion.so" ||
      host === "www.notion.so" ||
      host.endsWith(".notion.so") ||
      host.endsWith(".notion.site")
    );
  } catch {
    return false;
  }
}

/**
 * Extract visible text from the current page state
 */
async function extractPageText(page: Parameters<typeof chromium.launch>[0] extends undefined ? never : Awaited<ReturnType<Browser["newPage"]>>): Promise<string> {
  return page.evaluate(() => {
    // body может быть null (навигация/редирект Notion в процессе) —
    // без этой проверки createTreeWalker(null) падает "not of type Node".
    if (!document.body) return "";

    const remove = document.querySelectorAll(
      "script, style, noscript, svg, iframe, [aria-hidden='true']"
    );
    remove.forEach((el) => el.remove());

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const parts: string[] = [];
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.textContent || "").trim();
      if (t.length > 1) parts.push(t);
    }
    return parts.join("\n");
  });
}

/**
 * Scrape a Notion page — handles lazy rendering and scroll-triggered content
 */
async function scrapeNotion(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  url: string,
  screenshots: Buffer[],
  metas: ScreenshotMeta[]
): Promise<{ text: string; title: string; candidates: LinkCandidate[] }> {
  // Navigate — use 'commit' (fires on first byte), then wait for content ourselves.
  // Таймаут срезан 60→30с: мёртвые notion.site (unpublished) висят, а живые
  // отвечают быстро — нет смысла ждать минуту на каждой битой ссылке.
  await page.goto(url, { waitUntil: "commit", timeout: 30000 });

  // Wait for Notion to hydrate: look for any notion class OR meaningful text
  try {
    await page.waitForFunction(
      () => {
        const text = document.body?.innerText?.trim() ?? "";
        return text.length > 200;
      },
      { timeout: 12000 }
    );
  } catch {
    // Notion may be slow; give extra time
    await page.waitForTimeout(3000);
  }

  // Убедиться, что body реально есть (Notion мог редиректнуть/гидрироваться)
  await waitForReady(page);

  // Notion lazy-loads blocks as you scroll — scroll through the whole page
  const area = await findScrollArea(page);
  const steps = Math.max(1, Math.ceil(area.height / area.step));

  for (let i = 0; i < steps; i++) {
    await scrollAreaTo(page, i * area.step, area.inner);
    await page.waitForTimeout(600); // wait for lazy blocks to render
    screenshots.push(await page.screenshot({ type: "jpeg", quality: 75, fullPage: false }));
    metas.push({ source: "main", frame: i + 1, frameTotal: steps });
  }

  // Scroll back to top so full content is in DOM
  await scrollAreaTo(page, 0, area.inner);
  await page.waitForTimeout(500);

  // .catch — Notion может редиректнуть во время вызова ("context destroyed"),
  // тогда не роняем весь скрейп, а продолжаем с пустым заголовком.
  const title = await page.title().catch(() => "");
  const text = await extractPageText(page);

  // Collect internal link candidates (для умного отбора кейсов в Node)
  const candidates: LinkCandidate[] = await page.evaluate((baseUrl: string) => {
    const base = new URL(baseUrl);
    const out: { href: string; text: string; nav: boolean }[] = [];
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      try {
        const el = a as HTMLAnchorElement;
        const href = new URL(el.getAttribute("href") || "", base);
        if (
          (href.hostname === base.hostname || href.hostname.endsWith(".notion.so") || href.hostname.endsWith(".notion.site")) &&
          href.pathname !== base.pathname &&
          !href.href.includes("?v=") // skip database view URLs
        ) {
          out.push({
            href: href.toString(),
            text: (el.textContent || "").trim().slice(0, 120),
            nav: !!el.closest("header,nav,footer,aside,[role=navigation]"),
          });
        }
      } catch {
        // skip
      }
      if (out.length >= 40) break;
    }
    return out;
  }, url).catch((): LinkCandidate[] => []); // навигация могла уничтожить контекст

  return { text, title, candidates };
}

/**
 * Scrape a regular website
 */
async function scrapeRegular(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  url: string,
  screenshots: Buffer[],
  metas: ScreenshotMeta[]
): Promise<{ text: string; title: string; candidates: LinkCandidate[] }> {
  // "commit" — faster than "networkidle"; avoids timeouts on JS-heavy sites like alla.studio
  await page.goto(url, { waitUntil: "commit", timeout: 60000 });
  // Ждём реальный body вместо фиксированной паузы (страница могла редиректнуть
  // или ещё не отрисоваться — иначе scrollHeight падал на null body).
  await waitForReady(page);

  // Ждём появления содержимого, а не только каркаса. Раньше это ожидание было
  // только у Notion, и на приложениях-конструкторах мы снимали оболочку:
  // buildin.ai отдавал 375 знаков и заголовок «Buildin — Your AI Workspace»,
  // потому что портфолио дорисовывается на четвёртой секунде.
  //
  // Ожидание с запасом, но не блокирующее: страница из одних картинок текста
  // не наберёт, и ронять из-за этого весь скрейп нельзя.
  await waitForContent(page);
  await page.waitForTimeout(500);

  // .catch — Notion может редиректнуть во время вызова ("context destroyed"),
  // тогда не роняем весь скрейп, а продолжаем с пустым заголовком.
  const title = await page.title().catch(() => "");

  const area = await findScrollArea(page);
  const steps = Math.max(1, Math.ceil(area.height / area.step));

  for (let i = 0; i < steps; i++) {
    await scrollAreaTo(page, i * area.step, area.inner);
    await page.waitForTimeout(400);
    screenshots.push(await page.screenshot({ type: "jpeg", quality: 80, fullPage: false }));
    metas.push({ source: "main", frame: i + 1, frameTotal: steps });
  }

  const text = await extractPageText(page);

  const candidates: LinkCandidate[] = await page.evaluate((baseUrl: string) => {
    const base = new URL(baseUrl);
    const out: { href: string; text: string; nav: boolean }[] = [];
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      try {
        const el = a as HTMLAnchorElement;
        const href = new URL(el.getAttribute("href") || "", base);
        if (href.hostname === base.hostname && href.pathname !== base.pathname) {
          out.push({
            href: href.toString(),
            text: (el.textContent || "").trim().slice(0, 120),
            nav: !!el.closest("header,nav,footer,aside,[role=navigation]"),
          });
        }
      } catch {
        // skip
      }
      if (out.length >= 40) break;
    }
    return out;
  }, url).catch((): LinkCandidate[] => []); // навигация могла уничтожить контекст

  return { text, title, candidates };
}

/**
 * Scrape a portfolio website and extract text content + screenshots
 */
export async function scrapePortfolio(url: string): Promise<ScrapeResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ScraperError(`Невалидный URL: ${url}`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new ScraperError("Поддерживаются только http и https ссылки");
  }

  // Figma — отдельный путь через REST API (без Playwright)
  if (isFigmaUrl(url)) {
    try {
      return await scrapeFigma(url);
    } catch (e) {
      if (e instanceof FigmaScraperError) throw new ScraperError(e.message);
      throw e;
    }
  }

  // Ретрай ТОЛЬКО быстрых сбоев: антибот Behance / гонка навигации падают за
  // секунды, и свежая попытка обычно проходит (видели на пилоте). А вот мёртвая/
  // висящая страница (Notion-unpublished и т.п.) падает по таймауту ~40-90с —
  // повторять её бессмысленно, только удвоим ожидание. Порог RETRY_IF_UNDER_MS
  // отделяет одно от другого.
  const MAX_ATTEMPTS = 2;
  const RETRY_IF_UNDER_MS = 20000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      return await scrapeOnce(url);
    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - started;
      if (attempt < MAX_ATTEMPTS && elapsed < RETRY_IF_UNDER_MS) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        break; // медленный сбой — не ретраим
      }
    }
  }
  const failMsg =
    lastError instanceof Error ? lastError.message : "Неизвестная ошибка";
  throw new ScraperError(`Не удалось загрузить страницу ${url}: ${failMsg}`);
}

/** Одна попытка скрейпа: свежий контекст, без ретрая. Бросает сырую ошибку. */
async function scrapeOnce(url: string): Promise<ScrapeResult> {
  const browser = await getBrowser();
  const userAgent = await getUserAgent(browser);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent,
    locale: "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    extraHTTPHeaders: {
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8",
    },
  });

  // Block heavy but irrelevant resources to speed things up
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["font", "media"].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  const page = await context.newPage();
  const screenshots: Buffer[] = [];
  const screenshotMeta: ScreenshotMeta[] = [];
  const pageImages: {
    buffer: Buffer;
    caseTitle?: string;
    width: number;
    height: number;
  }[] = [];
  const notion = isNotionUrl(url);

  try {
    const { text, title, candidates } = notion
      ? await scrapeNotion(page, url, screenshots, screenshotMeta)
      : await scrapeRegular(page, url, screenshots, screenshotMeta);

    // Страница так и не отрисовалась (антибот-заглушка, редирект, таймаут) —
    // бросаем, чтобы сработал ретрай; если и он пуст — честный ANALYSIS_FAILED,
    // а не «успех» с мусором для AI.
    if (text.trim().length < 50 && screenshots.length === 0) {
      throw new Error("страница не отрисовала контент");
    }

    // Умный отбор кейсов: отсекаем служебные страницы (About/Contacts),
    // ранжируем «похожее на кейс», берём топ-5 (раньше — первые 3 в DOM-порядке,
    // из-за чего сильные кейсы ниже по странице терялись).
    let caseStudyText = "";
    const caseLinks = selectCaseLinks(candidates, url, 5);

    let caseNumber = 0;
    for (const caseUrl of caseLinks) {
      try {
        caseNumber++;
        if (notion) {
          await page.goto(caseUrl, { waitUntil: "commit", timeout: 30000 });
          try {
            await page.waitForFunction(
              () => (document.body?.innerText?.trim().length ?? 0) > 100,
              { timeout: 15000 }
            );
          } catch {
            await page.waitForTimeout(3000);
          }
        } else {
          await page.goto(caseUrl, { waitUntil: "commit", timeout: 45000 });
          await page.waitForTimeout(1000);
        }

        await waitForReady(page);
        // Та же болезнь, что и на главной: страница кейса дорисовывается
        // не сразу, и без ожидания в подпись уходил заголовок оболочки
        // («Buildin — Your AI Workspace»), а кадр снимался один.
        await waitForContent(page, 10000);

        // Заголовок кейса — уходит в подпись кадра для модели.
        // Убираем хвост площадки: «Название :: Behance», «Название | Dribbble».
        const caseTitle = (await page.title().catch(() => ""))
          .replace(/\s*(::|[|–—-])\s*(Behance|Dribbble|Notion|Figma).*$/i, "")
          .trim()
          .slice(0, 80);

        // Scroll through the full case study page — this is where the real portfolio work is
        const caseArea = await findScrollArea(page);
        const caseSteps = Math.max(1, Math.ceil(caseArea.height / caseArea.step));

        for (let s = 0; s < caseSteps; s++) {
          await scrollAreaTo(page, s * caseArea.step, caseArea.inner);
          await page.waitForTimeout(notion ? 600 : 300);
          screenshots.push(await page.screenshot({ type: "jpeg", quality: 75, fullPage: false }));
          screenshotMeta.push({
            source: "case",
            caseIndex: caseNumber,
            caseTitle: caseTitle || undefined,
            frame: s + 1,
            frameTotal: caseSteps,
          });
        }

        // Картинки страницы: они и есть работа, в отличие от снимков экрана.
        // По четыре с кейса — больше в карточку всё равно не поместится.
        try {
          const found = await findPageImages(page);
          const got = await downloadImages(page, found, 4);
          for (const g of got) {
            pageImages.push({
              buffer: g.buffer,
              caseTitle: caseTitle || undefined,
              width: g.meta.width,
              height: g.meta.height,
            });
          }
        } catch {
          // Не собрались — не беда, снимки экрана остаются запасным путём
        }

        const caseText = await extractPageText(page);
        if (caseText.length > 100) {
          caseStudyText += `\n\n--- Страница кейса: ${caseUrl} ---\n${caseText.slice(0, 5000)}`;
        }
      } catch {
        // Skip failed sub-pages — not critical
      }
    }

    const fullText = [
      `Портфолио: ${url}`,
      `Заголовок: ${title}`,
      "",
      "--- Основная страница ---",
      text,
      caseStudyText,
    ]
      .join("\n")
      .slice(0, 45000);

    // Отсекаем «кейсы», оказавшиеся служебными страницами площадки:
    // стоп-листом путей их не переловить, а по длине они отличаются кратно.
    // Идём по позициям: кадры и метаданные — параллельные массивы.
    const thin = thinCaseIndexes(screenshotMeta);
    if (thin.size > 0) {
      for (let i = screenshotMeta.length - 1; i >= 0; i--) {
        const m = screenshotMeta[i];
        if (m.source === "case" && thin.has(m.caseIndex ?? 0)) {
          screenshotMeta.splice(i, 1);
          screenshots.splice(i, 1);
        }
      }
      // Нумеруем заново: пропуски сбили бы подписи для модели
      const order = new Map<number, number>();
      for (const m of screenshotMeta) {
        if (m.source !== "case") continue;
        const old = m.caseIndex ?? 0;
        if (!order.has(old)) order.set(old, order.size + 1);
        m.caseIndex = order.get(old);
      }
    }

    const caseFrames = screenshotMeta.filter((m) => m.source === "case").length;
    console.log(
      `[scraper] ${url}: ${fullText.length} chars, ${screenshots.length} screenshots ` +
        `(${caseFrames} из кейсов), ${caseLinks.length} sub-pages`
    );

    console.log(
      `[scraper] картинок со страниц: ${pageImages.length}`,
    );
    return { text: fullText, title, url, screenshots, screenshotMeta, pageImages };
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
