"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { dropdownMotion } from "@/lib/motion-dropdown";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  ROLE_LABELS,
  GRADE_LABELS,
  VACANCY_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  WORK_FORMAT_LABELS,
} from "@/lib/constants";
import { PIPELINE_STAGE_LABELS, getPipelineActor } from "@/lib/pipeline";
import { isStaleScore } from "@/lib/vacancy-update";
import { buildVacancyPortrait, riskyPortraitSections } from "@/lib/vacancy-portrait";
import { toPlainText } from "@/lib/portrait-plain";
import { RangeSlider } from "@/components/ui/range-slider";
import { ConfettiBurst } from "@/components/ui/confetti-burst";
import PipelineBoard from "./pipeline-board";
import VacancyUpdates from "./vacancy-updates";
import InterviewInsights from "./interview-insights";

// ── Types ───────────────────────────────────────────────────────────

interface MatchResultCandidate {
  id: string;
  name: string;
  role: string;
  grade: string;
  aiSummary?: string | null;
  portfolioLinks: string[];
  telegramContact?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
}

interface CriterionScore {
  criterion: string;
  score: number;
  weight: number;
  type?: string;
  explanation: string;
}

type FeedbackRating = "GOOD" | "BAD" | "NEUTRAL";

interface MatchResult {
  id: string;
  createdAt: string;
  overallScore: number;
  matchExplanation: string;
  strengthsForVacancy: string[];
  gaps: string[];
  clarificationQuestions: string[];
  clarificationMessage: string | null;
  criteriaScores: CriterionScore[];
  candidate: MatchResultCandidate;
  feedbackRating: FeedbackRating | null;
  humanFeedback: string | null;
}

interface PipelineEntry {
  candidateId: string;
  stage: string;
  candidate: { id: string; name: string; role: string; grade: string };
}

interface ScoringCriterion {
  criterion: string;
  weight: number;
  type: "required" | "nice_to_have" | "stop_factor";
}

interface EditDraft {
  title: string;
  status: string;
  clientName: string;
  clientLead: string;
  productDescription: string;
  reasonForHiring: string;
  role: string;
  grade: string;
  designersNeeded: number;
  employmentType: string;
  workFormat: string;
  location: string;
  timezone: string;
  salaryRange: string;
  desiredStartDate: string;
  duration: string;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  needsInternational: boolean;
  specialCompetencies: string[];
  redFlags: string[];
  portfolioReferences: string[];
  teamComposition: string;
  decisionMaker: string;
  hiringStages: number | null;
  testTask: string;
  scoringCriteria: ScoringCriterion[];
  clientNotes: string;
  internalNotes: string;
}

interface VacancyDetail {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  clientLead: string | null;
  productDescription: string | null;
  reasonForHiring: string | null;
  role: string;
  grade: string;
  designersNeeded: number;
  employmentType: string;
  workFormat: string;
  location: string | null;
  timezone: string | null;
  salaryRange: string | null;
  desiredStartDate: string | null;
  duration: string | null;
  keyTasks: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  preferredDomains: string[];
  requiredTools: string[];
  needsInternational: boolean;
  specialCompetencies: string[];
  redFlags: string[];
  portfolioReferences: string[];
  teamComposition: string | null;
  decisionMaker: string | null;
  hiringStages: number | null;
  testTask: string | null;
  scoringCriteria: ScoringCriterion[] | null;
  clientNotes: string | null;
  internalNotes: string | null;
  matchResults: MatchResult[];
  pipelines: PipelineEntry[];
  _count: { matchResults: number; pipelines: number };
  createdAt: string;
  criteriaUpdatedAt: string | null;
}

// ── Score helpers ───────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  if (score >= 30) return "bg-orange-500";
  return "bg-red-500";
}

