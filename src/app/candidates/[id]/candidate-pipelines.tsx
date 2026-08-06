"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { dropdownMotion } from "@/lib/motion-dropdown";
import { Card, CardContent } from "@/components/ui/card";
import {
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  TRIAGE_STATUS_ORDER,
  TRIAGE_STATUS_LABELS,
  TRIAGE_STATUS_COLORS,
  daysInStage,
  getPipelineActor,
} from "@/lib/pipeline";
import { GRADE_LABELS } from "@/lib/constants";
import type { PipelineStage, TriageStatus } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────

interface StageTransition {
  id: string;
  fromStage: PipelineStage | null;
  toStage: PipelineStage;
  actor: string;
  note: string | null;
  createdAt: string;
}

interface VacancyPipelineEntry {
  id: string;
  stage: PipelineStage;
  notes: string | null;
  candidateId: string;
  vacancyId: string;
  createdAt: string;
  updatedAt: string;
  score: number | null;
  vacancy: {
    id: string;
    title: string;
    clientName: string | null;
    grade: string;
  };
  transitions: StageTransition[];
}

function scoreBadgeClasses(score: number): string {
  if (score >= 75) return "text-emerald-400 bg-emerald-400/10";
  if (score >= 50) return "text-amber-400 bg-amber-400/10";
  return "text-red-400 bg-red-400/10";
}

