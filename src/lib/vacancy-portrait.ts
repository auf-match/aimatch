/**
 * Портрет вакансии для внешнего рекрутингового агентства.
 *
 * Что НЕ попадает в текст — сознательно, а не по недосмотру:
 *   clientName, clientLead, decisionMaker  — кто клиент и кто решает
 *   salaryRange                            — бюджет клиента
 *   teamComposition, hiringStages, testTask — внутренняя кухня найма
 *   scoringCriteria                        — наши веса скоринга
 *   clientNotes, internalNotes             — заметки для себя
 *   briefingTranscript/Summary, interviewInsights — сырьё со звонков
 *
 * Осторожно: productDescription и reasonForHiring — свободный текст,
 * и клиент в них нередко назван прямым текстом. Отфильтровать это
 * автоматически нельзя, поэтому текст даётся на правку перед отправкой,
 * а UI отдельно предупреждает, что эти два блока стоит перечитать.
 */
import {
  ROLE_LABELS,
  GRADE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  WORK_FORMAT_LABELS,
} from "./constants";

export interface PortraitVacancy {
  title: string;
  role: string;
  grade: string;
  designersNeeded: number;
  employmentType: string;
  workFormat: string;
  location: string | null;
  timezone: string | null;
  desiredStartDate: string | null;
  duration: string | null;
  productDescription: string | null;
  reasonForHiring: string | null;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  needsInternational: boolean;
  specialCompetencies: string[];
  redFlags: string[];
  portfolioReferences: string[];
}

function section(title: string, body: string | null | undefined): string[] {
  const value = body?.trim();
  return value ? [title, value, ""] : [];
}

function list(title: string, items: string[] | undefined): string[] {
  const clean = (items ?? []).map((i) => i.trim()).filter(Boolean);
  return clean.length ? [title, ...clean.map((i) => `— ${i}`), ""] : [];
}

/** Строка «Ключ: значение», пропускается целиком, если значения нет. */
function pair(key: string, value: string | null | undefined): string[] {
  const v = value?.trim();
  return v ? [`${key}: ${v}`] : [];
}

export function buildVacancyPortrait(v: PortraitVacancy): string {
  const role = ROLE_LABELS[v.role] ?? v.role;
  const grade = GRADE_LABELS[v.grade] ?? v.grade;

  const params = [
    ...pair("Роль", role),
    ...pair("Грейд", grade),
    ...(v.designersNeeded > 1 ? [`Количество: ${v.designersNeeded}`] : []),
    ...pair("Занятость", EMPLOYMENT_TYPE_LABELS[v.employmentType] ?? v.employmentType),
    ...pair("Формат", WORK_FORMAT_LABELS[v.workFormat] ?? v.workFormat),
    ...pair("Локация", v.location),
    ...pair("Часовой пояс", v.timezone),
    ...pair("Старт", v.desiredStartDate),
    ...pair("Длительность", v.duration),
  ];

  const blocks: string[] = [
    `ПОРТРЕТ ПОЗИЦИИ: ${v.title.trim()}`,
    "",
    ...(params.length ? [...params, ""] : []),
    ...section("О ПРОДУКТЕ И КОМАНДЕ", v.productDescription),
    ...section("ЗАЧЕМ ИЩЕМ", v.reasonForHiring),
    ...list("ЗАДАЧИ", v.keyTasks),
    ...list("ОБЯЗАТЕЛЬНО", v.requiredSkills),
    ...list("БУДЕТ ПЛЮСОМ", v.niceToHaveSkills),
    ...list("ЖЕЛАТЕЛЕН ОПЫТ В ДОМЕНАХ", v.preferredDomains),
    ...list("ИНСТРУМЕНТЫ", v.requiredTools),
    ...list("УЗКИЕ КОМПЕТЕНЦИИ", v.specialCompetencies),
    ...(v.needsInternational
      ? ["ОТДЕЛЬНО", "— Нужен опыт международных проектов", ""]
      : []),
    ...list("СТОП-ФАКТОРЫ", v.redFlags),
    ...list("ОРИЕНТИРЫ ПО ПОРТФОЛИО", v.portfolioReferences),
  ];

  // Схлопываем возможные двойные пустые строки на стыках пропущенных блоков.
  return blocks
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Поля, которые чаще всего выдают клиента. UI показывает список,
 * чтобы человек перечитал их перед отправкой наружу.
 *
 * clientName принимается ТОЛЬКО для сверки и никогда не попадает в текст:
 * название позиции сплошь и рядом заводят как «Х5 - Senior Product Designer»,
 * и тогда скрытое поле клиента ничего не защищает.
 */
export function riskyPortraitSections(
  v: PortraitVacancy,
  clientName?: string | null,
): string[] {
  const risky: string[] = [];
  if (titleNamesClient(v.title, clientName)) risky.push("Название позиции");
  if (v.productDescription?.trim()) risky.push("О продукте и команде");
  if (v.reasonForHiring?.trim()) risky.push("Зачем ищем");
  return risky;
}

// Кириллические буквы, неотличимые на вид от латинских. В реальных данных
// клиент заведён как «X5 Group» латиницей, а в заголовке стоит «Х5» кириллицей —
// без нормализации сверка молча не находит совпадения.
const HOMOGLYPHS: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h",
  о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
};

// Юридические и родовые довески: сами по себе о клиенте ничего не говорят,
// но дают ложные срабатывания («Group» в названии позиции).
const GENERIC_TOKENS = new Set([
  "group", "inc", "ltd", "llc", "corp", "company", "team", "labs", "studio",
  "ооо", "оао", "зао", "ао", "пао", "ип", "групп", "групиа", "компания",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => HOMOGLYPHS[ch] ?? ch)
    .join("");
}

/**
 * Названа ли компания-клиент прямо в заголовке позиции.
 * Сравниваем по значимым токенам, а не по строке целиком: клиент «X5 Group»
 * в заголовке почти всегда сокращён до «Х5».
 */
export function titleNamesClient(
  title: string,
  clientName?: string | null,
): boolean {
  const client = clientName?.trim();
  if (!client) return false;

  const haystack = normalize(title);
  return normalize(client)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t))
    .some((token) => haystack.includes(token));
}
