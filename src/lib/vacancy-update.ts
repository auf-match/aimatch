export type DiffOp = "set" | "add" | "remove" | "modify";

export interface DiffItem {
  field: string;
  op: DiffOp;
  /** Текущее значение (для UI; в applyDiffSelection не используется). */
  currentValue?: unknown;
  /** Что станет после применения этого пункта (семантика зависит от op — см. спеку). */
  proposedValue: unknown;
  reason: string;
}

export interface SelectedItem {
  index: number;
  editedValue?: unknown;
}

/** Поля, изменение которых инвалидирует уже посчитанные DetailedScore. */
export const SCORING_FIELDS = [
  "scoringCriteria",
  "keyTasks",
  "requiredSkills",
  "niceToHaveSkills",
  "preferredDomains",
  "requiredTools",
  "redFlags",
  "specialCompetencies",
  "needsInternational",
] as const;

/** Русские подписи полей для UI. */
export const FIELD_LABELS: Record<string, string> = {
  scoringCriteria: "Критерии скоринга",
  keyTasks: "Ключевые задачи",
  requiredSkills: "Обязательные навыки",
  niceToHaveSkills: "Будет плюсом",
  preferredDomains: "Предпочтительные домены",
  requiredTools: "Инструменты",
  redFlags: "Red flags",
  specialCompetencies: "Специальные компетенции",
  needsInternational: "Нужен международный опыт",
  productDescription: "Описание продукта",
  salaryRange: "Зарплата",
  clientNotes: "Комментарии по клиенту",
  reasonForHiring: "Причина найма",
  teamComposition: "Команда",
  keyResponsibilities: "Ключевые обязанности",
};

export function isStaleScore(
  scoreCreatedAt: Date,
  criteriaUpdatedAt: Date | null,
): boolean {
  if (!criteriaUpdatedAt) return false;
  return scoreCreatedAt.getTime() < criteriaUpdatedAt.getTime();
}

export function diffTouchesScoringFields(applied: DiffItem[]): boolean {
  return applied.some((item) =>
    (SCORING_FIELDS as readonly string[]).includes(item.field),
  );
}

/**
 * Применяет выбранные элементы диффа к вакансии. Возвращает payload для
 * `prisma.vacancy.update` и applied-список (с учётом пользовательских правок).
 *
 * Семантика proposedValue:
 *   - set: новое значение поля целиком
 *   - add (массив): добавляемый элемент
 *   - remove (массив): элемент для точного удаления
 *   - modify (массив): объект { from, to }
 *   - scoringCriteria add: целый объект { criterion, weight, type }
 *   - scoringCriteria remove: строка-имя критерия
 *   - scoringCriteria modify: { from: имя, to: { criterion, weight, type } }
 */
export function applyDiffSelection(
  vacancy: Record<string, unknown>,
  proposedDiff: DiffItem[],
  selections: SelectedItem[],
): { payload: Record<string, unknown>; appliedDiff: DiffItem[] } {
  // Работаем по копии полей, чтобы добавления/удаления к массиву одного поля не мешали друг другу.
  const working: Record<string, unknown> = {};
  const appliedDiff: DiffItem[] = [];

  for (const sel of selections) {
    const original = proposedDiff[sel.index];
    if (!original) continue;
    const value = sel.editedValue !== undefined ? sel.editedValue : original.proposedValue;
    const item: DiffItem = { ...original, proposedValue: value };
    appliedDiff.push(item);

    const current =
      working[item.field] !== undefined
        ? working[item.field]
        : vacancy[item.field];

    if (item.field === "scoringCriteria") {
      const arr = (Array.isArray(current) ? [...(current as unknown[])] : []) as Array<{
        criterion: string;
        weight: number;
        type: string;
      }>;
      if (item.op === "add") {
        arr.push(item.proposedValue as { criterion: string; weight: number; type: string });
      } else if (item.op === "remove") {
        const name = item.proposedValue as string;
        working[item.field] = arr.filter((c) => c.criterion !== name);
        continue;
      } else if (item.op === "modify") {
        const { from, to } = item.proposedValue as {
          from: string;
          to: { criterion: string; weight: number; type: string };
        };
        const idx = arr.findIndex((c) => c.criterion === from);
        if (idx >= 0) arr[idx] = to;
      } else if (item.op === "set") {
        working[item.field] = item.proposedValue;
        continue;
      }
      working[item.field] = arr;
      continue;
    }

    if (item.op === "set") {
      working[item.field] = item.proposedValue;
    } else if (Array.isArray(current)) {
      const arr = [...(current as unknown[])];
      if (item.op === "add") {
        arr.push(item.proposedValue);
      } else if (item.op === "remove") {
        const idx = arr.findIndex((x) => x === item.proposedValue);
        if (idx >= 0) arr.splice(idx, 1);
      } else if (item.op === "modify") {
        const { from, to } = item.proposedValue as { from: unknown; to: unknown };
        const idx = arr.findIndex((x) => x === from);
        if (idx >= 0) arr[idx] = to;
      }
      working[item.field] = arr;
    }
  }

  return { payload: working, appliedDiff };
}