interface VacancyOption {
  id: string;
  title: string;
  clientName: string | null;
  status: string;
  grade: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDaysAgo(createdAt: string): string {
  const days = daysInStage(new Date(createdAt), new Date());
  if (days === 0) return "сегодня";
  if (days === 1) return "1 дн. назад";
  return `${days} дн. назад`;
}

// ── Stage move menu ──────────────────────────────────────────────────

interface MoveMenuProps {
  anchorRect: DOMRect;
  currentStage: PipelineStage;
  onMove: (stage: PipelineStage) => void;
  onClose: () => void;
}

function MoveMenu({ anchorRect, currentStage, onMove, onClose }: MoveMenuProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const popupWidth = 240;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;
  if (typeof window !== "undefined") {
    if (left + popupWidth > window.innerWidth - 16)
      left = window.innerWidth - popupWidth - 16;
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
        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Переместить на этап
        </div>
        {PIPELINE_STAGE_ORDER.filter((s) => s !== currentStage).map((stage) => (
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
      </motion.div>
    </div>
  );
}

// ── Vacancy picker ───────────────────────────────────────────────────

interface VacancyPickerProps {
  anchorRect: DOMRect;
  onPick: (vacancyId: string) => void;
  onClose: () => void;
  existingVacancyIds: Set<string>;
}

function VacancyPicker({
  anchorRect,
  onPick,
  onClose,
  existingVacancyIds,
}: VacancyPickerProps) {
  const [vacancies, setVacancies] = useState<VacancyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);

  const popupWidth = 280;
  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;
  if (typeof window !== "undefined") {
    if (left + popupWidth > window.innerWidth - 16)
      left = window.innerWidth - popupWidth - 16;
    if (top + 400 > window.innerHeight - 16) top = anchorRect.top - 400 - 8;
  }

  useEffect(() => {
    let active = true;
    fetch("/api/vacancies?limit=100&status=OPEN")
      .then((r) => r.json())
      .then((data) => {
        if (active) {
          const list: VacancyOption[] = (data.data ?? []).map(
            (v: { id: string; title: string; clientName: string | null; status: string; grade: string }) => ({
              id: v.id,
              title: v.title,
              clientName: v.clientName,
              status: v.status,
              grade: v.grade,
            }),
          );
          setVacancies(list);
        }
      })
      .catch((err) => { console.error("vacancies fetch failed:", err); })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
        className="absolute origin-top rounded-xl border border-border bg-popover/95 shadow-[0_20px_60px_rgba(0,0,0,.4)] backdrop-blur-sm p-1.5 max-h-[320px] overflow-y-auto"
        style={{ left, top, width: popupWidth }}
      >
        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 bg-popover/95 backdrop-blur-sm">
          Выбрать вакансию
        </div>
        {loading ? (
          <div className="px-2.5 py-3 text-[13px] text-muted-foreground">
            Загрузка...
          </div>
        ) : vacancies.length === 0 ? (
          <div className="px-2.5 py-3 text-[13px] text-muted-foreground">
            Нет открытых вакансий
          </div>
        ) : (
          vacancies.map((v) => {
            const already = existingVacancyIds.has(v.id);
            return (
              <button
                key={v.id}
                disabled={already}
                className={`flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors ${already ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60"}`}
                onClick={() => {
                  if (!already) {
                    onPick(v.id);
                    onClose();
                  }
                }}
              >
                <span className="text-[13px] text-foreground truncate">
                  {v.title}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {v.clientName && `${v.clientName} · `}
                  {GRADE_LABELS[v.grade] ?? v.grade}
                  {already && " · уже в воронке"}
                </span>
              </button>
            );
          })
        )}
      </motion.div>
    </div>
  );
}

// ── Triage status chip ────────────────────────────────────────────────

interface TriageChipProps {
  status: TriageStatus;
}

function TriageChip({ status }: TriageChipProps) {
  const color = TRIAGE_STATUS_COLORS[status] ?? "#3f3f46";
  const label = TRIAGE_STATUS_LABELS[status] ?? status;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{
        background: `${color}20`,
        color: color,
      }}
    >
      <span
        className="h-[6px] w-[6px] shrink-0 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function CandidatePipelines({
  candidateId,
  initialTriageStatus,
}: {
  candidateId: string;
  initialTriageStatus: string;
}) {
  // ── Triage state ──
  const [triageStatus, setTriageStatus] = useState<TriageStatus>(
    initialTriageStatus as TriageStatus,
  );
  const [triageMenuOpen, setTriageMenuOpen] = useState(false);
  const [triageAnchorRect, setTriageAnchorRect] = useState<DOMRect | null>(null);
  const [triageUpdating, setTriageUpdating] = useState(false);
  const triagePopupRef = useRef<HTMLDivElement>(null);

  // ── Pipelines state ──
  const [pipelines, setPipelines] = useState<VacancyPipelineEntry[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(true);
  const [moveMenu, setMoveMenu] = useState<{
    vacancyId: string;
    currentStage: PipelineStage;
    rect: DOMRect;
  } | null>(null);
  const [pickerMenu, setPickerMenu] = useState<{ rect: DOMRect } | null>(null);
  const [scoringVacancyIds, setScoringVacancyIds] = useState<Set<string>>(new Set());
  const [failedVacancyIds, setFailedVacancyIds] = useState<Set<string>>(new Set());

  // ── Fetch pipelines ──
  const fetchPipelines = async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/pipelines`);
      if (!res.ok) return;
      const data: VacancyPipelineEntry[] = await res.json();
      setPipelines(data);
    } catch {
      // silent
    } finally {
      setPipelinesLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setPipelinesLoading(true);
    fetch(`/api/candidates/${candidateId}/pipelines`)
      .then((r) => r.json())
      .then((data: VacancyPipelineEntry[]) => {
        if (active) setPipelines(data);
      })
      .catch((err) => { console.error("pipelines fetch failed:", err); })
      .finally(() => {
        if (active) setPipelinesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [candidateId]);

  // ── Triage change ──
  const handleTriageChange = async (newStatus: TriageStatus) => {
    const actor = getPipelineActor();
    setTriageUpdating(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/triage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triageStatus: newStatus, actor }),
      });
      if (res.ok) {
        setTriageStatus(newStatus);
      }
    } catch (err) {
      console.error("triage change failed:", err);
    } finally {
      setTriageUpdating(false);
      setTriageMenuOpen(false);
      setTriageAnchorRect(null);
    }
  };

  // ── AI-скоринг соответствия вакансии (создаёт DetailedScore) ──
  const scoreVacancy = async (vacancyId: string) => {
    setFailedVacancyIds((prev) => {
      const next = new Set(prev);
      next.delete(vacancyId);
      return next;
    });
    setScoringVacancyIds((prev) => new Set(prev).add(vacancyId));
    try {
      const res = await fetch(
        `/api/vacancies/${vacancyId}/score/${candidateId}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`score ${res.status}`);
      await fetchPipelines();
    } catch (err) {
      console.error("scoring failed:", err);
      setFailedVacancyIds((prev) => new Set(prev).add(vacancyId));
    } finally {
      setScoringVacancyIds((prev) => {
        const next = new Set(prev);
        next.delete(vacancyId);
        return next;
      });
    }
  };

