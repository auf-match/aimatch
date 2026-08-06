"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
} from "@/lib/pipeline";
import { PrototypeShell } from "../_shell";
import { MotionDropdown } from "../_motion-dropdown";

// ── Демо 1: выбор источника (клик + поиск + добавить новый) ───────────
function SourcePickerDemo() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("Behance");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<string[]>([
    "Behance", "Dribbble", "Notion", "Figma", "LinkedIn", "Huntflow", "Личный сайт", "Реферал",
  ]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // подтягиваем реальные источники, если доступны
  useEffect(() => {
    fetch("/api/candidates/sources")
      .then((r) => r.json())
      .then((d) => Array.isArray(d.sources) && d.sources.length && setOptions(d.sources))
      .catch(() => {});
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = options.filter((o) => o.toLowerCase().includes(q));
  const canAdd = q.length > 0 && !options.some((o) => o.toLowerCase() === q);

  const pick = (v: string) => {
    setSource(v);
    if (!options.includes(v)) setOptions((p) => [...p, v]);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
      >
        <span className="text-muted-foreground">Источник:</span> {source}
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      <MotionDropdown open={open} className="w-56">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canAdd && pick(query.trim())}
          placeholder="Поиск или новый источник…"
          className="mb-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-border/80"
        />
        <div className="max-h-56 overflow-y-auto">
          {canAdd && (
            <button onClick={() => pick(query.trim())} className="flex w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-primary hover:bg-muted/60">
              + Добавить «{query.trim()}»
            </button>
          )}
          {filtered.map((o) => (
            <button
              key={o}
              onClick={() => pick(o)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${o === source ? "bg-muted/40" : "hover:bg-muted/60"}`}
            >
              {o}
              {o === source && <span className="ml-auto text-[11px] text-muted-foreground">✓</span>}
            </button>
          ))}
          {filtered.length === 0 && !canAdd && (
            <div className="px-2.5 py-3 text-[13px] text-muted-foreground">Ничего не найдено</div>
          )}
        </div>
      </MotionDropdown>
    </div>
  );
}

// ── Демо 2: перемещение по этапам (наведение) ─────────────────────────
function MoveStageDemo() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<(typeof PIPELINE_STAGE_ORDER)[number]>("DL_APPROVED");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div className="relative inline-flex" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] transition-colors hover:bg-muted/40">
        <span className="size-2 rounded-full" style={{ background: PIPELINE_STAGE_COLORS[stage] }} />
        {PIPELINE_STAGE_LABELS[stage]}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      <MotionDropdown open={open} className="w-60">
        <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Переместить на этап
        </div>
        {PIPELINE_STAGE_ORDER.filter((s) => s !== stage).map((s) => (
          <button
            key={s}
            onClick={() => { setStage(s); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-muted/60"
          >
            <span className="size-[7px] shrink-0 rounded-full" style={{ background: PIPELINE_STAGE_COLORS[s] }} />
            {PIPELINE_STAGE_LABELS[s]}
          </button>
        ))}
      </MotionDropdown>
    </div>
  );
}

export default function DropdownsPrototype() {
  return (
    <PrototypeShell wide>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Анимированные списки</h1>
        <p className="text-sm text-muted-foreground">
          Тот же стиль раскрытия (пружинная motion-анимация), применённый к уже существующим дропдаунам. Глобально ничего не менялось — это демо на реальных элементах.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Кейс 1 */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="mb-1 text-sm font-semibold">Выбор источника кандидата</p>
          <p className="mb-5 text-xs text-muted-foreground">Клик по бейджу → поиск, выбор из существующих, добавить новый.</p>
          <SourcePickerDemo />
        </div>

        {/* Кейс 2 */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="mb-1 text-sm font-semibold">Перемещение кандидата по этапам</p>
          <p className="mb-5 text-xs text-muted-foreground">Наведи на кнопку этапа → список этапов раскрывается анимированно.</p>
          <MoveStageDemo />
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Если стиль подходит — можно точечно подключить его к этим же контролам в реальном приложении, ничего больше не трогая.
      </p>
    </PrototypeShell>
  );
}
