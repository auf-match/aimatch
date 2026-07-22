import { chromium, type Browser } from "playwright";
import { isFigmaUrl, scrapeFigma, FigmaScraperError } from "./figma-scraper";

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
}

let browserInstance: Browser | null = null;

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
async function safePageHeight(
  page: Awaited<ReturnType<Browser["newPage"]>>,
): Promise<number> {
  return page.evaluate(() => document.body?.scrollHeight ?? 0);
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
  screenshots: Buffer[]
): Promise<{ text: string; title: string; internalLinks: string[] }> {
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
  const pageHeight: number = await safePageHeight(page);
  const viewportHeight = 900;
  const steps = Math.ceil(pageHeight / viewportHeight);

  for (let i = 0; i < steps; i++) {
    await page.evaluate((y: number) => window.scrollTo(0, y), i * viewportHeight);
    await page.waitForTimeout(600); // wait for lazy blocks to render
    screenshots.push(await page.screenshot({ type: "jpeg", quality: 75, fullPage: false }));
  }

  // Scroll back to top so full content is in DOM
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const title = await page.title();
  const text = await extractPageText(page);

  // Collect internal links (case study pages)
  const internalLinks: string[] = await page.evaluate((baseUrl: string) => {
    const base = new URL(baseUrl);
    return Array.from(document.querySelectorAll("a[href]"))
      .map((a) => {
        try {
          const href = new URL((a as HTMLAnchorElement).getAttribute("href") || "", base);
          if (
            (href.hostname === base.hostname || href.hostname.endsWith(".notion.so") || href.hostname.endsWith(".notion.site")) &&
            href.pathname !== base.pathname &&
            !href.href.includes("?v=") // skip database view URLs
          ) {
            return href.toString();
          }
        } catch {
          // skip
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 8) as string[];
  }, url);

  return { text, title, internalLinks };
}

/**
 * Scrape a regular website
 */
async function scrapeRegular(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  url: string,
  screenshots: Buffer[]
): Promise<{ text: string; title: string; internalLinks: string[] }> {
  // "commit" — faster than "networkidle"; avoids timeouts on JS-heavy sites like alla.studio
  await page.goto(url, { waitUntil: "commit", timeout: 60000 });
  // Ждём реальный body вместо фиксированной паузы (страница могла редиректнуть
  // или ещё не отрисоваться — иначе scrollHeight падал на null body).
  await waitForReady(page);
  await page.waitForTimeout(500);

  const title = await page.title();

  const pageHeight: number = await safePageHeight(page);
  const viewportHeight = 900;
  const steps = Math.ceil(pageHeight / viewportHeight);

  for (let i = 0; i < steps; i++) {
    await page.evaluate((y: number) => window.scrollTo(0, y), i * viewportHeight);
    await page.waitForTimeout(400);
    screenshots.push(await page.screenshot({ type: "jpeg", quality: 80, fullPage: false }));
  }

  const text = await extractPageText(page);

  const internalLinks: string[] = await page.evaluate((baseUrl: string) => {
    const base = new URL(baseUrl);
    return Array.from(document.querySelectorAll("a[href]"))
      .map((a) => {
        try {
          const href = new URL((a as HTMLAnchorElement).getAttribute("href") || "", base);
          if (href.hostname === base.hostname && href.pathname !== base.pathname) {
            return href.toString();
          }
        } catch {
          // skip
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 10) as string[];
  }, url);

  return { text, title, internalLinks };
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
  const notion = isNotionUrl(url);
  const viewportHeight = 900;

  try {
    const { text, title, internalLinks } = notion
      ? await scrapeNotion(page, url, screenshots)
      : await scrapeRegular(page, url, screenshots);

    // Страница так и не отрисовалась (антибот-заглушка, редирект, таймаут) —
    // бросаем, чтобы сработал ретрай; если и он пуст — честный ANALYSIS_FAILED,
    // а не «успех» с мусором для AI.
    if (text.trim().length < 50 && screenshots.length === 0) {
      throw new Error("страница не отрисовала контент");
    }

    // Scrape up to 3 case study sub-pages
    let caseStudyText = "";
    const caseLinks = internalLinks.slice(0, 3);

    for (const caseUrl of caseLinks) {
      try {
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

        // Scroll through the full case study page — this is where the real portfolio work is
        const caseHeight: number = await safePageHeight(page);
        const caseSteps = Math.ceil(caseHeight / viewportHeight);

        for (let s = 0; s < caseSteps; s++) {
          await page.evaluate((y: number) => window.scrollTo(0, y), s * viewportHeight);
          await page.waitForTimeout(notion ? 600 : 300);
          screenshots.push(await page.screenshot({ type: "jpeg", quality: 75, fullPage: false }));
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
      .slice(0, 30000);

    console.log(
      `[scraper] ${url}: ${fullText.length} chars, ${screenshots.length} screenshots, ${caseLinks.length} sub-pages`
    );

    return { text: fullText, title, url, screenshots };
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
