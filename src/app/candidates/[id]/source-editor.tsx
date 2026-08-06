"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { sourceLabel } from "@/lib/source-detect";
import { dropdownMotion } from "@/lib/motion-dropdown";

/**
 * Инлайн-редактор источника кандидата: показывает текущее значение,
 * по клику открывает комбобокс — выбрать из существующих или добавить новый.
 * Сохраняет через PATCH /api/candidates/:id { source }.
 */
export default function SourceEditor({
  candidateId,
  initialSource,
}: {
  candidateId: string;
  initialSource: string | null;
}) {
  const [source, setSource] = useState<string | null>(initialSource);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Закрытие по клику вне / Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Подгрузка существующих источников при открытии
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    fetch("/api/candidates/sources")
      .then((r) => r.json())
      .then((d) => setOptions(Array.isArray(d.sources) ? d.sources : []))
      .catch(() => {});
  }, [open]);

  const save = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === source) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: trimmed }),
      });
      if (res.ok) setSource(trimmed);
    } catch {
      // silent
    } finally {
      setSaving(false);
      setOpen(false);
      setQuery("");
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = options.filter((o) => o.toLowerCase().includes(q));
  const canAddNew =
    q.length > 0 && !options.some((o) => o.toLowerCase() === q);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
        title="Источник кандидата — откуда пришёл"
      >
        <span className="text-muted-foreground">Источник:</span>{" "}
        {saving ? "…" : sourceLabel(source)}
        <span className="text-muted-foreground">▾</span>
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          {...dropdownMotion}
          className="absolute left-0 top-full z-50 mt-1 w-56 origin-top rounded-xl border border-border bg-popover/95 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.3)] backdrop-blur-sm"
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAddNew) save(query);
            }}
            placeholder="Поиск или новый источник…"
            className="mb-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-border/80"
          />
          <div className="max-h-56 overflow-y-auto">
            {canAddNew && (
              <button
                onClick={() => save(query)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-primary hover:bg-muted/60"
              >
                + Добавить «{query.trim()}»
              </button>
            )}
            {filtered.map((o) => {
              const isCurrent = sourceLabel(source) === o;
              return (
                <button
                  key={o}
                  onClick={() => save(o)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${isCurrent ? "bg-muted/40 text-foreground" : "text-foreground hover:bg-muted/60"}`}
                >
                  {o}
                  {isCurrent && <span className="ml-auto text-[11px] text-muted-foreground">✓</span>}
                </button>
              );
            })}
            {filtered.length === 0 && !canAddNew && (
              <div className="px-2.5 py-3 text-[13px] text-muted-foreground">Ничего не найдено</div>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
