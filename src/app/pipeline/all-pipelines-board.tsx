"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { dropdownMotion } from "@/lib/motion-dropdown";
import { useRouter } from "next/navigation";
import {
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  groupPipelineByStage,
  daysInStage,
  getPipelineActor,
} from "@/lib/pipeline";
import { ROLE_LABELS, GRADE_LABELS } from "@/lib/constants";
import type { PipelineStage } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────

interface PipelineCandidate { id: string; name: string; role: string; grade: string; }
interface PipelineVacancy { id: string; title: string; clientName: string | null; }

interface PipelineRow {
  candidateId: string;
  candidate: PipelineCandidate;
  vacancyId: string;
  vacancy: PipelineVacancy;
  stage: PipelineStage;
  score: number | null;
  lastTransitionAt: string;
}

interface VacancyOption { id: string; title: string; clientName: string | null; status: string; }

// ── Helpers ──────────────────────────────────────────────────────────

function scoreBadgeClasses(score: number): string {
  if (score >= 75) return "text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-400/10";
  if (score >= 50) return "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-400/10";
  return "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-400/10";
}
function formatDays(days: number): string {
  return days === 0 ? "сегодня" : `${days} дн.`;
}

// ── Move menu ────────────────────────────────────────────────────────

interface MoveMenuProps {
  row: PipelineRow;
  anchorRect: DOMRect;
  onMove: (stage: PipelineStage) => void;
  onOpenCandidate: () => void;
  onOpenVacancy: () => void;
  onClose: () => void;
}