function scoreBadgeClasses(score: number) {
  if (score >= 75) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  if (score >= 30) return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

function scoreLabel(score: number) {
  if (score >= 85) return "Отличный";
  if (score >= 70) return "Хороший";
  if (score >= 50) return "Средний";
  if (score >= 30) return "Слабый";
  return "Не подходит";
}

// suppress unused warning — scoreColor is kept for future use
void scoreColor;

const CRITERION_TYPE_LABELS: Record<string, string> = {
  required: "Обязательный",
  nice_to_have: "Желательный",
  stop_factor: "Стоп-фактор",
};

// ── Page ────────────────────────────────────────────────────────────

export default function VacancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [pipelineIds, setPipelineIds] = useState<Map<string, string>>(new Map());
  const [approveLoading, setApproveLoading] = useState<string | null>(null);
  // Кандидат, которого только что одобрили, и метка запуска вспышки.
  // Конфетти летит по нажатию — отклик должен быть мгновенным, а не ждать
  // ответа сервера.
  const [celebrate, setCelebrate] = useState<{ id: string; at: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [matchingDone, setMatchingDone] = useState(false);
  const [softening, setSoftening] = useState(false);
  const [regenning, setRegenning] = useState(false);
  const [regenDone, setRegenDone] = useState(false);
  const [generatingCriteria, setGeneratingCriteria] = useState(false);
  const [recruiterName, setRecruiterName] = useState("Лина");
  const [softenChanges, setSoftenChanges] = useState<{ description: string }[] | null>(null);
  const [softenMessage, setSoftenMessage] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rescoring, setRescoring] = useState(false);

  // Поисковое задание для внешнего агентства
  const [portraitOpen, setPortraitOpen] = useState(false);
  const [portraitText, setPortraitText] = useState("");
  const [portraitCopied, setPortraitCopied] = useState(false);
  const [portraitCopyFailed, setPortraitCopyFailed] = useState(false);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [portraitError, setPortraitError] = useState("");
  const [portraitRawOpen, setPortraitRawOpen] = useState(false);

  // Генерация поискового задания. Модалку открываем сразу, до ответа модели:
  // генерация занимает 10-30 секунд, и ждать в пустом интерфейсе плохо.
  const generatePortrait = useCallback(async () => {
    setPortraitOpen(true);
    setPortraitLoading(true);
    setPortraitError("");
    setPortraitCopied(false);
    setPortraitCopyFailed(false);
    setPortraitRawOpen(false);
    setPortraitText("");
    try {
      const res = await fetch(`/api/vacancies/${id}/portrait`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Ошибка ${res.status}`);
      // Разметку снимаем сразу: в поле должно лежать ровно то, что уедет
      // в буфер и вставится в Telegram — иначе правку пришлось бы делать
      // руками уже в мессенджере.
      setPortraitText(toPlainText(json.brief ?? ""));
    } catch (err) {
      setPortraitError(
        err instanceof Error ? err.message : "Не удалось собрать задание",
      );
    } finally {
      setPortraitLoading(false);
    }
  }, [id]);

  const fetchVacancy = useCallback(async () => {
    try {
      const res = await fetch(`/api/vacancies/${id}`);
      if (!res.ok) throw new Error("Не найдена");
      const data = await res.json();
      setVacancy(data);
      const ids = new Map<string, string>(
        (data.pipelines || []).map((p: PipelineEntry) => [p.candidateId, p.stage])
      );
      setPipelineIds(ids);
    } catch {
      setError("Вакансия не найдена");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVacancy();
  }, [fetchVacancy]);

  const handleRunMatching = async () => {
    setMatching(true);
    setMatchError("");
    setMatchingDone(false);
    try {
      const res = await fetch(`/api/vacancies/${id}/match`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка матчинга");
      setMatchingDone(true);
      await fetchVacancy();
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Ошибка матчинга");
    } finally {
      setMatching(false);
    }
  };

  const handleSoften = async () => {
    setSoftening(true);
    setSoftenMessage("");
    setSoftenChanges(null);
    setMatchError("");
    try {
      const res = await fetch(`/api/vacancies/${id}/soften`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось смягчить требования");

      if (!data.softened) {
        setSoftenMessage(data.message || "Требования уже минимальны");
        setSoftening(false);
        return;
      }

      setSoftenChanges(data.changes || []);
      await fetchVacancy();
      setSoftening(false);
      await handleRunMatching();
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Ошибка смягчения требований");
      setSoftening(false);
    }
  };

  const handleApprove = async (candidateId: string) => {
    setApproveLoading(candidateId);
    try {
      const actor = getPipelineActor();
      const res = await fetch(`/api/vacancies/${id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, actor }),
      });
      if (res.ok) {
        const data = await res.json();
        setPipelineIds((prev) => new Map(prev).set(candidateId, data.stage ?? "DL_APPROVED"));
      }
    } catch {
      // silent
    } finally {
      setApproveLoading(null);
    }
  };

  const injectRecruiterName = (text: string) =>
    text.replace(/\[имя рекрутера\]|\[Имя рекрутера\]|\[Имя\]|\[имя\]|\[NAME\]/g, recruiterName);

  const handleGenerateCriteria = async () => {
    if (!vacancy) return;
    setGeneratingCriteria(true);
    try {
      const parts = [
        vacancy.productDescription && `Продукт: ${vacancy.productDescription}`,
        vacancy.reasonForHiring && `Причина найма: ${vacancy.reasonForHiring}`,
        vacancy.keyTasks.length && `Задачи: ${vacancy.keyTasks.join(", ")}`,
        vacancy.requiredSkills.length && `Обязательные навыки: ${vacancy.requiredSkills.join(", ")}`,
        vacancy.niceToHaveSkills.length && `Желательно: ${vacancy.niceToHaveSkills.join(", ")}`,
        vacancy.preferredDomains.length && `Домены: ${vacancy.preferredDomains.join(", ")}`,
        vacancy.specialCompetencies.length && `Компетенции: ${vacancy.specialCompetencies.join(", ")}`,
        vacancy.redFlags.length && `Стоп-факторы: ${vacancy.redFlags.join(", ")}`,
      ].filter(Boolean).join("\n");

      const res = await fetch("/api/vacancies/parse-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Роль: ${vacancy.role}, Грейд: ${vacancy.grade}\n${parts}` }),
      });
      const data = await res.json();
      if (!data.criteria?.length) throw new Error("Критерии не сгенерированы");

      await fetch(`/api/vacancies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoringCriteria: data.criteria }),
      });

      await fetchVacancy();
    } catch (err) {
      console.error("Generate criteria failed:", err);
    } finally {
      setGeneratingCriteria(false);
    }
  };

  const handleRegenMessages = async () => {
    setRegenning(true);
    setRegenDone(false);
    try {
      await fetch(`/api/vacancies/${id}/regen-messages`, { method: "POST" });
      await fetchVacancy();
      setRegenDone(true);
      setTimeout(() => setRegenDone(false), 3000);
    } catch {
      console.error("Regen messages failed");
    } finally {
      setRegenning(false);
    }
  };

  const handleRescoreStale = async () => {
    setRescoring(true);
    try {
      await fetch(`/api/vacancies/${id}/rescore-stale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await fetchVacancy();
    } catch {
      console.error("Rescore stale failed");
    } finally {
      setRescoring(false);
    }
  };

  const handleCopyMessage = async (matchId: string, text: string) => {
    await navigator.clipboard.writeText(injectRecruiterName(text));
    setCopiedId(matchId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startEdit = () => {
    if (!vacancy) return;
    setEditDraft({
      title: vacancy.title,
      status: vacancy.status,
      clientName: vacancy.clientName ?? "",
      clientLead: vacancy.clientLead ?? "",
      productDescription: vacancy.productDescription ?? "",
      reasonForHiring: vacancy.reasonForHiring ?? "",
      role: vacancy.role,
      grade: vacancy.grade,
      designersNeeded: vacancy.designersNeeded,
      employmentType: vacancy.employmentType,
      workFormat: vacancy.workFormat,
      location: vacancy.location ?? "",
      timezone: vacancy.timezone ?? "",
      salaryRange: vacancy.salaryRange ?? "",
      desiredStartDate: vacancy.desiredStartDate ?? "",
      duration: vacancy.duration ?? "",
      keyTasks: vacancy.keyTasks,
      requiredSkills: vacancy.requiredSkills,
      niceToHaveSkills: vacancy.niceToHaveSkills,
      preferredDomains: vacancy.preferredDomains,
      requiredTools: vacancy.requiredTools,
      needsInternational: vacancy.needsInternational,
      specialCompetencies: vacancy.specialCompetencies,
      redFlags: vacancy.redFlags,
      portfolioReferences: vacancy.portfolioReferences,
      teamComposition: vacancy.teamComposition ?? "",
      decisionMaker: vacancy.decisionMaker ?? "",
      hiringStages: vacancy.hiringStages,
      testTask: vacancy.testTask ?? "",
      scoringCriteria: (vacancy.scoringCriteria ?? []) as ScoringCriterion[],
      clientNotes: vacancy.clientNotes ?? "",
      internalNotes: vacancy.internalNotes ?? "",
    });
    setEditMode(true);
    setEditError("");
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditDraft(null);
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    setEditSaving(true);
    setEditError("");
    try {
      const body = {
        ...editDraft,
        designersNeeded: editDraft.designersNeeded || 1,
        hiringStages: editDraft.hiringStages || undefined,
        clientName: editDraft.clientName || undefined,
        clientLead: editDraft.clientLead || undefined,
        productDescription: editDraft.productDescription || undefined,
        reasonForHiring: editDraft.reasonForHiring || undefined,
        location: editDraft.location || undefined,
        timezone: editDraft.timezone || undefined,
        salaryRange: editDraft.salaryRange || undefined,
        desiredStartDate: editDraft.desiredStartDate || undefined,
        duration: editDraft.duration || undefined,
        teamComposition: editDraft.teamComposition || undefined,
        decisionMaker: editDraft.decisionMaker || undefined,
        testTask: editDraft.testTask || undefined,
        clientNotes: editDraft.clientNotes || undefined,
        internalNotes: editDraft.internalNotes || undefined,
      };
      const res = await fetch(`/api/vacancies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Ошибка ${res.status}`);
      }
      await fetchVacancy();
      setEditMode(false);
      setEditDraft(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/vacancies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка удаления");
      router.push("/vacancies");
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  if (error || !vacancy) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">{error || "Не найдена"}</p>
        <Link href="/vacancies">
          <Button variant="outline" size="sm">К списку</Button>
        </Link>
      </div>
    );
  }

  const criteria = (vacancy.scoringCriteria || []) as ScoringCriterion[];
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const hasCriteria = criteria.length > 0;
  const hasResults = vacancy.matchResults.length > 0;
  const criteriaUpdatedAtDate = vacancy.criteriaUpdatedAt ? new Date(vacancy.criteriaUpdatedAt) : null;
  const staleCount = vacancy.matchResults.filter((m) =>
    isStaleScore(new Date(m.createdAt), criteriaUpdatedAtDate)
  ).length;

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between bg-card px-6 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <Link
          href="/vacancies"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Вакансии
        </Link>
        {!editMode ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => generatePortrait()}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="14" y2="17" />
              </svg>
              Портрет для агентства
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Удалить
            </button>
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Редактировать
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelEdit}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Отмена
            </button>
            <Button
              onClick={saveEdit}
              disabled={editSaving || !editDraft?.title.trim()}
              size="sm"
              style={{ background: "#F97029" }}
              className="text-white font-semibold"
            >
              {editSaving ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ─────────────────────── */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "oklch(0 0 0 / 0.4)" }}
          onClick={() => !deleting && setDeleteConfirm(false)}
        >
          <div
            className="soft-card w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="t-eyebrow mb-3 opacity-60">Подтверждение</p>
            <p className="text-sm font-semibold mb-1">Удалить вакансию?</p>
            <p className="text-sm text-muted-foreground mb-5">
              «{vacancy.title}» будет удалена вместе со всеми результатами матчинга и воронкой. Это действие нельзя отменить.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => setDeleteConfirm(false)}
              >
                Отмена
              </Button>
              <Button
                size="sm"
                disabled={deleting}
                onClick={handleDelete}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold"
              >
                {deleting ? "Удаление..." : "Удалить"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Портрет для внешнего агентства ──────────────────── */}
      {portraitOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "oklch(0 0 0 / 0.4)" }}
          onClick={() => setPortraitOpen(false)}
        >
          <div
            className="soft-card w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <p className="t-eyebrow opacity-60">Поисковое задание для агентства</p>
              {!portraitLoading && (
                <button
                  type="button"
                  onClick={() => generatePortrait()}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  Пересобрать
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Документ для рекрутера: как отличить подходящего по портфолио, кого
              не приносить, чем предстоит заниматься. Название клиента, вилка,
              состав команды и критерии скоринга в него не попадают. Перед
              отправкой можно поправить прямо здесь.
            </p>

            {(() => {
              const risky = riskyPortraitSections(vacancy, vacancy.clientName);
              if (risky.length === 0) return null;
              const quoted = risky.map((r) => `«${r}»`);
              const listed =
                quoted.length > 1
                  ? `${quoted.slice(0, -1).join(", ")} и ${quoted[quoted.length - 1]}`
                  : quoted[0];
              return (
                <p className="text-[12px] text-amber-600 dark:text-amber-400 mb-3">
                  Клиент может быть назван прямым текстом — перечитай{" "}
                  {risky.length > 1 ? "блоки" : "блок"} {listed}.
                </p>
              );
            })()}

            {portraitLoading && (
              <div className="flex-1 min-h-[320px] flex items-center justify-center gap-3 rounded border border-dashed border-border">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                <span className="text-sm text-muted-foreground">
                  Собираем задание…
                </span>
              </div>
            )}

            {!portraitLoading && portraitError && (
              <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center gap-3 rounded border border-dashed border-border px-6 text-center">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {portraitError}
                </p>
                <Button size="sm" variant="outline" onClick={() => generatePortrait()}>
                  Попробовать ещё раз
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setPortraitText(buildVacancyPortrait(vacancy));
                    setPortraitError("");
                  }}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Показать данные вакансии без обработки
                </button>
              </div>
            )}

            {!portraitLoading && !portraitError && (
            <textarea
              value={portraitText}
              onChange={(e) => {
                setPortraitText(e.target.value);
                setPortraitCopied(false);
                setPortraitCopyFailed(false);
              }}
              spellCheck={false}
              className="flex-1 min-h-[320px] w-full rounded border border-border bg-background px-3 py-2 font-mono text-[12px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            )}

            {!portraitLoading && !portraitError && (
              <button
                type="button"
                onClick={() => setPortraitRawOpen((v) => !v)}
                className="mt-2 self-start text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {portraitRawOpen ? "Скрыть" : "Показать"} исходные данные —
                ровно то, что видела модель
              </button>
            )}

            {portraitRawOpen && (
              <pre className="mt-2 max-h-40 overflow-y-auto rounded border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {buildVacancyPortrait(vacancy)}
              </pre>
            )}

            <div className="flex gap-2 justify-end items-center mt-4">
              <span className="mr-auto text-[12px] text-muted-foreground">
                {portraitCopyFailed
                  ? "Текст выделен — скопируй сам (⌘C)"
                  : `${portraitText.length.toLocaleString("ru")} символов`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPortraitOpen(false)}
              >
                Закрыть
              </Button>
              <Button
                size="sm"
                disabled={portraitLoading || !portraitText}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(portraitText);
                    setPortraitCopied(true);
                    setPortraitCopyFailed(false);
                  } catch {
                    // Клипборд недоступен (нет https / вкладка не в фокусе) —
                    // выделяем текст и говорим, что дальше делать руками.
                    const ta = document.querySelector<HTMLTextAreaElement>(
                      ".soft-card textarea",
                    );
                    ta?.focus();
                    ta?.select();
                    setPortraitCopyFailed(true);
                  }
                }}
                style={{ background: "#F97029" }}
                className="text-white font-semibold"
              >
                {portraitCopied ? "Скопировано" : "Скопировать"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1080px] px-6 pb-16">
        {/* ── Edit mode ─────────────────────────────────────── */}
        {editMode && editDraft && (
          <VacancyEditForm
            draft={editDraft}
            setDraft={setEditDraft}
            error={editError}
          />
        )}
        {editMode && <div className="hidden" />}
        {!editMode && (<>
        {/* ── Hero card ─────────────────────────────────────── */}
        <Card className="mt-8 mb-4">
          <CardContent className="pt-6 pb-5">
            <h1 className="text-[26px] font-bold tracking-tight leading-tight">
              {vacancy.title}
            </h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              {ROLE_LABELS[vacancy.role] || vacancy.role}
              {vacancy.clientName && ` · ${vacancy.clientName}`}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {GRADE_LABELS[vacancy.grade] || vacancy.grade}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${vacancy.status === "OPEN" ? "bg-[var(--tint-green-bg)] text-[var(--tint-green-fg)]" : "border border-border bg-transparent text-foreground"}`}>
                {VACANCY_STATUS_LABELS[vacancy.status] || vacancy.status}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── Two-column info grid ──────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 items-start mb-4">
          {/* Left column */}
          <div className="space-y-4">
            {/* Position params */}
            <Card>
              <CardContent className="pt-5 pb-5">
                <SectionHeader
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/></svg>}
                  title="Параметры позиции"
                />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <InfoRow label="Занятость" value={EMPLOYMENT_TYPE_LABELS[vacancy.employmentType] || vacancy.employmentType} />
                  <InfoRow label="Формат" value={WORK_FORMAT_LABELS[vacancy.workFormat] || vacancy.workFormat} />
                  {vacancy.designersNeeded > 1 && <InfoRow label="Кол-во" value={`${vacancy.designersNeeded} чел.`} />}
                  {vacancy.location && <InfoRow label="Локация" value={vacancy.location} />}
                  {vacancy.timezone && <InfoRow label="Часовой пояс" value={vacancy.timezone} />}
                  {vacancy.salaryRange && <InfoRow label="Зарплата" value={vacancy.salaryRange} />}
                  {vacancy.desiredStartDate && <InfoRow label="Старт" value={vacancy.desiredStartDate} />}
                  {vacancy.duration && <InfoRow label="Длительность" value={vacancy.duration} />}
                  {vacancy.clientLead && <InfoRow label="Лид клиента" value={vacancy.clientLead} />}
                </div>
              </CardContent>
            </Card>

            {/* Description */}
            {(vacancy.productDescription || vacancy.reasonForHiring) && (
              <Card>
                <CardContent className="pt-5 pb-5 space-y-5">
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>}
                    title="Описание"
                  />
                  {vacancy.productDescription && (
                    <div>
                      <SectionTitle>Описание продукта</SectionTitle>
                      <p className="text-sm leading-relaxed">{vacancy.productDescription}</p>
                    </div>
                  )}
                  {vacancy.reasonForHiring && (
                    <div>
                      <SectionTitle>Причина найма</SectionTitle>
                      <p className="text-sm leading-relaxed">{vacancy.reasonForHiring}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Candidate portrait */}
            <CandidatePortraitCard vacancy={vacancy} />
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Requirements */}
            <RequirementsCard vacancy={vacancy} />

            {/* Scoring criteria */}
            {criteria.length === 0 ? (
              <Card>
                <CardContent className="pt-5 pb-5">
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>}
                    title="Критерии скоринга"
                  />
                  <p className="text-xs text-muted-foreground mb-3 -mt-1">
                    Критерии не заданы — матчинг использует базовые параметры
                  </p>
                  <Button
                    onClick={handleGenerateCriteria}
                    disabled={generatingCriteria}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    {generatingCriteria ? "Генерируем..." : "Сгенерировать критерии"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <SectionHeader
                      icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>}
                      title="Критерии скоринга"
                    />
                    <span className={`text-xs font-medium ${totalWeight === 100 ? "text-emerald-600" : "text-red-500"}`}>
                      {totalWeight}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {criteria.map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm truncate">{c.criterion}</span>
                          <span className={`shrink-0 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            c.type === "required"
                              ? "bg-[#F97029]/10 text-[#F97029]"
                              : c.type === "stop_factor"
                                ? "bg-red-50 text-red-600"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {CRITERION_TYPE_LABELS[c.type] || c.type}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground font-medium">
                          {c.weight}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleGenerateCriteria}
                    disabled={generatingCriteria}
                    className="mt-3 text-xs text-[#F97029] hover:opacity-70 transition-opacity disabled:opacity-40"
                  >
                    {generatingCriteria ? "Генерируем..." : "Перегенерировать"}
                  </button>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {(vacancy.clientNotes || vacancy.internalNotes) && (
              <Card>
                <CardContent className="pt-5 pb-5 space-y-5">
                  <SectionHeader
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                    title="Заметки"
                  />
                  {vacancy.clientNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">По клиенту</p>
                      <p className="text-sm leading-relaxed">{vacancy.clientNotes}</p>
                    </div>
                  )}
                  {vacancy.internalNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Внутренние</p>
                      <p className="text-sm leading-relaxed">{vacancy.internalNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ── Match results (full width) ───────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <SectionHeader
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                  title="Результаты матчинга"
                />
                {hasResults && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    {vacancy._count.matchResults} кандидатов
                    {vacancy._count.pipelines > 0 && ` · ${vacancy._count.pipelines} в воронке`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {staleCount > 0 && (
                  <Button
                    onClick={handleRescoreStale}
                    disabled={rescoring || matching || softening}
                    variant="outline"
                    size="sm"
                    title="Пересчитать скоры кандидатов, которые были посчитаны до последнего обновления критериев"
                  >
                    {rescoring ? "Пересчёт..." : `Пересчитать устаревших (${staleCount})`}
                  </Button>
                )}
                {hasResults && (
                  <Button
                    onClick={handleRegenMessages}
                    disabled={regenning || matching || softening}
                    variant="outline"
                    size="sm"
                    title="Перегенерировать сообщения кандидатам по новому шаблону без пересчёта скоров"
                  >
                    {regenning ? "Обновляем..." : regenDone ? "Готово ✓" : "Обновить сообщения"}
                  </Button>
                )}
                {(hasResults || matchingDone) && hasCriteria && (
                  <Button
                    onClick={handleSoften}
                    disabled={matching || softening}
                    variant="outline"
                    size="sm"
                    title="Перевести часть обязательных критериев в желательные, убрать стоп-факторы и перезапустить матчинг"
                  >
                    {softening ? "Смягчаем..." : "Смягчить требования"}
                  </Button>
                )}
                <Button
                  onClick={handleRunMatching}
                  disabled={matching || softening || generatingCriteria}
                  variant={hasResults ? "outline" : "default"}
                  size={hasResults ? "sm" : "default"}
                >
                  {matching
                    ? "Анализируем..."
                    : hasResults
                      ? "Перезапустить"
                      : "Найти кандидатов"}
                </Button>
              </div>
            </div>

            {softenChanges && softenChanges.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Требования смягчены:
                </p>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 list-disc list-inside">
                  {softenChanges.map((c, i) => (
                    <li key={i}>{c.description}</li>
                  ))}
                </ul>
              </div>
            )}

            {softenMessage && (
              <div className="mb-3 rounded-lg border border-muted-foreground/20 bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">{softenMessage}</p>
              </div>
            )}

            {!hasCriteria && !hasResults && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Добавьте критерии скоринга для запуска матчинга
              </p>
            )}

            {matchError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-700">{matchError}</p>
              </div>
            )}

            {matching && (
              <div className="mb-4 rounded-lg border px-4 py-3 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  AI анализирует кандидатов по критериям вакансии...
                </p>
                <div className="flex justify-center">
                  <div className="h-1.5 w-48 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-foreground/30 animate-[pulse_1.5s_ease-in-out_infinite] w-full" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Это может занять 1–2 минуты
                </p>
              </div>
            )}

            {!hasResults && !matching && hasCriteria && !matchingDone && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Матчинг ещё не запускался
              </p>
            )}

            {!hasResults && !matching && matchingDone && (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-sm font-medium text-muted-foreground">
                  Подходящих кандидатов не найдено
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Попробуйте смягчить критерии или добавить больше кандидатов в базу
                </p>
                <Button
                  onClick={handleSoften}
                  disabled={softening || matching}
                  variant="default"
                  size="sm"
                >
                  {softening ? "Смягчаем..." : "Смягчить требования и попробовать снова"}
                </Button>
              </div>
            )}

            {/* Results list */}
            {hasResults && (
              <div className="space-y-2">
                {vacancy.matchResults.map((m, idx) => {
                  const isExpanded = expandedMatch === m.id;
                  const criteriaScores = (m.criteriaScores || []) as CriterionScore[];
                  const pipelineStage = pipelineIds.get(m.candidate.id);
                  const inPipeline = pipelineStage !== undefined;

                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg border overflow-hidden transition-colors ${
                        inPipeline ? "border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20" : ""
                      }`}
                    >
                      {/* Summary row */}
                      <div
                        data-click-sound="press"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedMatch(isExpanded ? null : m.id)}
                      >
                        <span className="text-xs text-muted-foreground font-medium w-5 shrink-0">
                          {idx + 1}.
                        </span>

                        <div className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center min-w-[52px] ${scoreBadgeClasses(m.overallScore)}`}>
                          <div className="text-lg font-bold leading-none">{m.overallScore}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">{scoreLabel(m.overallScore)}</div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/candidates/${m.candidate.id}`}
                              className="text-sm font-medium truncate hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {m.candidate.name}
                            </Link>
                            {inPipeline && (
                              <span className="text-[10px] text-emerald-600 font-medium">
                                {PIPELINE_STAGE_LABELS[pipelineStage as keyof typeof PIPELINE_STAGE_LABELS] ?? "В воронке"}
                              </span>
                            )}
                            {isStaleScore(new Date(m.createdAt), criteriaUpdatedAtDate) && (
                              <span
                                className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium"
                                title="Скор был посчитан до последнего обновления критериев"
                              >
                                Скор устарел
                              </span>
                            )}
                            {m.feedbackRating === "GOOD" && <span title="Подходит" className="text-sm">👍</span>}
                            {m.feedbackRating === "BAD" && <span title="Не подходит" className="text-sm">👎</span>}
                            {m.feedbackRating === "NEUTRAL" && <span title="Под вопросом" className="text-sm">🤔</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {ROLE_LABELS[m.candidate.role] || m.candidate.role}
                            {" · "}
                            {GRADE_LABELS[m.candidate.grade] || m.candidate.grade}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {m.matchExplanation}
                          </p>
                        </div>

                        <span className="text-xs text-muted-foreground shrink-0">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t px-4 py-4 space-y-4 bg-muted/5">
                          <div className="flex items-center gap-2">
                            {/* Обёртка общая для обоих состояний: после успеха
                                кнопка сменяется плашкой, и если держать конфетти
                                внутри ветки с кнопкой, оно исчезнет вместе с ней,
                                не успев показаться. */}
                            <span className="relative inline-flex">
                              {inPipeline ? (
                                <span className="inline-flex items-center rounded-md bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                  В воронке · {PIPELINE_STAGE_LABELS[pipelineStage as keyof typeof PIPELINE_STAGE_LABELS] ?? pipelineStage}
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={approveLoading === m.candidate.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCelebrate({ id: m.candidate.id, at: Date.now() });
                                    handleApprove(m.candidate.id);
                                  }}
                                  className="text-xs"
                                >
                                  {approveLoading === m.candidate.id ? "..." : "Одобрить"}
                                </Button>
                              )}
                              <ConfettiBurst
                                fire={celebrate?.id === m.candidate.id ? celebrate.at : null}
                              />
                            </span>
                            <Link
                              href={`/candidates/${m.candidate.id}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button size="sm" variant="outline" className="text-xs">
                                Карточка кандидата
                              </Button>
                            </Link>
                          </div>

                          <CandidateLinks candidate={m.candidate} />

                          <p className="text-sm leading-relaxed text-muted-foreground border-l-2 border-border pl-3">
                            {m.matchExplanation}
                          </p>

                          {(m.strengthsForVacancy.length > 0 || m.gaps.length > 0) && (
                            <div className="grid grid-cols-2 gap-3">
                              {m.strengthsForVacancy.length > 0 && (
                                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
                                    Сильные стороны
                                  </p>
                                  <ul className="space-y-1">
                                    {m.strengthsForVacancy.map((s, i) => (
                                      <li key={i} className="flex gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                                        <span className="mt-1 shrink-0">✓</span>
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {m.gaps.length > 0 && (
                                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-2">
                                    Пробелы
                                  </p>
                                  <ul className="space-y-1">
                                    {m.gaps.map((g, i) => (
                                      <li key={i} className="flex gap-1.5 text-xs text-red-700 dark:text-red-300">
                                        <span className="mt-1 shrink-0">–</span>
                                        <span>{g}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {criteriaScores.length > 0 && (
                            <div>
                              <DetailTitle>Оценки по критериям</DetailTitle>
                              <CriteriaAccordion criteriaScores={criteriaScores} />
                            </div>
                          )}

                          {m.clarificationQuestions.length > 0 && (
                            <div>
                              <DetailTitle>Вопросы для уточнения</DetailTitle>
                              <ol className="space-y-1 list-decimal list-inside">
                                {m.clarificationQuestions.map((q, i) => (
                                  <li key={i} className="text-sm">{q}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {m.clarificationMessage && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <DetailTitle>Сообщение кандидату</DetailTitle>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyMessage(m.id, m.clarificationMessage!);
                                  }}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                                >
                                  {copiedId === m.id ? "Скопировано!" : "Копировать"}
                                </button>
                              </div>
                              <div className="rounded-lg border bg-background px-4 py-3">
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                  <MessageWithNamePicker
                                    raw={m.clarificationMessage}
                                    recruiterName={recruiterName}
                                    onNameChange={setRecruiterName}
                                  />
                                </p>
                              </div>
                            </div>
                          )}

                          <MatchFeedback
                            matchId={m.id}
                            initialRating={m.feedbackRating}
                            initialFeedback={m.humanFeedback}
                            onSaved={fetchVacancy}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Vacancy updates journal ──────────────────────────── */}
        <div className="mt-4">
          <VacancyUpdates vacancyId={id} />
        </div>

        {/* ── Interview insights ───────────────────────────────── */}
        <div className="mt-4">
          <InterviewInsights vacancyId={id} />
        </div>

        {/* ── Pipeline board (full width) ──────────────────────── */}
        <Card className="mt-4">
          <CardContent className="pt-6 pb-6">
            <SectionHeader
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/></svg>}
              title="Воронка"
            />
            <PipelineBoard vacancyId={id} />
          </CardContent>
        </Card>
      </>)}
      </div>
    </div>
  );
}

// ── Sub-cards ───────────────────────────────────────────────────────

function RequirementsCard({ vacancy }: { vacancy: VacancyDetail }) {
  const sections = [
    { label: "Ключевые задачи", items: vacancy.keyTasks, variant: "outline" as const },
    { label: "Обязательные навыки", items: vacancy.requiredSkills, variant: "outline" as const },
    { label: "Будет плюсом", items: vacancy.niceToHaveSkills, variant: "outline" as const },
    { label: "Домены", items: vacancy.preferredDomains, variant: "outline" as const },
    { label: "Инструменты", items: vacancy.requiredTools, variant: "outline" as const },
    { label: "Спец. компетенции", items: vacancy.specialCompetencies, variant: "outline" as const },
    { label: "Стоп-факторы", items: vacancy.redFlags, variant: "destructive" as const },
  ];
  const hasAny = sections.some((s) => s.items.length > 0) || vacancy.needsInternational;
  if (!hasAny) return null;

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-4">
        <SectionHeader
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
          title="Требования"
        />
        {sections.map(
          (s) =>
            s.items.length > 0 && (
              <TagSection key={s.label} label={s.label} items={s.items} variant={s.variant} />
            )
        )}
        {vacancy.needsInternational && (
          <p className="text-sm text-muted-foreground">Нужен международный опыт</p>
        )}
      </CardContent>
    </Card>
  );
}

function CandidatePortraitCard({ vacancy }: { vacancy: VacancyDetail }) {
  const hasContent =
    vacancy.teamComposition ||
    vacancy.decisionMaker ||
    vacancy.hiringStages ||
    vacancy.testTask ||
    vacancy.portfolioReferences.length > 0;
  if (!hasContent) return null;

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-5">
        <SectionHeader
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          title="Портрет кандидата"
        />
        {vacancy.portfolioReferences.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Референсы портфолио</p>
            <ul className="space-y-1">
              {vacancy.portfolioReferences.map((link, i) => (
                <li key={i}>
                  <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-2 hover:text-muted-foreground break-all">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {vacancy.teamComposition && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Состав команды</p>
            <p className="text-sm">{vacancy.teamComposition}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {vacancy.decisionMaker && <InfoRow label="Принимает решение" value={vacancy.decisionMaker} />}
          {vacancy.hiringStages && <InfoRow label="Этапов" value={`${vacancy.hiringStages}`} />}
        </div>
        {vacancy.testTask && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Тестовое задание</p>
            <p className="text-sm">{vacancy.testTask}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-primary">
        {icon}
      </div>
      <span className="t-card-title">{title}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-section-label mb-1">
      {children}
    </p>
  );
}

function DetailTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-eyebrow mb-1.5 opacity-70">{children}</p>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="t-section-label mb-0.5">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function CandidateLinks({ candidate }: { candidate: MatchResultCandidate }) {
  const tgHandle = candidate.telegramContact?.replace(/^@/, "").trim();
  const tgHref = tgHandle ? `https://t.me/${tgHandle}` : null;

  if (candidate.portfolioLinks.length === 0 && !tgHref) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {candidate.portfolioLinks.map((link, i) => (
        <a
          key={i}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          {candidate.portfolioLinks.length > 1 ? `Портфолио ${i + 1}` : "Открыть портфолио"}
        </a>
      ))}
      {tgHref && (
        <a
          href={tgHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
          title="Открыть в Telegram"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#229ED9">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.939z"/>
          </svg>
          @{tgHandle}
        </a>
      )}
    </div>
  );
}

function MatchFeedback({
  matchId,
  initialRating,
  initialFeedback,
  onSaved,
}: {
  matchId: string;
  initialRating: FeedbackRating | null;
  initialFeedback: string | null;
  onSaved: () => void | Promise<void>;
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(initialRating);
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [showInput, setShowInput] = useState(!!initialFeedback);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const save = async (newRating: FeedbackRating | null, newFeedback?: string) => {
    setSaving(true);
    try {
      await fetch(`/api/match-results/${matchId}/feedback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: newRating,
          feedback: newFeedback !== undefined ? newFeedback : feedback,
        }),
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      await onSaved();
    } catch {
      console.error("Не удалось сохранить фидбек");
    } finally {
      setSaving(false);
    }
  };

  const handleRate = (newRating: FeedbackRating) => {
    const next = rating === newRating ? null : newRating;
    setRating(next);
    if (next && !showInput) setShowInput(true);
    save(next);
  };

  const handleFeedbackBlur = () => {
    if (feedback.trim() !== (initialFeedback ?? "")) {
      save(rating, feedback.trim());
    }
  };

  const buttons: { rating: FeedbackRating; emoji: string; label: string; activeClass: string }[] = [
    { rating: "GOOD",    emoji: "👍", label: "Подходит",     activeClass: "bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700" },
    { rating: "NEUTRAL", emoji: "🤔", label: "Под вопросом", activeClass: "bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700" },
    { rating: "BAD",     emoji: "👎", label: "Не подходит",  activeClass: "bg-red-100 border-red-300 dark:bg-red-900/40 dark:border-red-700" },
  ];

  return (
    <div className="rounded-lg border border-dashed border-border bg-background/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <DetailTitle>Ваш фидбек</DetailTitle>
        {savedFlash && <span className="text-[10px] text-emerald-600">Сохранено</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {buttons.map((b) => {
          const active = rating === b.rating;
          return (
            <button
              key={b.rating}
              onClick={(e) => { e.stopPropagation(); handleRate(b.rating); }}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                active
                  ? `${b.activeClass} font-semibold`
                  : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
              }`}
            >
              <span className="text-sm">{b.emoji}</span>
              <span>{b.label}</span>
            </button>
          );
        })}
        {!showInput && rating && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowInput(true); }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            добавить причину
          </button>
        )}
      </div>
      {showInput && (
        <div className="mt-2.5">
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onBlur={handleFeedbackBlur}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            onClick={(e) => e.stopPropagation()}
            placeholder={
              rating === "BAD"     ? "Почему не подходит? (например: визуал слабый, нет UX-кейсов)" :
              rating === "GOOD"    ? "Что особенно зацепило?" :
              rating === "NEUTRAL" ? "Что смущает / что хочется уточнить?" :
              "Комментарий"
            }
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary/50 transition-[border-color]"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Учитывается при следующем матчинге этой вакансии — AI не будет показывать похожих
          </p>
        </div>
      )}
    </div>
  );
}

function CriteriaAccordion({ criteriaScores }: { criteriaScores: CriterionScore[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="divide-y divide-border rounded-lg border overflow-hidden">
      {criteriaScores.map((cs, i) => {
        const isOpen = openIdx === i;
        const scoreNum = cs.score;
        const scoreTextColor =
          scoreNum >= 70 ? "text-emerald-600" : scoreNum >= 40 ? "text-amber-600" : "text-red-500";
        const barColor =
          scoreNum >= 70 ? "bg-emerald-500" : scoreNum >= 40 ? "bg-amber-400" : "bg-red-400";
        return (
          <div key={i} className="bg-card">
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              onClick={() => setOpenIdx(isOpen ? null : i)}
            >
              <span className={`text-sm font-bold w-7 shrink-0 text-right ${scoreTextColor}`}>
                {scoreNum}
              </span>
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${scoreNum}%` }} />
              </div>
              <span className="text-sm flex-1 min-w-0">{cs.criterion}</span>
              <svg
                className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isOpen && cs.explanation && (
              <div className="px-3 pb-3 pt-0">
                <p className="text-xs text-muted-foreground leading-relaxed pl-[52px]">
                  {cs.explanation}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const RECRUITER_NAMES = ["Лина", "Яна", "Настя"];
const NAME_PLACEHOLDER_RE = /\[имя рекрутера\]|\[Имя рекрутера\]|\[Имя\]|\[имя\]|\[NAME\]/g;

function InlineNamePicker({
  name,
  onChange,
}: {
  name: string;
  onChange: (n: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="font-semibold text-primary underline decoration-dashed underline-offset-2 hover:opacity-70 transition-opacity"
      >
        {name}
      </button>
      <AnimatePresence>
      {open && (
        <>
          <span
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <motion.span
            {...dropdownMotion}
            className="absolute left-0 top-full z-20 mt-1 min-w-[80px] origin-top overflow-hidden rounded-lg border border-border bg-popover/95 shadow-lg backdrop-blur-sm"
          >
            {RECRUITER_NAMES.map((n) => (
              <button
                key={n}
                onClick={(e) => { e.stopPropagation(); onChange(n); setOpen(false); }}
                className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-secondary ${
                  n === name ? "font-semibold text-primary" : ""
                }`}
              >
                {n}
              </button>
            ))}
          </motion.span>
        </>
      )}
      </AnimatePresence>
    </span>
  );
}

function MessageWithNamePicker({
  raw,
  recruiterName,
  onNameChange,
}: {
  raw: string;
  recruiterName: string;
  onNameChange: (n: string) => void;
}) {
  const text = raw.replace(NAME_PLACEHOLDER_RE, recruiterName);
  const idx = text.indexOf(recruiterName);
  if (idx === -1) {
    return <span>{text}</span>;
  }
  const before = text.slice(0, idx);
  const after = text.slice(idx + recruiterName.length);
  return (
    <>
      {before}
      <InlineNamePicker name={recruiterName} onChange={onNameChange} />
      {after}
    </>
  );
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timer.current = setTimeout(() => setVisible(true), 800);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  return (
    <span
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-max max-w-[260px] rounded-md bg-white border border-[#E0E0E0] px-2.5 py-1.5 text-xs text-[#151515] shadow-sm whitespace-normal leading-snug pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

function shortLabel(text: string, max = 24): string {
  if (text.length <= max) return text;
  // cut at last space before max to avoid mid-word break
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut) + "…";
}

function TagSection({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: "secondary" | "outline" | "destructive";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="t-section-label mb-1.5">{label}</p>
      {variant === "destructive" ? (
        <ul className="space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              <Tooltip text={item}>
                <span>{shortLabel(item)}</span>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <Tooltip key={i} text={item}>
              <span className="inline-flex items-center rounded-full bg-card [box-shadow:var(--shadow-card)] px-2.5 py-0.5 text-xs font-normal cursor-default text-foreground">
                {shortLabel(item)}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Edit Form ────────────────────────────────────────────────────────

function VacancyEditForm({
  draft,
  setDraft,
  error,
}: {
  draft: EditDraft;
  setDraft: React.Dispatch<React.SetStateAction<EditDraft | null>>;
  error: string;
}) {
  const set = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) =>
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);

  const ROLES = Object.keys(ROLE_LABELS);
  const GRADES = Object.keys(GRADE_LABELS);
  const STATUSES = Object.keys(VACANCY_STATUS_LABELS);

  return (
    <div className="mt-8 space-y-4 pb-24">
      {/* ── Основное ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="t-eyebrow mb-1 opacity-70">Основное</p>

          <VField label="Название вакансии" required>
            <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Senior Product Designer" />
          </VField>

          <div className="grid grid-cols-3 gap-3">
            <VField label="Статус">
              <VSelect value={draft.status} onChange={(v) => set("status", v)}>
                {STATUSES.map((s) => <option key={s} value={s}>{VACANCY_STATUS_LABELS[s]}</option>)}
              </VSelect>
            </VField>
            <VField label="Роль">
              <VSelect value={draft.role} onChange={(v) => set("role", v)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </VSelect>
            </VField>
            <VField label="Грейд">
              <VSelect value={draft.grade} onChange={(v) => set("grade", v)}>
                {GRADES.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
              </VSelect>
            </VField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VField label="Клиент">
              <Input value={draft.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Название компании" />
            </VField>
            <VField label="Лид со стороны клиента">
              <Input value={draft.clientLead} onChange={(e) => set("clientLead", e.target.value)} placeholder="Имя контактного лица" />
            </VField>
          </div>

          <VField label="Описание продукта / команды">
            <VTextarea value={draft.productDescription} onChange={(v) => set("productDescription", v)} placeholder="Чем занимается компания, какой продукт, команда..." />
          </VField>

          <VField label="Причина найма">
            <VTextarea value={draft.reasonForHiring} onChange={(v) => set("reasonForHiring", v)} placeholder="Почему открылась вакансия..." />
          </VField>
        </CardContent>
      </Card>

      {/* ── Параметры позиции ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="t-eyebrow mb-1 opacity-70">Параметры позиции</p>

          <div className="grid grid-cols-3 gap-3">
            <VField label="Тип занятости">
              <VSelect value={draft.employmentType} onChange={(v) => set("employmentType", v)}>
                <option value="FULL_TIME">Полная занятость</option>
                <option value="PART_TIME">Частичная</option>
                <option value="CONTRACT">Контракт</option>
              </VSelect>
            </VField>
            <VField label="Формат работы">
              <VSelect value={draft.workFormat} onChange={(v) => set("workFormat", v)}>
                <option value="REMOTE">Удалённо</option>
                <option value="HYBRID">Гибрид</option>
                <option value="OFFICE">Офис</option>
              </VSelect>
            </VField>
            <VField label="Кол-во дизайнеров">
              <Input type="number" min={1} value={draft.designersNeeded} onChange={(e) => set("designersNeeded", parseInt(e.target.value) || 1)} />
            </VField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VField label="Локация">
              <Input value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="Москва / любая" />
            </VField>
            <VField label="Часовой пояс">
              <Input value={draft.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="UTC+3" />
            </VField>
            <VField label="Зарплатная вилка">
              <Input value={draft.salaryRange} onChange={(e) => set("salaryRange", e.target.value)} placeholder="200–300k руб." />
            </VField>
            <VField label="Желаемый старт">
              <Input value={draft.desiredStartDate} onChange={(e) => set("desiredStartDate", e.target.value)} placeholder="Апрель 2026" />
            </VField>
          </div>

          <VField label="Продолжительность">
            <Input value={draft.duration} onChange={(e) => set("duration", e.target.value)} placeholder="Бессрочно / 6 месяцев" />
          </VField>
        </CardContent>
      </Card>

      {/* ── Требования ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="t-eyebrow mb-1 opacity-70">Требования</p>
          <VTagField label="Ключевые задачи" values={draft.keyTasks} onChange={(v) => set("keyTasks", v)} placeholder="Добавить задачу..." />
          <VTagField label="Обязательные навыки" values={draft.requiredSkills} onChange={(v) => set("requiredSkills", v)} placeholder="Добавить навык..." />
          <VTagField label="Будет плюсом" values={draft.niceToHaveSkills} onChange={(v) => set("niceToHaveSkills", v)} placeholder="Добавить навык..." />
          <VTagField label="Желательные домены" values={draft.preferredDomains} onChange={(v) => set("preferredDomains", v)} placeholder="fintech, e-commerce..." />
          <VTagField label="Инструменты" values={draft.requiredTools} onChange={(v) => set("requiredTools", v)} placeholder="Figma, Sketch..." />
          <VTagField label="Спец. компетенции" values={draft.specialCompetencies} onChange={(v) => set("specialCompetencies", v)} placeholder="Design systems..." />
          <VTagField label="Стоп-факторы" values={draft.redFlags} onChange={(v) => set("redFlags", v)} placeholder="Нет портфолио..." />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.needsInternational}
              onChange={(e) => set("needsInternational", e.target.checked)}
              className="h-4 w-4 rounded border-input accent-foreground"
            />
            Нужен международный опыт
          </label>
        </CardContent>
      </Card>

      {/* ── Портрет кандидата ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="t-eyebrow mb-1 opacity-70">Портрет кандидата</p>
          <VTagField label="Референсы портфолио" values={draft.portfolioReferences} onChange={(v) => set("portfolioReferences", v)} placeholder="https://..." />
          <VField label="Состав команды">
            <VTextarea value={draft.teamComposition} onChange={(v) => set("teamComposition", v)} placeholder="С кем будет работать дизайнер..." />
          </VField>
          <div className="grid grid-cols-2 gap-3">
            <VField label="Кто принимает решение">
              <Input value={draft.decisionMaker} onChange={(e) => set("decisionMaker", e.target.value)} placeholder="CTO / Head of Design" />
            </VField>
            <VField label="Этапов собеседования">
              <Input type="number" min={1} value={draft.hiringStages ?? ""} onChange={(e) => set("hiringStages", e.target.value ? parseInt(e.target.value) : null)} placeholder="3" />
            </VField>
          </div>
          <VField label="Тестовое задание">
            <VTextarea value={draft.testTask} onChange={(v) => set("testTask", v)} placeholder="Описание тестового задания..." />
          </VField>
        </CardContent>
      </Card>

      {/* ── Критерии скоринга ── */}
      <VCriteriaEditor
        criteria={draft.scoringCriteria}
        onChange={(v) => set("scoringCriteria", v)}
      />

      {/* ── Заметки ── */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="t-eyebrow mb-1 opacity-70">Заметки</p>
          <VField label="Заметки по клиенту">
            <VTextarea value={draft.clientNotes} onChange={(v) => set("clientNotes", v)} placeholder="Особенности работы с клиентом..." />
          </VField>
          <VField label="Внутренние заметки">
            <VTextarea value={draft.internalNotes} onChange={(v) => set("internalNotes", v)} placeholder="Внутренняя информация для команды..." />
          </VField>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-[var(--r-button)] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Edit helpers ─────────────────────────────────────────────────────

function VField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function VTextarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="flex w-full [border-radius:var(--r-button)] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:border-ring transition-colors resize-y"
    />
  );
}

function VSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full [border-radius:var(--r-button)] border border-input bg-background px-3 text-sm outline-none focus:border-ring transition-colors"
    >
      {children}
    </select>
  );
}

function VTagField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setInput("");
  };
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-card [box-shadow:var(--shadow-card)] px-2.5 py-0.5 text-xs">
              {v}
              <button onClick={() => onChange(values.filter((_, j) => j !== i))} className="ml-0.5 text-muted-foreground hover:text-foreground">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button onClick={add} disabled={!input.trim()} className="shrink-0 h-9 px-3 [border-radius:var(--r-button)] border border-input bg-background text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">+</button>
      </div>
    </div>
  );
}

const CRITERION_TYPE_LABELS_EDIT: Record<string, string> = {
  required: "Обязательный",
  nice_to_have: "Желательный",
  stop_factor: "Стоп-фактор",
};

function VCriteriaEditor({ criteria, onChange }: { criteria: ScoringCriterion[]; onChange: (v: ScoringCriterion[]) => void }) {
  const [newCriterion, setNewCriterion] = useState("");
  const [newWeight, setNewWeight] = useState(10);
  const [newType, setNewType] = useState<"required" | "nice_to_have" | "stop_factor">("required");
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);

  const add = () => {
    if (!newCriterion.trim()) return;
    onChange([...criteria, { criterion: newCriterion.trim(), weight: newWeight, type: newType }]);
    setNewCriterion("");
    setNewWeight(10);
  };

  const remove = (i: number) => onChange(criteria.filter((_, j) => j !== i));

  const update = (i: number, field: keyof ScoringCriterion, value: unknown) =>
    onChange(criteria.map((c, j) => j === i ? { ...c, [field]: value } : c));

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="t-eyebrow opacity-70">Критерии скоринга</p>
          <span className={`text-xs font-medium ${totalWeight === 100 ? "text-emerald-600" : totalWeight > 100 ? "text-destructive" : "text-muted-foreground"}`}>
            Сумма: {totalWeight}%{totalWeight !== 100 && totalWeight > 0 && " (рекомендуется 100%)"}
          </span>
        </div>

        {criteria.length > 0 && (
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2.5">
                  <span className="t-card-title min-w-0 flex-1">{c.criterion}</span>
                  <select
                    value={c.type}
                    onChange={(e) => update(i, "type", e.target.value)}
                    className="h-7 [border-radius:var(--r-icon)] border border-input bg-background px-2 text-xs outline-none"
                  >
                    <option value="required">Обязательный</option>
                    <option value="nice_to_have">Желательный</option>
                    <option value="stop_factor">Стоп-фактор</option>
                  </select>
                  {c.type !== "stop_factor" && (
                    <span className="t-card-title w-11 text-right tabular-nums">{c.weight}%</span>
                  )}
                  <button
                    onClick={() => remove(i)}
                    className="px-1 text-sm text-muted-foreground hover:text-foreground"
                    aria-label={`Убрать критерий «${c.criterion}»`}
                  >
                    &times;
                  </button>
                </div>

                {c.type !== "stop_factor" ? (
                  <RangeSlider
                    label={`Вес критерия «${c.criterion}»`}
                    value={c.weight}
                    onChange={(v) => update(i, "weight", v)}
                  />
                ) : (
                  <p className="t-caption">
                    Кандидаты с этим признаком отсеиваются до скоринга — вес не нужен.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 border-t pt-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Критерий</label>
            <Input value={newCriterion} onChange={(e) => setNewCriterion(e.target.value)} placeholder="Enterprise UX опыт" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Тип</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value as "required" | "nice_to_have" | "stop_factor")} className="h-9 [border-radius:var(--r-button)] border border-input bg-background px-2 text-sm outline-none">
              <option value="required">Обязательный</option>
              <option value="nice_to_have">Желательный</option>
              <option value="stop_factor">Стоп-фактор</option>
            </select>
          </div>
          <div className="w-20">
            <label className="mb-1 block text-xs text-muted-foreground">Вес %</label>
            <Input type="number" min={0} max={100} value={newWeight} onChange={(e) => setNewWeight(parseInt(e.target.value) || 0)} />
          </div>
          <Button onClick={add} disabled={!newCriterion.trim()} variant="outline" size="sm">Добавить</Button>
        </div>
      </CardContent>
    </Card>
  );
}