  // ── Approve to vacancy + авто-скоринг ──
  const handleAddToVacancy = async (vacancyId: string) => {
    const actor = getPipelineActor();
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, actor }),
      });
      if (res.ok) {
        await fetchPipelines();
        // Оценить соответствие (не блокирует появление записи)
        void scoreVacancy(vacancyId);
      }
    } catch (err) {
      console.error("add to vacancy failed:", err);
    }
  };

  // ── Move stage ──
  const handleMove = async (vacancyId: string, toStage: PipelineStage) => {
    const actor = getPipelineActor();
    // Optimistic update
    setPipelines((prev) =>
      prev.map((p) => {
        if (p.vacancyId !== vacancyId) return p;
        const newTransition: StageTransition = {
          id: `optimistic-${Date.now()}`,
          fromStage: p.stage,
          toStage,
          actor,
          note: null,
          createdAt: new Date().toISOString(),
        };
        return {
          ...p,
          stage: toStage,
          transitions: [newTransition, ...p.transitions],
        };
      }),
    );
    try {
      const res = await fetch(
        `/api/vacancies/${vacancyId}/pipeline/${candidateId}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStage, actor }),
        },
      );
      if (!res.ok) {
        // revert
        await fetchPipelines();
      }
    } catch {
      await fetchPipelines();
    }
  };

  const existingVacancyIds = new Set(pipelines.map((p) => p.vacancyId));

  return (
    <div className="space-y-3">
      {/* ── Block A: Triage ── */}
      <Card>
        <CardContent className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Триаж в базе
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <TriageChip status={triageStatus} />
            <div className="relative">
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
                disabled={triageUpdating}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTriageAnchorRect(rect);
                  setTriageMenuOpen((open) => !open);
                }}
              >
                {triageUpdating ? "..." : "▾ сменить"}
              </button>
            </div>
          </div>

          {/* Triage dropdown */}
          {triageMenuOpen && triageAnchorRect && (
            <div
              className="fixed inset-0 z-50"
              onMouseDown={(e) => {
                if (
                  triagePopupRef.current &&
                  !triagePopupRef.current.contains(e.target as Node)
                ) {
                  setTriageMenuOpen(false);
                }
              }}
            >
              <motion.div
                ref={triagePopupRef}
                {...dropdownMotion}
                className="absolute origin-top rounded-xl border border-border bg-popover/95 shadow-[0_20px_60px_rgba(0,0,0,.4)] backdrop-blur-sm p-1.5"
                style={{
                  left: triageAnchorRect.left,
                  top: triageAnchorRect.bottom + 8,
                  width: 220,
                }}
              >
                <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Сменить триаж
                </div>
                {TRIAGE_STATUS_ORDER.map((status) => {
                  const color = TRIAGE_STATUS_COLORS[status];
                  const label = TRIAGE_STATUS_LABELS[status];
                  const isCurrent = status === triageStatus;
                  return (
                    <button
                      key={status}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${isCurrent ? "text-foreground bg-muted/40" : "text-foreground hover:bg-muted/60"}`}
                      onClick={() => handleTriageChange(status)}
                    >
                      <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      {label}
                      {isCurrent && (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </motion.div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Block B: Vacancies in progress ── */}
      <Card>
        <CardContent className="p-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <span className="text-[14px] font-semibold tracking-tight">
              Вакансии в работе
            </span>
            <button
              className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors hover:border-border/70"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setPickerMenu({ rect });
              }}
            >
              + Добавить в вакансию
            </button>
          </div>

          {/* List */}
          {pipelinesLoading ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">
              Загрузка...
            </div>
          ) : pipelines.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              Пока ни в одной воронке
            </div>
          ) : (
            pipelines.map((pipeline) => {
              const stageColor = PIPELINE_STAGE_COLORS[pipeline.stage];
              const stageLabel = PIPELINE_STAGE_LABELS[pipeline.stage];
              const vac = pipeline.vacancy;
              return (
                <div
                  key={pipeline.id}
                  className="px-5 py-4 border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Vacancy row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-foreground truncate">
                        {vac.title}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5">
                        {vac.clientName && `${vac.clientName} · `}
                        {GRADE_LABELS[vac.grade] ?? vac.grade}
                      </p>
                      {/* Fit score */}
                      <div className="mt-1.5">
                        {pipeline.score !== null ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded px-1.5 py-0.5 ${scoreBadgeClasses(pipeline.score)}`}
                          >
                            {pipeline.score}% соответствие
                          </span>
                        ) : scoringVacancyIds.has(pipeline.vacancyId) ? (
                          <span className="inline-flex text-[11px] font-medium rounded px-1.5 py-0.5 bg-muted text-muted-foreground animate-pulse">
                            анализ соответствия…
                          </span>
                        ) : failedVacancyIds.has(pipeline.vacancyId) ? (
                          <button
                            className="inline-flex text-[11px] font-medium rounded px-1.5 py-0.5 bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
                            onClick={() => scoreVacancy(pipeline.vacancyId)}
                          >
                            ⚠ оценить снова
                          </button>
                        ) : (
                          <button
                            className="inline-flex text-[11px] text-muted-foreground hover:text-foreground border border-border/60 hover:border-border rounded px-1.5 py-0.5 transition-colors"
                            onClick={() => scoreVacancy(pipeline.vacancyId)}
                          >
                            Оценить соответствие
                          </button>
                        )}
                      </div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold shrink-0 ml-3"
                      style={{
                        background: `${stageColor}18`,
                        color: stageColor,
                      }}
                    >
                      <span
                        className="h-[6px] w-[6px] shrink-0 rounded-full"
                        style={{ background: stageColor }}
                      />
                      {stageLabel}
                    </span>
                  </div>

                  {/* History timeline */}
                  {pipeline.transitions.length > 0 && (
                    <div className="flex flex-col gap-0 mt-2 mb-3">
                      {pipeline.transitions.map((t, i) => {
                        const tColor = PIPELINE_STAGE_COLORS[t.toStage];
                        const isLast = i === pipeline.transitions.length - 1;
                        return (
                          <div
                            key={t.id}
                            className="flex gap-2.5 relative pb-2.5 last:pb-0"
                          >
                            {/* vertical line */}
                            {!isLast && (
                              <div
                                className="absolute left-[5px] top-[14px] bottom-0 w-px bg-border"
                              />
                            )}
                            <div
                              className="h-[11px] w-[11px] rounded-full shrink-0 mt-[3px] border-2"
                              style={{
                                background: tColor,
                                borderColor: "hsl(var(--background))",
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-medium text-foreground/80">
                                {PIPELINE_STAGE_LABELS[t.toStage]}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {t.actor} · {formatDaysAgo(t.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Move button */}
                  <button
                    className="mt-1 text-[12px] text-muted-foreground hover:text-foreground border border-border/60 hover:border-border rounded-md px-2.5 py-1 transition-colors"
                    onClick={(e) => {
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      setMoveMenu({
                        vacancyId: pipeline.vacancyId,
                        currentStage: pipeline.stage,
                        rect,
                      });
                    }}
                  >
                    Переместить этап ↓
                  </button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Stage move menu */}
      {moveMenu && (
        <MoveMenu
          anchorRect={moveMenu.rect}
          currentStage={moveMenu.currentStage}
          onMove={(toStage) => handleMove(moveMenu.vacancyId, toStage)}
          onClose={() => setMoveMenu(null)}
        />
      )}

      {/* Vacancy picker */}
      {pickerMenu && (
        <VacancyPicker
          anchorRect={pickerMenu.rect}
          onPick={handleAddToVacancy}
          onClose={() => setPickerMenu(null)}
          existingVacancyIds={existingVacancyIds}
        />
      )}
    </div>
  );
}
