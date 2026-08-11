"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPipelineActor } from "@/lib/pipeline";
import { FIELD_LABELS, type DiffItem } from "@/lib/vacancy-update";
import {
  Mic,
  FileText,
  Loader2,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────

type UpdateStatus =
  | "PROCESSING"
  | "PENDING"
  | "APPLIED"
  | "DISMISSED"
  | "EMPTY"
  | "FAILED";

interface VacancyUpdate {
  id: string;
  createdAt: string;
  actor: string;
  kind: "TEXT" | "AUDIO";
  rawText: string | null;
  transcript: string | null;
  status: UpdateStatus;
  proposedDiff: DiffItem[] | null;
  appliedDiff: DiffItem[] | null;
  appliedAt: string | null;
  errorMessage: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function StatusBadge({
  update,
  onRetry,
}: {
  update: VacancyUpdate;
  onRetry: () => void;
}) {
  const { status, proposedDiff, appliedDiff, errorMessage } = update;

  if (status === "PROCESSING") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[12px] font-medium text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        AI обрабатывает…
      </span>
    );
  }
  if (status === "PENDING") {
    const n = proposedDiff?.length ?? 0;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 text-[12px] font-medium text-amber-700 dark:text-amber-300">
        Готов дифф ({n} предложений)
      </span>
    );
  }
  if (status === "APPLIED") {
    const applied = appliedDiff?.length ?? 0;
    const total = proposedDiff?.length ?? applied;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
        Применено {applied} из {total}
      </span>
    );
  }
  if (status === "DISMISSED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[12px] font-medium text-zinc-400">
        Отклонено
      </span>
    );
  }
  if (status === "EMPTY") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[12px] font-medium text-zinc-400">
        AI не нашёл изменений
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="rounded-full bg-red-100 dark:bg-red-900/40 px-2.5 py-1 text-[12px] font-medium text-red-700 dark:text-red-300">
          Ошибка: {errorMessage ?? "неизвестная ошибка"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Повторить
        </button>
      </span>
    );
  }
  return null;
}

// ── Long text fields (use textarea instead of input) ──────────────────

const LONG_FIELDS = new Set([
  "productDescription",
  "reasonForHiring",
  "teamComposition",
  "clientNotes",
  "internalNotes",
]);

// ── DiffPreview ───────────────────────────────────────────────────────

interface DiffPreviewProps {
  diff: DiffItem[];
  readOnly?: boolean;
  checked?: Set<number>;
  onCheck?: (index: number, checked: boolean) => void;
  editedValues?: Map<number, unknown>;
  onEdit?: (index: number, value: unknown) => void;
}