function MoveMenu({ row, anchorRect, onMove, onOpenCandidate, onOpenVacancy, onClose }: MoveMenuProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const popupWidth = 240;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;
  if (typeof window !== "undefined") {
    if (left + popupWidth > window.innerWidth - 16) left = window.innerWidth - popupWidth - 16;
    if (top + 420 > window.innerHeight - 16) top = anchorRect.top - 420 - 8;
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <motion.div
        ref={popupRef}
        {...dropdownMotion}
        className="absolute origin-top rounded-xl border border-border bg-popover/95 shadow-[0_20px_60px_rgba(0,0,0,.4)] backdrop-blur-sm p-1.5"
        style={{ left, top, width: popupWidth }}
      >
        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {row.candidate.name}
        </div>
        <div className="px-2.5 pt-0.5 pb-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
          Переместить на этап
        </div>
        {PIPELINE_STAGE_ORDER.filter((s) => s !== row.stage).map((stage) => (
          <button
            key={stage}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
            onClick={() => { onMove(stage); onClose(); }}
          >
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: PIPELINE_STAGE_COLORS[stage] }} />
            {PIPELINE_STAGE_LABELS[stage]}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
          onClick={() => { onOpenCandidate(); onClose(); }}
        >
          <span className="text-muted-foreground">↗</span> Открыть карточку кандидата
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
          onClick={() => { onOpenVacancy(); onClose(); }}
        >
          <span className="text-muted-foreground">↗</span> Открыть вакансию
        </button>
      </motion.div>
    </div>
  );
}

// ── Candidate card ───────────────────────────────────────────────────

function CandidateCard({ row, onMenu }: { row: PipelineRow; onMenu: (row: PipelineRow, rect: DOMRect) => void }) {
  const days = daysInStage(new Date(row.lastTransitionAt), new Date());
  const isRejected = row.stage === "REJECTED";
  return (
    <div
      className={`rounded-lg border border-border bg-white dark:bg-zinc-900 cursor-pointer px-2.5 pt-2.5 pb-2 transition-colors hover:border-border/80 hover:bg-muted/30 ${isRejected ? "opacity-60" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onMenu(row, (e.currentTarget as HTMLElement).getBoundingClientRect());
      }}
    >
      <div className="text-[13px] font-medium truncate text-foreground mb-0.5">{row.candidate.name}</div>
      <div className="text-[11px] text-muted-foreground mb-0.5">
        {ROLE_LABELS[row.candidate.role] ?? row.candidate.role}
        {row.candidate.grade && <> · {GRADE_LABELS[row.candidate.grade] ?? row.candidate.grade}</>}
      </div>
      <div className="text-[11px] text-muted-foreground/70 truncate mb-1.5">
        {row.vacancy.title}{row.vacancy.clientName ? ` · ${row.vacancy.clientName}` : ""}
      </div>
      <div className="flex items-center gap-1.5">
        {row.score !== null && (
          <span className={`text-[11px] font-semibold rounded px-1.5 py-0.5 ${scoreBadgeClasses(row.score)}`}>
            {row.score}%
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">{formatDays(days)}</span>
      </div>
    </div>
  );
}

// ── Board column ─────────────────────────────────────────────────────

function BoardColumn({ stage, rows, onCardMenu }: { stage: PipelineStage; rows: PipelineRow[]; onCardMenu: (row: PipelineRow, rect: DOMRect) => void }) {
  return (
    <div className="w-[220px] shrink-0 rounded-xl border border-border bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PIPELINE_STAGE_COLORS[stage] }} />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.4px] text-muted-foreground flex-1 truncate">
          {PIPELINE_STAGE_LABELS[stage]}
        </span>
        <span className="text-[11px] text-muted-foreground/50 font-medium">{rows.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-2 min-h-[60px]">
        {rows.length === 0
          ? <div className="text-center text-[11px] text-muted-foreground/30 py-2">—</div>
          : rows.map((row) => <CandidateCard key={`${row.candidateId}::${row.vacancyId}`} row={row} onMenu={onCardMenu} />)}
      </div>
    </div>
  );
}

// ── Vacancy filter (мультиселект) ────────────────────────────────────

function VacancyFilter({
  options, selected, onToggle, onReset,
}: {
  options: VacancyOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = selected.size === 0 ? "все" : `выбрано ${selected.size}`;

  // Закрытие по клику вне дропдауна. Слушаем document, только пока открыт.
  // Клик по триггеру/панели (внутри ref) не закрывает — панель мультиселект,
  // в ней тыкают несколько вакансий подряд.
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

  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-zinc-900 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        Вакансия: {label} <span className="text-muted-foreground">▾</span>
      </button>
      <AnimatePresence>
      {open && (
        <motion.div
          {...dropdownMotion}
          className="absolute z-50 mt-1 max-h-[320px] w-[300px] overflow-y-auto rounded-xl border border-border bg-popover/95 shadow-[0_20px_60px_rgba(0,0,0,.3)] backdrop-blur-sm p-1.5"
        >
          <button
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60"
            onClick={() => { onReset(); }}
          >
            {selected.size === 0 ? "✓ " : ""}Все вакансии
          </button>
          <div className="my-1 h-px bg-border" />
          {options.map((v) => (
            <button
              key={v.id}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60"
              onClick={() => onToggle(v.id)}
            >
              <span className="w-4 shrink-0">{selected.has(v.id) ? "✓" : ""}</span>
              <span className="truncate">{v.title}{v.clientName ? ` · ${v.clientName}` : ""}</span>
            </button>
          ))}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function AllPipelinesBoard() {
  const router = useRouter();
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [vacancies, setVacancies] = useState<VacancyOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [menuState, setMenuState] = useState<{ row: PipelineRow; rect: DOMRect } | null>(null);

  const qs = useMemo(() => {
    if (selected.size === 0) return "";
    return `?vacancyIds=${[...selected].join(",")}`;
  }, [selected]);

  useEffect(() => {
    let active = true;
    fetch(`/api/vacancies`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const list: VacancyOption[] = (data.data ?? [])
          .filter((v: VacancyOption) => v.status === "OPEN")
          .map((v: VacancyOption) => ({ id: v.id, title: v.title, clientName: v.clientName, status: v.status }));
        setVacancies(list);
      })
      .catch((err) => { if (active) console.error("vacancies fetch error:", err); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/pipeline${qs}`)
      .then((r) => r.json())
      .then((data: PipelineRow[]) => { if (active) setRows(data); })
      .catch((err) => { if (active) console.error("pipeline fetch error:", err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [qs]);

  const handleMove = async (targetRow: PipelineRow, toStage: PipelineStage) => {
    const actor = getPipelineActor();
    setRows((prev) =>
      prev.map((r) =>
        r.candidateId === targetRow.candidateId && r.vacancyId === targetRow.vacancyId
          ? { ...r, stage: toStage, lastTransitionAt: new Date().toISOString() }
          : r,
      ),
    );
    const revert = async () => {
      const fresh = await fetch(`/api/pipeline${qs}`);
      const data: PipelineRow[] = await fresh.json();
      setRows(data);
    };
    try {
      const res = await fetch(
        `/api/vacancies/${targetRow.vacancyId}/pipeline/${targetRow.candidateId}/move`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStage, actor }) },
      );
      if (!res.ok) { console.error("Move failed, reverting"); await revert(); }
    } catch (err) {
      console.error("Move error:", err); await revert();
    }
  };

  const grouped = groupPipelineByStage(rows);
  const isEmpty = rows.length === 0;

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <VacancyFilter
          options={vacancies}
          selected={selected}
          onToggle={toggle}
          onReset={() => setSelected(new Set())}
        />
        <span className="text-[13px] text-muted-foreground">{rows.length} кандидатов в воронке</span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Загрузка воронки...</div>
      ) : (
        <div className="relative">
          {isEmpty && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none z-10">
              Пока никто не в воронке
            </p>
          )}
          <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
            <div className={`flex gap-2.5 min-w-max ${isEmpty ? "opacity-30" : ""}`}>
              {PIPELINE_STAGE_ORDER.map((stage) => (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  rows={grouped[stage]}
                  onCardMenu={(row, rect) => setMenuState({ row, rect })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {menuState && (
        <MoveMenu
          row={menuState.row}
          anchorRect={menuState.rect}
          onMove={(toStage) => handleMove(menuState.row, toStage)}
          onOpenCandidate={() => router.push(`/candidates/${menuState.row.candidateId}`)}
          onOpenVacancy={() => router.push(`/vacancies/${menuState.row.vacancyId}`)}
          onClose={() => setMenuState(null)}
        />
      )}
    </div>
  );
}
