/**
 * Нарезка одного транскрипта на куски по вакансиям.
 *
 * Модель НЕ переписывает транскрипт — она возвращает только номера строк
 * ({vacancyId, fromLine, toLine}), а сам текст режется здесь. Так дословный
 * текст звонка не теряется и не пересказывается: на часовой записи пересказ
 * съедал бы детали и стоил бы лишних токенов на каждый ответ.
 *
 * Вход от модели считается недоверенным: любые кривые записи (чужой id,
 * строка вместо числа, перевёрнутый диапазон) отбрасываются молча, чтобы
 * одна плохая запись не роняла разбор всего звонка.
 */

export interface TranscriptSegment {
  vacancyId: string;
  text: string;
  /** Сколько строк транскрипта попало в этот кусок — для UI и логов. */
  lineCount: number;
}

/**
 * Крупнее этого куска строка быть не должна: границу между вакансиями
 * модель указывает номером строки, и всё, что внутри строки, разрезать уже
 * нельзя. На реальной расшифровке 43-минутного звонка Gemini вернул 7 строк,
 * последняя — 100 000 символов: без дробления вся запись оказывалась одним
 * неделимым куском, и разделение по позициям было невозможно в принципе.
 */
const MAX_LINE_CHARS = 400;

/** Метка спикера в начале реплики: «[Спикер 2]», «[Speaker 1]». */
const SPEAKER_MARKER = /(?=\[(?:Спикер|Speaker)\s*\d+\])/g;

/** Конец предложения — точка/!/? с пробелом после и не внутри сокращения. */
const SENTENCE_END = /(?<=[.!?…])\s+/;

function packSentences(text: string): string[] {
  const out: string[] = [];
  let current = "";

  for (const sentence of text.split(SENTENCE_END)) {
    if (!current) {
      current = sentence;
    } else if (current.length + sentence.length + 1 <= MAX_LINE_CHARS) {
      current += " " + sentence;
    } else {
      out.push(current);
      current = sentence;
    }
    // Одно предложение длиннее лимита (расшифровка без знаков препинания) —
    // режем по словам, иначе кусок снова станет неделимым.
    while (current.length > MAX_LINE_CHARS) {
      const cut = current.lastIndexOf(" ", MAX_LINE_CHARS);
      const at = cut > MAX_LINE_CHARS / 2 ? cut : MAX_LINE_CHARS;
      out.push(current.slice(0, at));
      current = current.slice(at).trimStart();
    }
  }

  if (current) out.push(current);
  return out;
}

/**
 * Разбивает транскрипт на строки, пригодные для адресации по номерам.
 *
 * Сначала по переводам строк, затем длинные куски — по репликам спикеров,
 * затем по предложениям. Нумерация и нарезка используют одну и ту же функцию,
 * поэтому номера, которые видит модель, всегда совпадают с тем, что режется.
 */
export function splitTranscriptLines(transcript: string): string[] {
  if (!transcript.trim()) return [];

  const out: string[] = [];
  for (const raw of transcript.replace(/\r\n/g, "\n").split("\n")) {
    if (raw.length <= MAX_LINE_CHARS) {
      out.push(raw);
      continue;
    }
    for (const turn of raw.split(SPEAKER_MARKER)) {
      if (!turn) continue;
      if (turn.length <= MAX_LINE_CHARS) out.push(turn.trim());
      else out.push(...packSentences(turn.trim()));
    }
  }
  return out;
}

/** Нумерует строки для промпта: модель ссылается на них в ответе. */
export function numberTranscript(transcript: string): string {
  return splitTranscriptLines(transcript)
    .map((line, i) => `${i + 1}| ${line}`)
    .join("\n");
}

function toLineNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * Применяет диапазоны строк к транскрипту.
 *
 * Диапазоны одной вакансии склеиваются через пустую строку — разговор часто
 * возвращается к первой позиции в конце звонка, и эти куски должны попасть
 * в одно уточнение.
 */
/**
 * Общий сборщик: группирует диапазоны по ключу и склеивает куски.
 * Ключ — id вакансии (уточнения) или её название (создание с нуля).
 */
function collectRanges(
  transcript: string,
  rawRanges: unknown,
  keyOf: (r: Record<string, unknown>) => string | null,
): { key: string; text: string; lineCount: number }[] {
  const lines = splitTranscriptLines(transcript);
  if (lines.length === 0 || !Array.isArray(rawRanges)) return [];

  const order: string[] = [];
  const chunks = new Map<string, { parts: string[]; lineCount: number }>();

  for (const raw of rawRanges) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const key = keyOf(r);
    if (!key) continue;

    const from = toLineNumber(r.fromLine);
    const to = toLineNumber(r.toLine);
    if (from === null || to === null) continue;

    const start = Math.max(1, from);
    const end = Math.min(lines.length, to);
    if (start > end) continue;

    const slice = lines.slice(start - 1, end);
    if (!slice.join("\n").trim()) continue;

    if (!chunks.has(key)) {
      chunks.set(key, { parts: [], lineCount: 0 });
      order.push(key);
    }
    const chunk = chunks.get(key)!;
    chunk.parts.push(slice.join("\n"));
    chunk.lineCount += slice.length;
  }

  return order.map((key) => {
    const chunk = chunks.get(key)!;
    return {
      key,
      text: chunk.parts.join("\n\n").trim(),
      lineCount: chunk.lineCount,
    };
  });
}

export function applySplitRanges(
  transcript: string,
  rawRanges: unknown,
  allowedVacancyIds: string[],
): TranscriptSegment[] {
  const allowed = new Set(allowedVacancyIds);
  return collectRanges(transcript, rawRanges, (r) =>
    typeof r.vacancyId === "string" && allowed.has(r.vacancyId) ? r.vacancyId : null,
  ).map(({ key, text, lineCount }) => ({ vacancyId: key, text, lineCount }));
}

/** Кусок звонка под вакансию, которой ещё нет в базе. */
export interface DetectedSegment {
  /** Как модель назвала позицию — показывается в выборе на форме создания. */
  label: string;
  text: string;
  lineCount: number;
}

/**
 * Разбор звонка, на котором обсуждали несколько ЕЩЁ НЕ созданных вакансий.
 * Отличие от applySplitRanges: привязываться не к чему, поэтому куски
 * группируются по названию позиции, которое дала сама модель.
 */
export function applyDetectedSegments(
  transcript: string,
  rawRanges: unknown,
): DetectedSegment[] {
  return collectRanges(transcript, rawRanges, (r) => {
    const label = typeof r.label === "string" ? r.label.trim() : "";
    return label || null;
  }).map(({ key, text, lineCount }) => ({ label: key, text, lineCount }));
}
