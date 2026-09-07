/**
 * Разбор заявки с публичной страницы разбора портфолио.
 *
 * Отличие от ingest: тот принимает кандидатов от консультанта по токену, а
 * сюда пишет кто угодно из интернета. Поэтому здесь строже с длинами и
 * форматом, и поэтому логика вынесена в отдельный модуль под тесты —
 * необработанный вход снаружи самое дорогое место, чтобы ошибиться.
 *
 * По решению дизайн-лида заявки идут в общую базу наравне с остальными,
 * помеченные источником, и БЕЗ проверки на дубликат: человек, приславший
 * себя дважды, заведётся дважды. Так задумано — повторная заявка означает,
 * что портфолио изменилось, и разбор нужен свежий.
 */

/** Как эти кандидаты помечены в базе. По нему их видно в общем списке. */
export const PUBLIC_SOURCE = "B2C-форма";

/** Пределы. Длиннее — не человек, а перебор наугад. */
const MAX_NAME = 120;
const MAX_CONTACT = 200;
const MAX_LINK = 500;

export interface PublicSubmission {
  name?: unknown;
  contact?: unknown;
  portfolio?: unknown;
  /** Поле-приманка: людям не видно, боты заполняют */
  website?: unknown;
}

export interface IntakeRow {
  name: string;
  portfolioLinks: string[];
  email?: string;
  telegramContact?: string;
  role: "OTHER";
  grade: "MIDDLE";
  status: "NEW";
  source: string;
}

export type IntakeResult =
  | { ok: true; row: IntakeRow }
  /** Тихий отказ: приманка сработала. Боту отвечаем как при успехе */
  | { ok: false; бот: true }
  | { ok: false; бот?: false; поле: "name" | "contact" | "portfolio"; ошибка: string };

const строка = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Приводит ссылку к виду с протоколом.
 *
 * Люди пишут «behance.net/ivan» без http — отказывать за это нельзя, форма
 * потеряет половину заявок. Но и подставлять протокол вслепую нельзя:
 * «javascript:...» с приклеенным https превратится в мусор, который потом
 * пойдёт в скрейпер.
 */
export function normalizeLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  // Только веб: mailto, javascript, data и прочее сюда не пускаем
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Точка в домене обязательна: «портфолио» без неё — не адрес
  if (!url.hostname.includes(".")) return null;

  return url.toString();
}

/** Телеграм или почта — раскладываем в разные поля, как в остальной базе */
function разложитьКонтакт(contact: string): { email?: string; telegramContact?: string } {
  if (contact.includes("@") && !contact.startsWith("@") && contact.includes(".")) {
    return { email: contact };
  }
  return { telegramContact: contact };
}

export function normalizeSubmission(input: PublicSubmission): IntakeResult {
  // Приманка заполнена — молча отбрасываем, ничего не создавая
  if (строка(input.website)) return { ok: false, бот: true };

  const name = строка(input.name);
  if (!name) return { ok: false, поле: "name", ошибка: "Не указано имя" };
  if (name.length > MAX_NAME) {
    return { ok: false, поле: "name", ошибка: "Слишком длинное имя" };
  }

  const contact = строка(input.contact);
  if (!contact) {
    return { ok: false, поле: "contact", ошибка: "Не указан телеграм или почта" };
  }
  if (contact.length > MAX_CONTACT) {
    return { ok: false, поле: "contact", ошибка: "Слишком длинный контакт" };
  }

  const raw = строка(input.portfolio);
  if (!raw) {
    return { ok: false, поле: "portfolio", ошибка: "Не указана ссылка на портфолио" };
  }
  if (raw.length > MAX_LINK) {
    return { ok: false, поле: "portfolio", ошибка: "Слишком длинная ссылка" };
  }
  const link = normalizeLink(raw);
  if (!link) {
    return { ok: false, поле: "portfolio", ошибка: "Это не похоже на ссылку" };
  }

  return {
    ok: true,
    row: {
      name,
      portfolioLinks: [link],
      ...разложитьКонтакт(contact),
      role: "OTHER",
      grade: "MIDDLE",
      status: "NEW",
      source: PUBLIC_SOURCE,
    },
  };
}