function DiffPreview({
  diff,
  readOnly = false,
  checked,
  onCheck,
  editedValues,
  onEdit,
}: DiffPreviewProps) {
  // Group items by field, preserving original indices
  const groups = new Map<string, Array<{ item: DiffItem; index: number }>>();
  diff.forEach((item, index) => {
    const key = item.field;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ item, index });
  });

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([field, entries]) => (
        <div key={field}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {FIELD_LABELS[field] ?? field}
          </p>
          <div className="space-y-2">
            {entries.map(({ item, index }) => (
              <DiffItemRow
                key={index}
                item={item}
                index={index}
                readOnly={readOnly}
                isChecked={checked?.has(index) ?? false}
                onCheck={onCheck}
                editedValue={editedValues?.get(index)}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface DiffItemRowProps {
  item: DiffItem;
  index: number;
  readOnly: boolean;
  isChecked: boolean;
  onCheck?: (index: number, checked: boolean) => void;
  editedValue?: unknown;
  onEdit?: (index: number, value: unknown) => void;
}

function DiffItemRow({
  item,
  index,
  readOnly,
  isChecked,
  onCheck,
  editedValue,
  onEdit,
}: DiffItemRowProps) {
  const isScoring = item.field === "scoringCriteria";

  const renderValue = () => {
    if (readOnly) {
      // Read-only applied view
      if (item.op === "remove") {
        return (
          <span className="text-[13px] text-muted-foreground line-through">
            {isScoring
              ? String(item.proposedValue)
              : String(item.proposedValue)}
          </span>
        );
      }
      if (item.op === "set") {
        return (
          <span className="text-[13px]">{String(item.proposedValue)}</span>
        );
      }
      if (item.op === "add") {
        if (isScoring) {
          const v = item.proposedValue as {
            criterion: string;
            weight: number;
            type: string;
          };
          return (
            <span className="text-[13px] text-emerald-700 dark:text-emerald-400">
              + {v.criterion} ({v.weight}%, {v.type})
            </span>
          );
        }
        return (
          <span className="text-[13px] text-emerald-700 dark:text-emerald-400">
            + {String(item.proposedValue)}
          </span>
        );
      }
      if (item.op === "modify") {
        if (isScoring) {
          const v = item.proposedValue as {
            from: string;
            to: { criterion: string; weight: number; type: string };
          };
          return (
            <span className="text-[13px]">
              <span className="text-muted-foreground line-through mr-1">{v.from}</span>
              {" → "}
              {v.to.criterion} ({v.to.weight}%, {v.to.type})
            </span>
          );
        }
        const v = item.proposedValue as { from: unknown; to: unknown };
        return (
          <span className="text-[13px]">
            <span className="text-muted-foreground line-through mr-1">{String(v.from)}</span>
            {" → "}
            {String(v.to)}
          </span>
        );
      }
      return null;
    }

    // Editable view
    if (isScoring) {
      if (item.op === "remove") {
        const name =
          typeof item.proposedValue === "string"
            ? item.proposedValue
            : (item.proposedValue as { criterion?: string })?.criterion ?? String(item.proposedValue);
        return (
          <span className="text-[13px] text-muted-foreground">
            Удалить: <span className="font-medium">{name}</span>
          </span>
        );
      }
      if (item.op === "add") {
        const def = item.proposedValue as {
          criterion: string;
          weight: number;
          type: string;
        };
        const cur = (editedValue as typeof def) ?? def;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-muted-foreground shrink-0">Добавить:</span>
            <input
              type="text"
              defaultValue={cur.criterion}
              placeholder="Критерий"
              className="flex-1 min-w-[120px] rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              onChange={(e) => {
                onEdit?.(index, { ...cur, criterion: e.target.value });
              }}
            />
            <input
              type="number"
              min={1}
              max={100}
              defaultValue={cur.weight}
              placeholder="Вес"
              className="w-16 rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              onChange={(e) => {
                onEdit?.(index, { ...cur, weight: Number(e.target.value) });
              }}
            />
            <select
              defaultValue={cur.type}
              className="rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              onChange={(e) => {
                onEdit?.(index, { ...cur, type: e.target.value });
              }}
            >
              <option value="required">Обязательный</option>
              <option value="nice_to_have">Желательный</option>
              <option value="stop_factor">Стоп-фактор</option>
            </select>
          </div>
        );
      }
      if (item.op === "modify") {
        const def = item.proposedValue as {
          from: string;
          to: { criterion: string; weight: number; type: string };
        };
        const cur = (editedValue as typeof def) ?? def;
        return (
          <div className="space-y-1.5">
            <p className="text-[12px] text-muted-foreground">
              было: <span className="line-through">{def.from}</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                defaultValue={cur.to.criterion}
                placeholder="Критерий"
                className="flex-1 min-w-[120px] rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                onChange={(e) => {
                  onEdit?.(index, { from: def.from, to: { ...cur.to, criterion: e.target.value } });
                }}
              />
              <input
                type="number"
                min={1}
                max={100}
                defaultValue={cur.to.weight}
                placeholder="Вес"
                className="w-16 rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                onChange={(e) => {
                  onEdit?.(index, { from: def.from, to: { ...cur.to, weight: Number(e.target.value) } });
                }}
              />
              <select
                defaultValue={cur.to.type}
                className="rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                onChange={(e) => {
                  onEdit?.(index, { from: def.from, to: { ...cur.to, type: e.target.value } });
                }}
              >
                <option value="required">Обязательный</option>
                <option value="nice_to_have">Желательный</option>
                <option value="stop_factor">Стоп-фактор</option>
              </select>
            </div>
          </div>
        );
      }
    }

    // Non-scoring fields
    if (item.op === "set") {
      const curVal =
        editedValue !== undefined ? String(editedValue) : String(item.proposedValue ?? "");
      return (
        <div className="space-y-1">
          {item.currentValue != null && (
            <p className="text-[12px] text-muted-foreground">
              было: {String(item.currentValue)}
            </p>
          )}
          {LONG_FIELDS.has(item.field) ? (
            <textarea
              defaultValue={curVal}
              rows={3}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              onChange={(e) => onEdit?.(index, e.target.value)}
            />
          ) : (
            <input
              type="text"
              defaultValue={curVal}
              className="w-full rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
              onChange={(e) => onEdit?.(index, e.target.value)}
            />
          )}
        </div>
      );
    }
    if (item.op === "add") {
      const curVal =
        editedValue !== undefined ? String(editedValue) : String(item.proposedValue ?? "");
      return (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground shrink-0">Добавить:</span>
          <input
            type="text"
            defaultValue={curVal}
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => onEdit?.(index, e.target.value)}
          />
        </div>
      );
    }
    if (item.op === "remove") {
      return (
        <span className="text-[13px] text-muted-foreground">
          Удалить: <span className="line-through font-medium">{String(item.proposedValue)}</span>
        </span>
      );
    }
    if (item.op === "modify") {
      const v = item.proposedValue as { from: unknown; to: unknown };
      const curTo =
        editedValue !== undefined
          ? String((editedValue as { from: unknown; to: unknown }).to ?? editedValue)
          : String(v.to ?? "");
      return (
        <div className="space-y-1">
          <p className="text-[12px] text-muted-foreground">
            было: <span className="line-through">{String(v.from)}</span>
          </p>
          <input
            type="text"
            defaultValue={curTo}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
            onChange={(e) => {
              onEdit?.(index, { from: v.from, to: e.target.value });
            }}
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex gap-3 items-start">
      {!readOnly && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onCheck?.(index, e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <div className="flex-1 min-w-0">
        <div onClick={(e) => e.stopPropagation()}>{renderValue()}</div>
        <p className="mt-1 text-[11px] text-muted-foreground/70 italic">{item.reason}</p>
      </div>
    </div>
  );
}

// ── UpdateCard ────────────────────────────────────────────────────────

interface UpdateCardProps {
  update: VacancyUpdate;
  expanded: boolean;
  onToggle: () => void;
  onApply: (
    updateId: string,
    selections: { index: number; editedValue?: unknown }[]
  ) => Promise<void>;
  onDismiss: (updateId: string) => Promise<void>;
  onRetry: (updateId: string) => Promise<void>;
}

function UpdateCard({
  update,
  expanded,
  onToggle,
  onApply,
  onDismiss,
  onRetry,
}: UpdateCardProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [editedValues, setEditedValues] = useState<Map<number, unknown>>(new Map());
  const [applying, setApplying] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChecked(new Set());
    setEditedValues(new Map());
  }, [update.proposedDiff, update.status]);

  const previewText = update.rawText ?? update.transcript ?? "";

  const handleCheck = (index: number, value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const handleEdit = (index: number, value: unknown) => {
    setEditedValues((prev) => {
      const next = new Map(prev);
      next.set(index, value);
      return next;
    });
  };

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    setApplying(true);
    const selections = [...checked].map((index) => ({
      index,
      editedValue: editedValues.has(index) ? editedValues.get(index) : undefined,
    }));
    try {
      await onApply(update.id, selections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось применить");
    } finally {
      setApplying(false);
    }
  };

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    setDismissing(true);
    try {
      await onDismiss(update.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отклонить");
    } finally {
      setDismissing(false);
    }
  };

  const diff = update.proposedDiff ?? [];

  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden cursor-pointer transition-colors hover:border-border/70"
      onClick={onToggle}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[12px] text-muted-foreground shrink-0">
            {new Date(update.createdAt).toLocaleString("ru-RU")}
          </span>
          <span className="text-[12px] font-medium text-foreground shrink-0">
            {update.actor}
          </span>
          {update.kind === "AUDIO" ? (
            <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
        <div className="shrink-0">
          <StatusBadge
            update={update}
            onRetry={() => onRetry(update.id)}
          />
        </div>
      </div>

      {/* Text preview (collapsed) */}
      {!expanded && previewText && (
        <p className="px-4 pb-3.5 text-[13px] text-muted-foreground line-clamp-3 leading-relaxed">
          {previewText}
        </p>
      )}

      {/* Expanded content */}
      {expanded && (
        <div
          className="border-t border-border px-4 py-4 space-y-4 bg-muted/5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Full text */}
          {update.rawText && (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
              {update.rawText}
            </p>
          )}
          {update.rawText && update.transcript && (
            <hr className="border-border" />
          )}
          {update.transcript && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Транскрипция
              </p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {update.transcript}
              </p>
            </div>
          )}

          {/* PENDING: interactive diff */}
          {update.status === "PENDING" && diff.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Предложенные изменения
              </p>
              <DiffPreview
                diff={diff}
                checked={checked}
                onCheck={handleCheck}
                editedValues={editedValues}
                onEdit={handleEdit}
              />
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={checked.size === 0 || applying}
                    onClick={handleApply}
                    style={checked.size > 0 ? { background: "#F97029" } : undefined}
                    className={checked.size > 0 ? "text-white font-semibold" : ""}
                  >
                    {applying
                      ? "Применяем…"
                      : `Применить отмеченное (${checked.size})`}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dismissing || applying}
                    onClick={handleDismiss}
                  >
                    {dismissing ? "…" : "Отказаться от всего"}
                  </Button>
                </div>
                {error && (
                  <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
                )}
              </div>
            </div>
          )}

          {/* APPLIED: read-only applied diff */}
          {update.status === "APPLIED" && (update.appliedDiff?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Применённые изменения
              </p>
              <DiffPreview diff={update.appliedDiff!} readOnly />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add update form ───────────────────────────────────────────────────

interface AddFormProps {
  vacancyId: string;
  onCreated: (update: VacancyUpdate) => void;
  onCancel: () => void;
}

interface VacancyOption {
  id: string;
  title: string;
  clientName: string | null;
}

function AddForm({ vacancyId, onCreated, onCancel }: AddFormProps) {
  const [rawText, setRawText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Разнесение одной записи по нескольким вакансиям
  const [alsoOpen, setAlsoOpen] = useState(false);
  const [options, setOptions] = useState<VacancyOption[]>([]);
  const [alsoIds, setAlsoIds] = useState<string[]>([]);

  // Список подтягиваем один раз, когда пользователь раскрыл блок.
  useEffect(() => {
    if (!alsoOpen || options.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vacancies?limit=100");
        if (!res.ok) return;
        const json = await res.json();
        const list: VacancyOption[] = (json.data ?? [])
          .filter(
            (v: { id: string; status: string }) =>
              v.id !== vacancyId && v.status !== "CLOSED" && v.status !== "FILLED",
          )
          .map((v: VacancyOption) => ({
            id: v.id,
            title: v.title,
            clientName: v.clientName,
          }));
        if (!cancelled) setOptions(list);
      } catch {
        /* список необязателен — молча остаёмся с пустым */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alsoOpen, options.length, vacancyId]);

  // Разнесение имеет смысл только для записи: текст проще вставить руками.
  const splitting = audioFile !== null && alsoIds.length > 0;
  const canSubmit = rawText.trim().length > 0 || audioFile !== null;

  const toggleAlso = (id: string) =>
    setAlsoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");

    const actor = getPipelineActor();
    const fd = new FormData();
    fd.append("actor", actor);

    try {
      if (splitting) {
        fd.append("audio", audioFile!);
        fd.append("vacancyIds", vacancyId);
        for (const id of alsoIds) fd.append("vacancyIds", id);

        const res = await fetch("/api/vacancies/updates-multi", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Ошибка ${res.status}`);
        }
        const { updates } = (await res.json()) as {
          updates: (VacancyUpdate & { vacancyId: string })[];
        };
        // На этой странице показываем только запись текущей вакансии —
        // остальные появятся на своих страницах.
        const mine = updates.find((u) => u.vacancyId === vacancyId);
        if (mine) onCreated(mine);
        return;
      }

      if (rawText.trim()) fd.append("rawText", rawText.trim());
      if (audioFile) fd.append("audio", audioFile);

      const res = await fetch(`/api/vacancies/${vacancyId}/updates`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Ошибка ${res.status}`);
      }
      const created: VacancyUpdate = await res.json();
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="Кратко: что обсуждали и какие изменения по позиции"
        rows={4}
        className="w-full rounded border border-border bg-background px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none"
      />

      {/* Audio picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors"
        >
          <Mic className="h-3.5 w-3.5" />
          Прикрепить запись Zoom (опционально)
        </button>
        {audioFile && (
          <span className="flex items-center gap-1.5 text-[12px] text-foreground">
            {audioFile.name}
            <button
              type="button"
              onClick={() => {
                setAudioFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".m4a,.mp3,.aac"
          className="hidden"
          onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Разнесение записи по нескольким вакансиям */}
      {audioFile && (
        <div className="rounded-md border border-border bg-background/60 p-3 space-y-2">
          {!alsoOpen ? (
            <button
              type="button"
              onClick={() => setAlsoOpen(true)}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              На записи обсуждали ещё другие вакансии →
            </button>
          ) : (
            <>
              <p className="text-[12px] text-muted-foreground">
                Отметь остальные вакансии со звонка. Запись расшифруем один раз,
                разделим по позициям и в каждую отправим только её часть.
              </p>
              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {options.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Загружаем список…</p>
                ) : (
                  options.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-start gap-2 text-[12px] cursor-pointer rounded px-1.5 py-1 hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={alsoIds.includes(v.id)}
                        onChange={() => toggleAlso(v.id)}
                        className="mt-0.5 accent-[#F97029]"
                      />
                      <span>
                        {v.title}
                        {v.clientName && (
                          <span className="text-muted-foreground"> · {v.clientName}</span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
              {splitting && rawText.trim() && (
                <p className="text-[12px] text-amber-600 dark:text-amber-400">
                  Комментарий сверху не отправится: он относился бы сразу ко всем
                  вакансиям. Добавь его отдельным уточнением.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!canSubmit || submitting}
          style={canSubmit ? { background: "#F97029" } : undefined}
          className={canSubmit ? "text-white font-semibold" : ""}
        >
          {submitting ? "Отправляем…" : "Отправить"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Отменить
        </Button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function VacancyUpdates({ vacancyId }: { vacancyId: string }) {
  const [updates, setUpdates] = useState<VacancyUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentVacancyIdRef = useRef(vacancyId);

  useEffect(() => {
    currentVacancyIdRef.current = vacancyId;
  }, [vacancyId]);

  const hasProcessing = (list: VacancyUpdate[]) =>
    list.some((u) => u.status === "PROCESSING");

  const fetchUpdates = async () => {
    const expected = vacancyId;
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/updates`);
      if (!res.ok) return;
      const data: VacancyUpdate[] = await res.json();
      if (expected === currentVacancyIdRef.current) {
        setUpdates(data);
      }
      return data;
    } catch (err) {
      console.error("vacancy-updates fetch failed:", err);
    }
  };

  // Stop polling helper
  const stopPolling = () => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Start polling helper (idempotent)
  const startPolling = () => {
    if (pollingRef.current !== null) return; // already running
    pollingRef.current = setInterval(async () => {
      const fresh = await fetchUpdates();
      if (fresh && !hasProcessing(fresh)) {
        stopPolling();
      }
    }, 3000);
  };

  // Initial fetch + maybe start polling
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/vacancies/${vacancyId}/updates`)
      .then((r) => r.json())
      .then((data: VacancyUpdate[]) => {
        if (!active) return;
        setUpdates(data);
        if (hasProcessing(data)) startPolling();
      })
      .catch((err) => {
        if (active) console.error("updates fetch error:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacancyId]);

  const handleCreated = (created: VacancyUpdate) => {
    setUpdates((prev) => [created, ...prev]);
    setShowForm(false);
    startPolling(); // ensure polling is running for the new PROCESSING record
  };

  const handleApply = async (
    updateId: string,
    selections: { index: number; editedValue?: unknown }[]
  ) => {
    let res: Response;
    try {
      res = await fetch(
        `/api/vacancies/${vacancyId}/updates/${updateId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selections }),
        }
      );
    } catch {
      throw new Error("Сетевая ошибка");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Не удалось применить");
    }
    await fetchUpdates();
  };

  const handleDismiss = async (updateId: string) => {
    let res: Response;
    try {
      res = await fetch(
        `/api/vacancies/${vacancyId}/updates/${updateId}/dismiss`,
        { method: "POST" }
      );
    } catch {
      throw new Error("Сетевая ошибка");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Не удалось отклонить");
    }
    await fetchUpdates();
  };

  const handleRetry = async (updateId: string) => {
    // Optimistically set to PROCESSING so polling kicks in
    setUpdates((prev) =>
      prev.map((u) =>
        u.id === updateId ? { ...u, status: "PROCESSING" as const } : u
      )
    );
    startPolling();
    try {
      const res = await fetch(
        `/api/vacancies/${vacancyId}/updates/${updateId}/retry`,
        { method: "POST" }
      );
      if (!res.ok) {
        console.error("vacancy-updates retry failed:", res.status);
        await fetchUpdates();
      }
      // On success: polling will pick up the real status
    } catch (err) {
      console.error("vacancy-updates retry network error:", err);
      await fetchUpdates();
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          <span className="t-card-title">Уточнения</span>
        </div>
        {!showForm && (
          <button
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors hover:border-border/70"
            onClick={() => setShowForm(true)}
          >
            + Добавить уточнение
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <AddForm
          vacancyId={vacancyId}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Timeline */}
      {loading ? (
        <p className="text-[13px] text-muted-foreground py-2">Загрузка…</p>
      ) : updates.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-2">
          Уточнений пока нет
        </p>
      ) : (
        <div className="space-y-2">
          {updates.map((update) => (
            <UpdateCard
              key={update.id}
              update={update}
              expanded={expanded.has(update.id)}
              onToggle={() => toggleExpanded(update.id)}
              onApply={handleApply}
              onDismiss={handleDismiss}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
