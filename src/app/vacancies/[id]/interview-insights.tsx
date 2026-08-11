"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getPipelineActor } from "@/lib/pipeline";
import {
  INSIGHT_CATEGORIES,
  CATEGORY_LABELS,
  emptyInsights,
  sortForDisplay,
  countForBadge,
  type InsightCategory,
  type Insights,
  type InsightItem,
} from "@/lib/interview-insights";
import {
  Mic,
  FileText,
  Loader2,
  Star,
  Eye,
  EyeOff,
  Check,
  X,
  Plus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────

type InterviewStatus = "PROCESSING" | "READY" | "FAILED";

interface VacancyInterview {
  id: string;
  vacancyId: string;
  createdAt: string;
  actor: string;
  source: "TEXT" | "AUDIO";
  rawText: string | null;
  audioFileUrl: string | null;
  transcript: string | null;
  status: InterviewStatus;
  errorMessage: string | null;
}

// ── Interview status badge ───────────────────────────────────────────

function InterviewStatusBadge({
  interview,
  onRetry,
}: {
  interview: VacancyInterview;
  onRetry: () => void;
}) {
  const { status, errorMessage } = interview;

  if (status === "PROCESSING") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[12px] font-medium text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        AI обрабатывает…
      </span>
    );
  }

  if (status === "READY" && !errorMessage) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[12px] font-medium text-zinc-500">
        <Check className="h-3 w-3" />
        Готова
      </span>
    );
  }

  if (status === "FAILED" || (status === "READY" && errorMessage)) {
    const isFailed = status === "FAILED";
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span
          className={
            isFailed
              ? "rounded-full bg-red-100 dark:bg-red-900/40 px-2.5 py-1 text-[12px] font-medium text-red-700 dark:text-red-300"
              : "rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 text-[12px] font-medium text-amber-700 dark:text-amber-300"
          }
        >
          {isFailed
            ? `Ошибка: ${errorMessage ?? "неизвестная ошибка"}`
            : `AI-анализ не удался: ${errorMessage}`}
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

// ── Interview row ─────────────────────────────────────────────────────

function InterviewRow({
  interview,
  expanded,
  onToggle,
  onRetry,
}: {
  interview: VacancyInterview;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const fullText = interview.transcript ?? interview.rawText ?? "";

  return (
    <div
      data-click-sound="press"
      className="rounded-lg border border-border bg-white dark:bg-zinc-900 overflow-hidden cursor-pointer transition-colors hover:border-border/70"
      onClick={onToggle}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[12px] text-muted-foreground shrink-0">
            {new Date(interview.createdAt).toLocaleString("ru-RU")}
          </span>
          <span className="text-[12px] font-medium text-foreground shrink-0">
            {interview.actor}
          </span>
          {interview.source === "AUDIO" ? (
            <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
        <div className="shrink-0">
          <InterviewStatusBadge interview={interview} onRetry={onRetry} />
        </div>
      </div>

      {expanded && (
        <div
          className="border-t border-border px-4 py-3 bg-muted/5"
          onClick={(e) => e.stopPropagation()}
        >
          {fullText ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {fullText}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground italic">
              Текст пока недоступен
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recording form ────────────────────────────────────────────────────

function RecordingForm({
  vacancyId,
  onCreated,
  onCancel,
}: {
  vacancyId: string;
  onCreated: (interview: VacancyInterview) => void;
  onCancel: () => void;
}) {
  const [rawText, setRawText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = rawText.trim().length > 0 || audioFile !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");

    const actor = getPipelineActor();
    const fd = new FormData();
    if (rawText.trim()) fd.append("rawText", rawText.trim());
    if (audioFile) fd.append("audio", audioFile);
    fd.append("actor", actor);

    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/interviews`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Ошибка ${res.status}`);
      }
      const created: VacancyInterview = await res.json();
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
      className="rounded-lg border border-border bg-white dark:bg-zinc-900 p-4 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="Кратко или полный транскрипт"
        rows={4}
        className="w-full rounded border border-border bg-background px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors"
        >
          <Mic className="h-3.5 w-3.5" />
          Прикрепить запись (опционально)
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

// ── Insight row ───────────────────────────────────────────────────────

function InsightRow({
  item,
  muted = false,
  onToggleImportant,
  onToggleHidden,
  onSaveText,
}: {
  item: InsightItem;
  muted?: boolean;
  onToggleImportant: () => Promise<boolean>;
  onToggleHidden: () => Promise<boolean>;
  onSaveText: (newText: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [error, setError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  const flashError = () => {
    setError("Не удалось сохранить");
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setError(null), 3000);
  };

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(item.text);
  }, [item.text, editing]);

  const startEditing = () => {
    setDraft(item.text);
    setEditing(true);
  };

  const finishEditing = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.text) {
      setDraft(item.text);
      return;
    }
    onSaveText(trimmed).then((ok) => {
      if (!ok) flashError();
    });
  };

  return (
    <div
      className={`flex items-start gap-2 py-1.5 ${muted ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={() => {
          onToggleImportant().then((ok) => {
            if (!ok) flashError();
          });
        }}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-amber-500 transition-colors"
        title={item.important ? "Убрать важность" : "Отметить как важное"}
      >
        <Star
          className={`h-3.5 w-3.5 ${
            item.important ? "fill-amber-400 text-amber-500" : ""
          }`}
        />
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finishEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                textareaRef.current?.blur();
              }
              if (e.key === "Escape") {
                setDraft(item.text);
                setEditing(false);
              }
            }}
            rows={2}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[13px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        ) : (
          <p
            onClick={startEditing}
            className="text-[13px] leading-relaxed cursor-text hover:bg-muted/40 rounded px-1 -mx-1"
          >
            {item.text}
          </p>
        )}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {item.origin === "ai" ? "AI" : "Ручной"}
        </span>
        {error && (
          <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          onToggleHidden().then((ok) => {
            if (!ok) flashError();
          });
        }}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title={item.hidden ? "Показать" : "Скрыть"}
      >
        {item.hidden ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────

function CategoryCard({
  category,
  items,
  onToggleImportant,
  onToggleHidden,
  onSaveText,
  onAdd,
}: {
  category: InsightCategory;
  items: InsightItem[];
  onToggleImportant: (id: string) => Promise<boolean>;
  onToggleHidden: (id: string) => Promise<boolean>;
  onSaveText: (id: string, text: string) => Promise<boolean>;
  onAdd: (text: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const [addText, setAddText] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  const { visible, hidden } = sortForDisplay(items);
  const counts = countForBadge(items);
  const countParts = [`${counts.total}`];
  if (counts.hidden > 0) countParts.push(`${counts.hidden} скрыто`);
  if (counts.important > 0) countParts.push(`${counts.important} важных`);

  const handleAdd = async () => {
    const trimmed = addText.trim();
    if (!trimmed || addSubmitting) return;
    setAddSubmitting(true);
    setAddError("");
    const result = await onAdd(trimmed);
    setAddSubmitting(false);
    if (result.ok) {
      setAddText("");
      return;
    }
    if (result.status === 409) {
      setAddError("Такой инсайт уже есть");
    } else {
      setAddError(result.error ?? "Не удалось добавить");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-[13px] font-semibold">{CATEGORY_LABELS[category]}</h3>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {countParts.join(" · ")}
        </span>
      </div>

      {visible.length === 0 && hidden.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-1">Пока пусто</p>
      ) : (
        <div className="divide-y divide-border/50">
          {visible.map((item) => (
            <InsightRow
              key={item.id}
              item={item}
              onToggleImportant={() => onToggleImportant(item.id)}
              onToggleHidden={() => onToggleHidden(item.id)}
              onSaveText={(text) => onSaveText(item.id, text)}
            />
          ))}
        </div>
      )}

      {hidden.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {showHidden ? "Скрыть скрытые" : `Показать скрытые (${hidden.length})`}
          </button>
          {showHidden && (
            <div className="mt-1 divide-y divide-border/50">
              {hidden.map((item) => (
                <InsightRow
                  key={item.id}
                  item={item}
                  muted
                  onToggleImportant={() => onToggleImportant(item.id)}
                  onToggleHidden={() => onToggleHidden(item.id)}
                  onSaveText={(text) => onSaveText(item.id, text)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border/50 flex items-start gap-2">
        <input
          type="text"
          value={addText}
          onChange={(e) => {
            setAddText(e.target.value);
            if (addError) setAddError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="+ Добавить свой инсайт"
          className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!addText.trim() || addSubmitting}
          className="shrink-0 inline-flex items-center justify-center h-[30px] w-[30px] rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {addError && (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{addError}</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function InterviewInsights({ vacancyId }: { vacancyId: string }) {
  const [interviews, setInterviews] = useState<VacancyInterview[]>([]);
  const [insights, setInsights] = useState<Insights>(emptyInsights());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentVacancyIdRef = useRef(vacancyId);

  useEffect(() => {
    currentVacancyIdRef.current = vacancyId;
  }, [vacancyId]);

  const hasProcessing = (list: VacancyInterview[]) =>
    list.some((i) => i.status === "PROCESSING");

  const fetchAll = async () => {
    const expected = vacancyId;
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/interviews`);
      if (!res.ok) return;
      const data: { interviews: VacancyInterview[]; interviewInsights: Insights | null } =
        await res.json();
      if (expected === currentVacancyIdRef.current) {
        setInterviews(data.interviews);
        setInsights(data.interviewInsights ?? emptyInsights());
      }
      return data.interviews;
    } catch (err) {
      console.error("interview-insights fetch failed:", err);
    }
  };

  const stopPolling = () => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = () => {
    if (pollingRef.current !== null) return;
    pollingRef.current = setInterval(async () => {
      const fresh = await fetchAll();
      if (fresh && !hasProcessing(fresh)) {
        stopPolling();
      }
    }, 3000);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/vacancies/${vacancyId}/interviews`)
      .then((r) => r.json())
      .then((data: { interviews: VacancyInterview[]; interviewInsights: Insights | null }) => {
        if (!active) return;
        setInterviews(data.interviews);
        setInsights(data.interviewInsights ?? emptyInsights());
        if (hasProcessing(data.interviews)) startPolling();
      })
      .catch((err) => {
        if (active) console.error("interview-insights fetch error:", err);
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

  const handleCreated = (created: VacancyInterview) => {
    setInterviews((prev) => [created, ...prev]);
    setShowForm(false);
    startPolling();
  };

  const handleRetry = async (interviewId: string) => {
    setInterviews((prev) =>
      prev.map((i) =>
        i.id === interviewId
          ? { ...i, status: "PROCESSING" as const, errorMessage: null }
          : i
      )
    );
    startPolling();
    try {
      const res = await fetch(
        `/api/vacancies/${vacancyId}/interviews/${interviewId}/retry`,
        { method: "POST" }
      );
      if (!res.ok) {
        console.error("interview retry failed:", res.status);
        await fetchAll();
      }
    } catch (err) {
      console.error("interview retry network error:", err);
      await fetchAll();
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

  // ── Insight item mutations ───────────────────────────────────────

  const findItem = (cat: InsightCategory, id: string) =>
    insights[cat].find((i) => i.id === id);

  const setItemLocal = (
    cat: InsightCategory,
    id: string,
    updater: (item: InsightItem) => InsightItem
  ) => {
    setInsights((prev) => ({
      ...prev,
      [cat]: prev[cat].map((i) => (i.id === id ? updater(i) : i)),
    }));
  };

  const patchItem = async (
    cat: InsightCategory,
    id: string,
    patch: Partial<Pick<InsightItem, "text" | "important" | "hidden">>,
    revertFrom: InsightItem
  ): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/vacancies/${vacancyId}/interview-insights/items/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const updated: InsightItem = await res.json();
      setItemLocal(cat, id, () => updated);
      return true;
    } catch (err) {
      console.error("patch insight item failed:", err);
      // Revert only the fields this patch touched, so a concurrent successful
      // edit to a different field on the same item isn't clobbered.
      const revertPatch = Object.fromEntries(
        (Object.keys(patch) as (keyof typeof patch)[]).map((k) => [k, revertFrom[k]])
      );
      setItemLocal(cat, id, (cur) => ({ ...cur, ...revertPatch }));
      return false;
    }
  };

  const handleToggleImportant = (cat: InsightCategory, id: string) => {
    const item = findItem(cat, id);
    if (!item) return Promise.resolve(true);
    const optimistic = { ...item, important: !item.important };
    setItemLocal(cat, id, () => optimistic);
    return patchItem(cat, id, { important: optimistic.important }, item);
  };

  const handleToggleHidden = (cat: InsightCategory, id: string) => {
    const item = findItem(cat, id);
    if (!item) return Promise.resolve(true);
    const optimistic = { ...item, hidden: !item.hidden };
    setItemLocal(cat, id, () => optimistic);
    return patchItem(cat, id, { hidden: optimistic.hidden }, item);
  };

  const handleSaveText = (cat: InsightCategory, id: string, text: string) => {
    const item = findItem(cat, id);
    if (!item) return Promise.resolve(true);
    const optimistic = { ...item, text };
    setItemLocal(cat, id, () => optimistic);
    return patchItem(cat, id, { text }, item);
  };

  const handleAddItem = async (
    cat: InsightCategory,
    text: string
  ): Promise<{ ok: boolean; status?: number; error?: string }> => {
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/interview-insights/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, text }),
      });
      if (res.status === 201) {
        const item: InsightItem = await res.json();
        setInsights((prev) => ({ ...prev, [cat]: [...prev[cat], item] }));
        return { ok: true };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, error: data.error };
    } catch (err) {
      console.error("add insight item failed:", err);
      return { ok: false, error: "Сетевая ошибка" };
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return <p className="text-[13px] text-muted-foreground py-2">Загрузка…</p>;
  }

  const isEmpty =
    interviews.length === 0 &&
    INSIGHT_CATEGORIES.every((cat) => insights[cat].length === 0);

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 px-6 flex flex-col items-center gap-3 text-center">
        <p className="text-[13px] text-muted-foreground max-w-sm">
          Загрузите первую запись встречи с лидом, чтобы AI выделил ключевые фокусы, вопросы и советы
        </p>
        {showForm ? (
          <div className="w-full max-w-md">
            <RecordingForm
              vacancyId={vacancyId}
              onCreated={handleCreated}
              onCancel={() => setShowForm(false)}
            />
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            style={{ background: "#F97029" }}
            className="text-white font-semibold"
          >
            + Загрузить запись
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="t-card-title">Инсайты с интервью</span>
        {!showForm && (
          <button
            className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors hover:border-border/70"
            onClick={() => setShowForm(true)}
          >
            + Загрузить запись
          </button>
        )}
      </div>

      {showForm && (
        <RecordingForm
          vacancyId={vacancyId}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Timeline */}
      {interviews.length > 0 && (
        <div className="space-y-2">
          {interviews.map((interview) => (
            <InterviewRow
              key={interview.id}
              interview={interview}
              expanded={expanded.has(interview.id)}
              onToggle={() => toggleExpanded(interview.id)}
              onRetry={() => handleRetry(interview.id)}
            />
          ))}
        </div>
      )}

      {/* Category cards */}
      <div className="grid grid-cols-2 gap-3">
        {INSIGHT_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat}
            category={cat}
            items={insights[cat]}
            onToggleImportant={(id) => handleToggleImportant(cat, id)}
            onToggleHidden={(id) => handleToggleHidden(cat, id)}
            onSaveText={(id, text) => handleSaveText(cat, id, text)}
            onAdd={(text) => handleAddItem(cat, text)}
          />
        ))}
      </div>
    </div>
  );
}
