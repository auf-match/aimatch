"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
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

interface PipelineCandidate {
  id: string;
  name: string;
  role: string;
  grade: string;
}

interface PipelineRow {
  candidateId: string;
  candidate: PipelineCandidate;
  stage: PipelineStage;
  score: number | null;
  lastTransitionAt: string;
}

interface CandidateSearchResult {
  id: string;
  name: string;
  role: string;
  grade: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function scoreBadgeClasses(score: number): string {
  if (score >= 75) return "text-emerald-400 bg-emerald-400/10";
  if (score >= 50) return "text-amber-400 bg-amber-400/10";
  return "text-red-400 bg-red-400/10";
}

function formatDays(days: number): string {
  if (days === 0) return "сегодня";
  return `${days} дн.`;
}

// ── Move menu ────────────────────────────────────────────────────────

interface MoveMenuProps {
  row: PipelineRow;
  anchorRect: DOMRect;
  onMove: (stage: PipelineStage) => void;
  onOpenCard: () => void;
  onClose: () => void;
}

function MoveMenu({ row, anchorRect, onMove, onOpenCard, onClose }: MoveMenuProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Position the popup below the card, constrained to viewport
  const popupWidth = 240;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;
  if (typeof window !== "undefined") {
    if (left + popupWidth > window.innerWidth - 16) left = window.innerWidth - popupWidth - 16;
    if (top + 400 > window.innerHeight - 16) top = anchorRect.top - 400 - 8;
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <motion.div
        ref={popupRef}
        {...dropdownMotion}
        className="absolute origin-top rounded-xl border border-border bg-popover/95 shadow-[0_20px_60px_rgba(0,0,0,.4)] backdrop-blur-sm p-1.5"
        style={{ left, top, width: popupWidth }}
      >
        {/* Candidate name header */}
        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {row.candidate.name}
        </div>
        {/* Section label */}
        <div className="px-2.5 pt-0.5 pb-1 text-[11px] text-muted-foreground/60 uppercase tracking-wider">
          Переместить на этап
        </div>
        {PIPELINE_STAGE_ORDER.filter((s) => s !== row.stage).map((stage) => (
          <button
            key={stage}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
            onClick={() => {
              onMove(stage);
              onClose();
            }}
          >
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: PIPELINE_STAGE_COLORS[stage] }}
            />
            {PIPELINE_STAGE_LABELS[stage]}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-muted/60 transition-colors"
          onClick={() => {
            onOpenCard();
            onClose();
          }}
        >
          <span className="text-muted-foreground">↗</span>
          Открыть карточку
        </button>
      </motion.div>
    </div>
  );
}

// ── Candidate card ───────────────────────────────────────────────────

interface CandidateCardProps {
  row: PipelineRow;
  onMenu: (row: PipelineRow, rect: DOMRect) => void;
  scoring: boolean;
  scoreFailed: boolean;
  onRetryScore: (candidateId: string) => void;
}

function CandidateCard({ row, onMenu, scoring, scoreFailed, onRetryScore }: CandidateCardProps) {
  const days = daysInStage(new Date(row.lastTransitionAt), new Date());
  const isRejected = row.stage === "REJECTED";

  return (
    <div
      className={`rounded-lg border border-border bg-card cursor-pointer px-2.5 pt-2.5 pb-2 transition-colors hover:border-border/80 hover:bg-muted/30 ${isRejected ? "opacity-60" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onMenu(row, rect);
      }}
    >
      <div className="text-[13px] font-medium truncate text-foreground mb-0.5">
        {row.candidate.name}
      </div>
      <div className="text-[11px] text-muted-foreground mb-1.5">
        {ROLE_LABELS[row.candidate.role] ?? row.candidate.role}
        {row.candidate.grade && (
          <> · {GRADE_LABELS[row.candidate.grade] ?? row.candidate.grade}</>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {row.score !== null ? (
          <span
            className={`text-[11px] font-semibold rounded px-1.5 py-0.5 ${scoreBadgeClasses(row.score)}`}
          >
            {row.score}%
          </span>
        ) : scoring ? (
          <span className="text-[11px] font-medium rounded px-1.5 py-0.5 bg-muted text-muted-foreground animate-pulse">
            анализ…
          </span>
        ) : scoreFailed ? (
          <button
            className="text-[11px] font-medium rounded px-1.5 py-0.5 bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onRetryScore(row.candidateId);
            }}
          >
            ⚠ оценить снова
          </button>
        ) : null}
        <span className="text-[11px] text-muted-foreground ml-auto">{formatDays(days)}</span>
      </div>
    </div>
  );
}

// ── Board column ─────────────────────────────────────────────────────

interface ColumnProps {
  stage: PipelineStage;
  rows: PipelineRow[];
  onCardMenu: (row: PipelineRow, rect: DOMRect) => void;
  scoringIds: Set<string>;
  failedIds: Set<string>;
  onRetryScore: (candidateId: string) => void;
}

function BoardColumn({ stage, rows, onCardMenu, scoringIds, failedIds, onRetryScore }: ColumnProps) {
  const color = PIPELINE_STAGE_COLORS[stage];
  const label = PIPELINE_STAGE_LABELS[stage];

  return (
    <div className="w-[220px] shrink-0 rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.4px] text-muted-foreground flex-1 truncate">
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground/50 font-medium">
          {rows.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-1.5 p-2 min-h-[60px]">
        {rows.length === 0 ? (
          <div className="text-center text-[11px] text-muted-foreground/30 py-2">—</div>
        ) : (
          rows.map((row) => (
            <CandidateCard
              key={row.candidateId}
              row={row}
              onMenu={onCardMenu}
              scoring={scoringIds.has(row.candidateId)}
              scoreFailed={failedIds.has(row.candidateId)}
              onRetryScore={onRetryScore}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Candidate picker (ручное добавление) ─────────────────────────────

interface CandidatePickerProps {
  anchorRect: DOMRect;
  existingIds: Set<string>;
  onPick: (candidateId: string) => void;
  onClose: () => void;
}

function CandidatePicker({ anchorRect, existingIds, onPick, onClose }: CandidatePickerProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CandidateSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const popupWidth = 320;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;
  if (typeof window !== "undefined") {
    if (left + popupWidth > window.innerWidth - 16) left = window.innerWidth - popupWidth - 16;
    if (top + 420 > window.innerHeight - 16) top = Math.max(16, anchorRect.top - 420 - 8);
  }

  // Автофокус на поле поиска
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Дебаунс-поиск по имени; пустой запрос — последние кандидаты
  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(() => {
      const q = query.trim();
      const url = q
        ? `/api/candidates?limit=20&search=${encodeURIComponent(q)}`
        : `/api/candidates?limit=20`;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          if (!active) return;
          const list: CandidateSearchResult[] = (data.data ?? []).map(
            (c: { id: string; name: string; role: string; grade: string }) => ({
              id: c.id,
              name: c.name,
              role: c.role,
              grade: c.grade,
            }),
          );
          setResults(list);
        })
        .catch((err) => { console.error("candidate search failed:", err); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [query]);

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
        className="absolute flex flex-col origin-top rounded-xl border border-border bg-popover/95 shadow-[0_20px_60px_rgba(0,0,0,.4)] backdrop-blur-sm p-1.5"
        style={{ left, top, width: popupWidth, maxHeight: 420 }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          placeholder="Поиск по имени…"
          className="mb-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-border/80"
        />
        <div className="overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="px-2.5 py-3 text-[13px] text-muted-foreground">Загрузка…</div>
          ) : results.length === 0 ? (
            <div className="px-2.5 py-3 text-[13px] text-muted-foreground">Никого не найдено</div>
          ) : (
            results.map((c) => {
              const already = existingIds.has(c.id);
              return (
                <button
                  key={c.id}
                  disabled={already}
                  className={`flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors ${already ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60"}`}
                  onClick={() => { if (!already) { onPick(c.id); onClose(); } }}
                >
                  <span className="text-[13px] text-foreground truncate">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {ROLE_LABELS[c.role] ?? c.role}
                    {c.grade && ` · ${GRADE_LABELS[c.grade] ?? c.grade}`}
                    {already && " · уже в воронке"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function PipelineBoard({ vacancyId }: { vacancyId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuState, setMenuState] = useState<{
    row: PipelineRow;
    rect: DOMRect;
  } | null>(null);
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
  const [scoringIds, setScoringIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/vacancies/${vacancyId}/pipeline`)
      .then((r) => r.json())
      .then((data: PipelineRow[]) => { if (active) setRows(data); })
      .catch((err) => { if (active) console.error("board fetch error:", err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vacancyId]);

  const handleMove = async (targetRow: PipelineRow, toStage: PipelineStage) => {
    const actor = getPipelineActor();

    // Optimistic update
    setRows((prev) =>
      prev.map((r) =>
        r.candidateId === targetRow.candidateId
          ? { ...r, stage: toStage, lastTransitionAt: new Date().toISOString() }
          : r
      )
    );

    try {
      const res = await fetch(
        `/api/vacancies/${vacancyId}/pipeline/${targetRow.candidateId}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStage, actor }),
        }
      );
      if (!res.ok) {
        console.error("Move failed, re-fetching pipeline");
        // Revert by refetching
        const fresh = await fetch(`/api/vacancies/${vacancyId}/pipeline`);
        const data: PipelineRow[] = await fresh.json();
        setRows(data);
      }
    } catch (err) {
      console.error("Move error:", err);
      // Revert
      const fresh = await fetch(`/api/vacancies/${vacancyId}/pipeline`);
      const data: PipelineRow[] = await fresh.json();
      setRows(data);
    }
  };

  const refetchBoard = async () => {
    const fresh = await fetch(`/api/vacancies/${vacancyId}/pipeline`);
    const data: PipelineRow[] = await fresh.json();
    setRows(data);
  };

  // AI-скоринг: насколько кандидат подходит под вакансию (создаёт DetailedScore)
  const scoreCandidate = async (candidateId: string) => {
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(candidateId);
      return next;
    });
    setScoringIds((prev) => new Set(prev).add(candidateId));
    try {
      const res = await fetch(
        `/api/vacancies/${vacancyId}/score/${candidateId}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`score ${res.status}`);
      await refetchBoard();
    } catch (err) {
      console.error("Scoring error:", err);
      setFailedIds((prev) => new Set(prev).add(candidateId));
    } finally {
      setScoringIds((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  };

  // Ручное добавление кандидата в воронку (в обход AI-скрининга) + авто-скоринг
  const handleAdd = async (candidateId: string) => {
    const actor = getPipelineActor();
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, actor }),
      });
      if (res.ok) {
        await refetchBoard();
        // Оценить соответствие вакансии (не блокирует появление карточки)
        void scoreCandidate(candidateId);
      } else {
        console.error("Manual add failed:", res.status);
      }
    } catch (err) {
      console.error("Manual add error:", err);
    }
  };

  const grouped = groupPipelineByStage(rows);
  const isEmpty = rows.length === 0;
  const existingIds = new Set(rows.map((r) => r.candidateId));

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">Загрузка воронки...</div>
    );
  }

  return (
    <div className="relative">
      {/* Header: ручное добавление */}
      <div className="flex items-center justify-end mb-2.5">
        <button
          className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors hover:border-border/70"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setPickerRect(rect);
          }}
        >
          + Добавить кандидата вручную
        </button>
      </div>

      {isEmpty && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none z-10">
          Пока никого в воронке
        </p>
      )}

      {/* Horizontal scroll wrapper */}
      <div
        className="overflow-x-auto pb-2"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--border)) transparent",
        }}
      >
        <div className={`flex gap-2.5 min-w-max ${isEmpty ? "opacity-30" : ""}`}>
          {PIPELINE_STAGE_ORDER.map((stage) => (
            <BoardColumn
              key={stage}
              stage={stage}
              rows={grouped[stage]}
              onCardMenu={(row, rect) => setMenuState({ row, rect })}
              scoringIds={scoringIds}
              failedIds={failedIds}
              onRetryScore={scoreCandidate}
            />
          ))}
        </div>
      </div>

      {/* Move menu portal */}
      {menuState && (
        <MoveMenu
          row={menuState.row}
          anchorRect={menuState.rect}
          onMove={(toStage) => handleMove(menuState.row, toStage)}
          onOpenCard={() => {
            router.push(`/candidates/${menuState.row.candidateId}`);
          }}
          onClose={() => setMenuState(null)}
        />
      )}

      {/* Candidate picker (ручное добавление) */}
      {pickerRect && (
        <CandidatePicker
          anchorRect={pickerRect}
          existingIds={existingIds}
          onPick={handleAdd}
          onClose={() => setPickerRect(null)}
        />
      )}
    </div>
  );
}
