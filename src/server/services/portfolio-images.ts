import type { Page } from "playwright";

/**
 * Забирает со страницы портфолио сами картинки, а не снимки экрана.
 *
 * Зачем: снимок области просмотра — это кусок прокрутки. Он режет макет
 * пополам, прихватывает заголовки и абзацы описания, и в карточку кандидата
 * попадает половина интерфейса с обрывком текста рядом.
 *
 * А дизайнеры кладут работы на страницу готовыми файлами: мокапы, экраны,
 * развороты кейсов. Их можно взять целиком и в исходном разрешении.
 *
 * Отсеиваем по размеру: аватарки, логотипы, иконки соцсетей и превью в
 * ленте мельче настоящих работ в разы. Порог по КАРТИНКЕ, а не по тому,
 * как её отрисовали: одна и та же работа может стоять на странице
 * маленькой, но файл под ней полноразмерный.
 */

/** Меньше — иконка, аватар или элемент оформления, не работа. */
const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

/** Слишком вытянутое — баннер, полоса или разделитель. */
const MAX_RATIO = 4;

export interface PageImage {
  url: string;
  width: number;
  height: number;
}

/**
 * Собирает адреса подходящих картинок со страницы.
 *
 * Берёт и <img>, и фоновые картинки блоков: конструкторы вроде Framer
 * половину работ ставят фоном, и без этого добрая часть кейсов теряется.
 */
export async function findPageImages(page: Page): Promise<PageImage[]> {
  // Внутри evaluate НЕТ вложенных функций: сборщик подмешивает в них свой
  // помощник __name, а в браузер уезжает только текст — и код падает.
  return page.evaluate(
    ({ minW, minH, maxRatio }) => {
      const out: { url: string; width: number; height: number }[] = [];
      const seen = new Set<string>();

      const candidates: [string, number, number][] = [];

      for (const el of Array.from(document.querySelectorAll("img"))) {
        const img = el as HTMLImageElement;
        // naturalWidth — размер файла, а не то, как его отрисовали
        candidates.push([img.currentSrc || img.src, img.naturalWidth, img.naturalHeight]);
      }

      for (const el of Array.from(document.querySelectorAll("div,section,figure,a"))) {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === "none") continue;
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (!m) continue;
        const r = el.getBoundingClientRect();
        // У фона натурального размера не узнать — судим по блоку
        candidates.push([
          new URL(m[1], location.href).toString(),
          Math.round(r.width),
          Math.round(r.height),
        ]);
      }

      for (const [url, w, h] of candidates) {
        if (!url || seen.has(url)) continue;
        if (url.startsWith("data:")) continue; // встроенные — обычно иконки
        if (w < minW || h < minH) continue;
        if (Math.max(w / h, h / w) > maxRatio) continue;
        seen.add(url);
        out.push({ url, width: w, height: h });
      }

      return out;
    },
    { minW: MIN_WIDTH, minH: MIN_HEIGHT, maxRatio: MAX_RATIO },
  );
}

/**
 * Скачивает картинки через контекст страницы — с её куками и заголовком
 * Referer. Часть площадок отдаёт файлы только «своим».
 */
export async function downloadImages(
  page: Page,
  images: PageImage[],
  limit: number,
): Promise<{ buffer: Buffer; meta: PageImage }[]> {
  // Крупные первыми: у мокапов и экранов разрешение выше, чем у превью
  const sorted = [...images].sort((a, b) => b.width * b.height - a.width * a.height);
  const out: { buffer: Buffer; meta: PageImage }[] = [];

  for (const meta of sorted) {
    if (out.length >= limit) break;
    try {
      const base64 = await page.evaluate(async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 6_000_000) return null; // не тащим гигантские файлы
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }, meta.url);
      if (!base64) continue;
      out.push({ buffer: Buffer.from(base64, "base64"), meta });
    } catch {
      continue; // одна не скачалась — не повод бросать остальные
    }
  }
  return out;
}
