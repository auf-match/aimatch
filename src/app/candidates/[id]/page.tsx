"use client";

import { useState, useEffect, use, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ROLE_LABELS, GRADE_LABELS, STATUS_LABELS } from "@/lib/constants";
import CandidatePipelines from "./candidate-pipelines";

// ── Types ────────────────────────────────────────────────────────────

interface Experience {
  id: string;
  company: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  keyAchievements: string[];
  isBigtech: boolean;
  isStudio: boolean;
}

interface Note {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface VacancyMatch {
  id: string;
  overallScore: number;
  matchExplanation: string;
  strengthsForVacancy: string[];
  gaps: string[];
  vacancy: {
    id: string;
    title: string;
    status: string;
  };
}

interface CandidateDetail {
  id: string;
  name: string;
  role: string;
  grade: string;
  status: string;
  yearsOfExperience: number | null;
  specializations: string[];
  domains: string[];
  segment: string | null;
  platforms: string[];
  skills: string[];
  tools: string[];
  location: string | null;
  timezone: string | null;
  languages: { lang: string; level: string }[] | null;
  salaryExpectations: string | null;
  education: string | null;
  hasBigtechExperience: boolean;
  hasStudioExperience: boolean;
  hasInternationalExperience: boolean;
  aiSummary: string | null;
  aiStrengths: string[];
  aiConcerns: string[];
  aiConfidenceScore: number | null;
  telegramContact: string | null;
  email: string | null;
  linkedinUrl: string | null;
  portfolioLinks: string[];
  experiences: Experience[];
  notes: Note[];
  matchResults: VacancyMatch[];
  triageStatus: string;
  createdAt: string;
  visualStrength: number | null;
  uxStrength: number | null;
  productMaturity: number | null;
  systemThinking: number | null;
  argumentationQuality: number | null;
  metricsImpact: number | null;
  researchDepth: number | null;
  portfolioAnalysis: PortfolioAnalysisData | null;
}

interface PortfolioAnalysisData {
  /** "product" или "communication" — определяет набор шкал. Может быть undefined в старых записях. */
  direction?: "product" | "communication";
  scores: Record<string, number | null>;
  scoreExplanations: Record<string, string>;
  cases: {
    title: string;
    description: string;
    strengths: string[];
    concerns: string[];
  }[];
  overallAssessment: string;
  redFlags: string[];
  strengths: string[];
  concerns: string[];
  screenshotsAnalyzed?: number;
  analyzedAt?: string;
}

interface EditDraft {
  name: string;
  role: string;
  grade: string;
  status: string;
  yearsOfExperience: string;
  segment: string;
  specializations: string[];
  domains: string[];
  platforms: string[];
  skills: string[];
  tools: string[];
  location: string;
  timezone: string;
  salaryExpectations: string;
  education: string;
  telegramContact: string;
  email: string;
  linkedinUrl: string;
  portfolioLinks: string[];
  hasBigtechExperience: boolean;
  hasStudioExperience: boolean;
  hasInternationalExperience: boolean;
  aiSummary: string;
  aiStrengths: string[];
  aiConcerns: string[];
  languages: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function buildRecommendation(candidate: CandidateDetail): string {
  const domains = candidate.domains.slice(0, 3);
  if (domains.length >= 2) {
    return `Отлично подходит для продуктовых команд в сферах ${domains.slice(0, -1).join(", ")} и ${domains[domains.length - 1]}.`;
  }
  if (domains.length === 1) {
    return `Подходит для продуктовых команд в сфере ${domains[0]}.`;
  }
  const specs = candidate.specializations.slice(0, 2);
  if (specs.length > 0) {
    return `Специализируется на ${specs.join(" и ")}.`;
  }
  if (candidate.aiSummary) {
    const sentences = candidate.aiSummary.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length > 1) return sentences[sentences.length - 1] + ".";
    return candidate.aiSummary.slice(0, 140);
  }
  return `${GRADE_LABELS[candidate.grade] || candidate.grade} ${ROLE_LABELS[candidate.role] || candidate.role}.`;
}

function splitLeadText(text: string): { lead: string; rest: string } {
  const parenMatch = text.match(/^([^(]{10,60}?)\s*(\(.+)$/);
  if (parenMatch) return { lead: parenMatch[1].replace(/[.:,]+$/, "").trim(), rest: parenMatch[2].trim() };
  const dashMatch = text.match(/^(.{10,60}?)\s*[—–:]\s*(.+)$/s);
  if (dashMatch) return { lead: dashMatch[1].replace(/[.:,]+$/, "").trim(), rest: dashMatch[2].trim() };
  const words = text.split(" ");
  if (words.length > 5) {
    const cutoff = Math.min(5, words.length - 2);
    return { lead: words.slice(0, cutoff).join(" ").replace(/[.:,—–]+$/, ""), rest: words.slice(cutoff).join(" ") };
  }
  return { lead: "", rest: text };
}

// ── Main page ────────────────────────────────────────────────────────

export default function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matching, setMatching] = useState(false);
  const [matchDone, setMatchDone] = useState<{ matched: number } | null>(null);
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const [retryAnalysisError, setRetryAnalysisError] = useState<string | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const runMatching = async () => {
    if (!candidate) return;
    setMatching(true);
    setMatchDone(null);
    try {
      const res = await fetch(`/api/candidates/${id}/match-vacancies`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMatchDone({ matched: data.matched });
        await fetchCandidate();
      }
    } finally {
      setMatching(false);
    }
  };

  const handleRetryAnalysis = async () => {
    if (!candidate) return;
    setRetryingAnalysis(true);
    setRetryAnalysisError(null);
    try {
      const res = await fetch(`/api/candidates/${id}/analyze-import`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось повторить анализ");
      await fetchCandidate();
    } catch (err) {
      setRetryAnalysisError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRetryingAnalysis(false);
    }
  };

  const fetchCandidate = async () => {
    try {
      const res = await fetch(`/api/candidates/${id}`);
      if (!res.ok) throw new Error("Не найден");
      const data = await res.json();
      setCandidate(data);
    } catch {
      setError("Кандидат не найден");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startEdit = () => {
    if (!candidate) return;
    setDraft({
      name: candidate.name,
      role: candidate.role,
      grade: candidate.grade,
      status: candidate.status,
      yearsOfExperience: candidate.yearsOfExperience?.toString() ?? "",
      segment: candidate.segment ?? "",
      specializations: [...candidate.specializations],
      domains: [...candidate.domains],
      platforms: [...candidate.platforms],
      skills: [...candidate.skills],
      tools: [...candidate.tools],
      location: candidate.location ?? "",
      timezone: candidate.timezone ?? "",
      salaryExpectations: candidate.salaryExpectations ?? "",
      education: candidate.education ?? "",
      telegramContact: candidate.telegramContact ?? "",
      email: candidate.email ?? "",
      linkedinUrl: candidate.linkedinUrl ?? "",
      portfolioLinks: [...candidate.portfolioLinks],
      hasBigtechExperience: candidate.hasBigtechExperience,
      hasStudioExperience: candidate.hasStudioExperience,
      hasInternationalExperience: candidate.hasInternationalExperience,
      aiSummary: candidate.aiSummary ?? "",
      aiStrengths: [...candidate.aiStrengths],
      aiConcerns: [...candidate.aiConcerns],
      languages: candidate.languages
        ? (candidate.languages as { lang: string; level: string }[])
            .map((l) => `${l.lang} ${l.level}`)
            .join(", ")
        : "",
    });
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!draft || !candidate) return;
    setSaving(true);
    try {
      const languages = draft.languages.trim()
        ? draft.languages
            .split(",")
            .map((s) => {
              const parts = s.trim().split(/\s+/);
              const level = parts.pop() ?? "";
              const lang = parts.join(" ");
              return { lang, level };
            })
            .filter((l) => l.lang)
        : null;

      const body = {
        name: draft.name,
        role: draft.role,
        grade: draft.grade,
        status: draft.status,
        yearsOfExperience: draft.yearsOfExperience !== "" ? parseInt(draft.yearsOfExperience) : null,
        segment: draft.segment || null,
        specializations: draft.specializations,
        domains: draft.domains,
        platforms: draft.platforms,
        skills: draft.skills,
        tools: draft.tools,
        location: draft.location || null,
        timezone: draft.timezone || null,
        salaryExpectations: draft.salaryExpectations || null,
        education: draft.education || null,
        telegramContact: draft.telegramContact || null,
        email: draft.email || null,
        linkedinUrl: draft.linkedinUrl || null,
        portfolioLinks: draft.portfolioLinks,
        hasBigtechExperience: draft.hasBigtechExperience,
        hasStudioExperience: draft.hasStudioExperience,
        hasInternationalExperience: draft.hasInternationalExperience,
        aiSummary: draft.aiSummary || null,
        aiStrengths: draft.aiStrengths,
        aiConcerns: draft.aiConcerns,
        languages,
      };

      const res = await fetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const updated = await res.json();
        setCandidate((prev) => (prev ? { ...prev, ...updated } : prev));
        setEditMode(false);
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const setDraftField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">{error || "Не найден"}</p>
        <Link href="/candidates">
          <Button variant="outline" size="sm">К списку</Button>
        </Link>
      </div>
    );
  }

  const topMatch = candidate.matchResults.length > 0
    ? [...candidate.matchResults].sort((a, b) => b.overallScore - a.overallScore)[0]
    : null;

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between bg-card px-6 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Кандидаты
        </Link>
        <div className="flex items-center gap-2">
          {!editMode ? (
            <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Редактировать
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>Отмена</Button>
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? "Сохраняю..." : "Сохранить"}
              </Button>
            </>
          )}
        </div>
      </div>

      {editMode && draft ? (
        /* ── EDIT MODE ─────────────────────────────────────────── */
        <div className="mx-auto max-w-2xl px-6 pb-16 mt-6">
          <EditForm draft={draft} setDraftField={setDraftField} />
        </div>
      ) : (
        /* ── VIEW MODE ──────────────────────────────────────── */
        <div className="mx-auto max-w-[1080px] px-6 pb-16">

          {/* ── Header card ── */}
          <div className="mt-6 mb-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-8">
                  {/* Identity */}
                  <div className="flex gap-5 flex-1 min-w-0">
                    <div className="h-[72px] w-[72px] shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-[28px] font-bold text-primary-foreground shadow-sm">
                      {candidate.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h1 className="text-[26px] font-bold tracking-tight leading-tight">{candidate.name}</h1>
                      <p className="text-sm text-muted-foreground mt-0.5">{ROLE_LABELS[candidate.role] || candidate.role}</p>
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{GRADE_LABELS[candidate.grade] || candidate.grade}</span>
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{STATUS_LABELS[candidate.status] || candidate.status}</span>
                        {candidate.portfolioLinks[0] && (
                          <a
                            href={candidate.portfolioLinks[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-0.5 text-xs hover:bg-secondary transition-colors"
                          >
                            Портфолио
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                              <polyline points="15 3 21 3 21 9"/>
                              <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </a>
                        )}
                      </div>
                      {candidate.aiSummary && (
                        <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed line-clamp-2">
                          {candidate.aiSummary}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Match score */}
                  {topMatch && (
                    <div className="border-l border-border pl-7 shrink-0 w-44">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Match Score</p>
                      <div className="mt-1.5 flex items-baseline gap-0.5">
                        <span className="text-[50px] font-bold leading-none text-[#F97029]">{topMatch.overallScore}</span>
                        <span className="text-xl font-bold text-[#F97029] self-end mb-1.5">%</span>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-[#F97029] transition-all" style={{ width: `${topMatch.overallScore}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {topMatch.overallScore >= 75 ? "Хорошее соответствие" : topMatch.overallScore >= 50 ? "Среднее соответствие" : "Слабое соответствие"}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Two-column grid ── */}
          <div className="grid grid-cols-[1fr_272px] gap-4 items-start">

            {/* ── Left main ── */}
            <div className="space-y-3 min-w-0">

              {/* Action row */}
              <Card>
                <CardContent className="px-5 py-0 h-14 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Button onClick={runMatching} disabled={matching} size="sm">
                      {matching ? (
                        <span className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                          Анализирую вакансии...
                        </span>
                      ) : (
                        "Проверить по всем вакансиям"
                      )}
                    </Button>
                    {candidate.status === "ANALYSIS_FAILED" && (
                      <Button onClick={handleRetryAnalysis} disabled={retryingAnalysis} variant="outline" size="sm">
                        {retryingAnalysis ? "Анализируем..." : "Повторить анализ"}
                      </Button>
                    )}
                    {retryAnalysisError && (
                      <span className="text-xs text-red-500">{retryAnalysisError}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {matchDone !== null && (
                      <span>{matchDone.matched > 0 ? `Подошёл к ${matchDone.matched} вакансиям` : "Не подошёл ни к одной"}</span>
                    )}
                    {candidate.aiConfidenceScore != null && (
                      <span>Уверенность парсинга: {candidate.aiConfidenceScore}%</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* AI Summary */}
              {candidate.aiSummary && (
                <Card>
                  <CardContent className="p-5">
                    <SectionHeaderIcon
                      icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>}
                      title="AI-Резюме"
                    />
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{candidate.aiSummary}</p>
                  </CardContent>
                </Card>
              )}

              {/* Basic info */}
              <Card>
                <CardContent className="p-5">
                  <SectionHeaderIcon
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>}
                    title="Основная информация"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <InfoRow label="Роль" value={ROLE_LABELS[candidate.role] || candidate.role} />
                    <InfoRow label="Грейд" value={GRADE_LABELS[candidate.grade] || candidate.grade} />
                    {candidate.yearsOfExperience != null && (
                      <InfoRow label="Опыт" value={`${candidate.yearsOfExperience} лет`} />
                    )}
                    {candidate.segment && <InfoRow label="Сегмент" value={candidate.segment} />}
                    {candidate.platforms.length > 0 && (
                      <InfoRow label="Платформы" value={candidate.platforms.join(", ")} />
                    )}
                    {candidate.location && <InfoRow label="Локация" value={candidate.location} />}
                    {candidate.timezone && <InfoRow label="Часовой пояс" value={candidate.timezone} />}
                    {candidate.education && <InfoRow label="Образование" value={candidate.education} />}
                    {candidate.salaryExpectations && (
                      <InfoRow label="Зарплата" value={candidate.salaryExpectations} />
                    )}
                    {candidate.languages && Array.isArray(candidate.languages) && (
                      <InfoRow
                        label="Языки"
                        value={(candidate.languages as { lang: string; level: string }[])
                          .map((l) => `${l.lang} (${l.level})`).join(", ")}
                      />
                    )}
                  </div>
                  {(candidate.hasBigtechExperience || candidate.hasStudioExperience || candidate.hasInternationalExperience) && (
                    <div className="flex gap-3 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/60">
                      {candidate.hasBigtechExperience && <span>✓ BigTech</span>}
                      {candidate.hasStudioExperience && <span>✓ Студия</span>}
                      {candidate.hasInternationalExperience && <span>✓ Международный опыт</span>}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Skills block */}
              {(candidate.specializations.length > 0 || candidate.skills.length > 0 || candidate.tools.length > 0 || candidate.domains.length > 0) && (
                <Card>
                  <CardContent className="p-5 space-y-5">
                    {candidate.specializations.length > 0 && (
                      <div>
                        <SectionHeaderIcon
                          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}
                          title="Специализации"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {candidate.specializations.map((s) => (
                            <span key={s} className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {candidate.skills.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2.5 mb-3">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#F97029] shrink-0" />
                          <span className="t-card-title">Навыки</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.skills.map((s) => (
                            <span key={s} className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-xs">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {candidate.tools.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2.5 mb-3">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#F97029] shrink-0" />
                          <span className="t-card-title">Инструменты</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {candidate.tools.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-card [box-shadow:var(--shadow-card)] px-3 py-1 text-xs font-semibold">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {candidate.domains.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2.5 mb-3">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#F97029] shrink-0" />
                          <span className="t-card-title">Домены</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.domains.map((d) => (
                            <span key={d} className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Experiences */}
              {candidate.experiences.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <SectionHeaderIcon
                      icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>}
                      title="Компании"
                    />
                    <div className="mt-3">
                      <CompaniesBlock experiences={candidate.experiences} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Portfolio analysis */}
              {candidate.portfolioAnalysis && (
                <PortfolioAnalysisCard
                  analysis={candidate.portfolioAnalysis}
                  candidateId={candidate.id}
                  hasPortfolioLink={candidate.portfolioLinks.length > 0}
                  onUpdated={fetchCandidate}
                />
              )}

              {/* Portfolio links */}
              {candidate.portfolioLinks.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <SectionHeaderIcon
                      icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
                      title="Портфолио"
                    />
                    <ul className="mt-3 space-y-1.5">
                      {candidate.portfolioLinks.map((link, i) => (
                        <li key={i}>
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-[#F97029] hover:opacity-80 transition-opacity break-all">
                            {link}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Contacts */}
              {(candidate.email || candidate.telegramContact || candidate.linkedinUrl) && (
                <Card>
                  <CardContent className="p-5">
                    <SectionHeaderIcon
                      icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                      title="Контакты"
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {candidate.email && (
                        <div>
                          <span className="text-muted-foreground">Email: </span>
                          <a href={`mailto:${candidate.email}`} className="text-[#F97029] hover:opacity-80 transition-opacity">
                            {candidate.email}
                          </a>
                        </div>
                      )}
                      {candidate.telegramContact && (
                        <div>
                          <span className="text-muted-foreground">Telegram: </span>
                          <a
                            href={`https://t.me/${candidate.telegramContact.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#F97029] hover:opacity-80 transition-opacity"
                          >
                            {candidate.telegramContact.startsWith("@") ? candidate.telegramContact : `@${candidate.telegramContact}`}
                          </a>
                        </div>
                      )}
                      {candidate.linkedinUrl && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">LinkedIn: </span>
                          <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[#F97029] hover:opacity-80 transition-opacity break-all">
                            {candidate.linkedinUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              <NotesSection candidateId={candidate.id} notes={candidate.notes} />
            </div>

            {/* ── Right sidebar ── */}
            <div className="space-y-3">

              {/* Strengths */}
              {candidate.aiStrengths.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <svg className="text-[#F97029] shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                      </svg>
                      <span className="t-card-title">Сильные стороны</span>
                    </div>
                    <ul className="space-y-2.5">
                      {candidate.aiStrengths.map((s, i) => {
                        const { lead, rest } = splitLeadText(s);
                        return (
                          <li key={i} className="flex gap-2 text-sm">
                            <svg className="text-emerald-500 shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            <span>
                              {lead && <span className="font-semibold">{lead} </span>}
                              <span className="text-muted-foreground">{rest || s}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Growth zones */}
              {candidate.aiConcerns.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <svg className="text-[#F97029] shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                        <polyline points="17 6 23 6 23 12"/>
                      </svg>
                      <span className="t-card-title">Зоны роста</span>
                    </div>
                    <ul className="space-y-2.5">
                      {candidate.aiConcerns.map((c, i) => {
                        const { lead, rest } = splitLeadText(c);
                        return (
                          <li key={i} className="flex gap-2 text-sm items-start">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
                            <span>
                              {lead && <span className="font-semibold">{lead} </span>}
                              <span className="text-muted-foreground">{rest || c}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Recommendation */}
              {(candidate.domains.length > 0 || candidate.specializations.length > 0 || candidate.aiSummary) && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <svg className="text-[#F97029] shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                      <span className="t-card-title">Рекомендация</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{buildRecommendation(candidate)}</p>
                  </CardContent>
                </Card>
              )}

              {/* Pipeline triage + active vacancies */}
              <CandidatePipelines candidateId={candidate.id} initialTriageStatus={candidate.triageStatus} />

              {/* Vacancy matches */}
              {candidate.matchResults && candidate.matchResults.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <svg className="text-[#F97029] shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                      </svg>
                      <span className="t-card-title">Вакансии</span>
                    </div>
                    <div className="space-y-2">
                      {[...candidate.matchResults]
                        .sort((a, b) => b.overallScore - a.overallScore)
                        .map((m) => (
                          <Link
                            key={m.id}
                            href={`/vacancies/${m.vacancy.id}`}
                            className="flex items-center gap-2.5 [border-radius:var(--r-button)] border px-3 py-2.5 hover:bg-muted/50 transition-colors group"
                          >
                            <div className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-xs font-semibold text-white ${m.overallScore >= 75 ? "bg-emerald-500" : m.overallScore >= 50 ? "bg-amber-500" : "bg-red-500"}`}>
                              {m.overallScore}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.vacancy.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {m.matchExplanation?.slice(0, 55)}{m.matchExplanation && m.matchExplanation.length > 55 ? "..." : ""}
                              </p>
                            </div>
                          </Link>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section header with icon ──────────────────────────────────────────

function SectionHeaderIcon({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-primary">
        {icon}
      </div>
      <span className="t-card-title">{title}</span>
    </div>
  );
}

// ── Edit Form ─────────────────────────────────────────────────────────

function EditForm({
  draft,
  setDraftField,
}: {
  draft: EditDraft;
  setDraftField: <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle>Профиль</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Роль">
              <select
                value={draft.role}
                onChange={(e) => setDraftField("role", e.target.value)}
                className="w-full h-9 [border-radius:var(--r-button)] border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Object.entries(ROLE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Грейд">
              <select
                value={draft.grade}
                onChange={(e) => setDraftField("grade", e.target.value)}
                className="w-full h-9 [border-radius:var(--r-button)] border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Object.entries(GRADE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Статус">
              <select
                value={draft.status}
                onChange={(e) => setDraftField("status", e.target.value)}
                className="w-full h-9 [border-radius:var(--r-button)] border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Сегмент">
              <select
                value={draft.segment}
                onChange={(e) => setDraftField("segment", e.target.value)}
                className="w-full h-9 [border-radius:var(--r-button)] border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">—</option>
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
                <option value="BOTH">B2B + B2C</option>
              </select>
            </FormField>
            <FormField label="Опыт (лет)">
              <Input
                type="number"
                min={0}
                max={50}
                value={draft.yearsOfExperience}
                onChange={(e) => setDraftField("yearsOfExperience", e.target.value)}
                className="h-9 text-sm"
                placeholder="0"
              />
            </FormField>
            <FormField label="Платформы">
              <TagInput
                values={draft.platforms}
                onChange={(v) => setDraftField("platforms", v)}
                placeholder="web, mobile..."
              />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            {(
              [
                ["hasBigtechExperience", "BigTech опыт"],
                ["hasStudioExperience", "Опыт в студии"],
                ["hasInternationalExperience", "Международный опыт"],
              ] as [keyof EditDraft, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft[key] as boolean}
                  onChange={(e) => setDraftField(key, e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-foreground"
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <SectionTitle>Контакты и местонахождение</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email">
              <Input value={draft.email} onChange={(e) => setDraftField("email", e.target.value)} className="h-9 text-sm" placeholder="email@example.com" />
            </FormField>
            <FormField label="Telegram">
              <Input value={draft.telegramContact} onChange={(e) => setDraftField("telegramContact", e.target.value)} className="h-9 text-sm" placeholder="@username" />
            </FormField>
            <FormField label="LinkedIn" className="col-span-2">
              <Input value={draft.linkedinUrl} onChange={(e) => setDraftField("linkedinUrl", e.target.value)} className="h-9 text-sm" placeholder="https://linkedin.com/in/..." />
            </FormField>
            <FormField label="Локация">
              <Input value={draft.location} onChange={(e) => setDraftField("location", e.target.value)} className="h-9 text-sm" placeholder="Москва" />
            </FormField>
            <FormField label="Часовой пояс">
              <Input value={draft.timezone} onChange={(e) => setDraftField("timezone", e.target.value)} className="h-9 text-sm" placeholder="UTC+3" />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle>Навыки и специализации</SectionTitle>
          <FormField label="Специализации">
            <TagInput values={draft.specializations} onChange={(v) => setDraftField("specializations", v)} placeholder="Добавить специализацию..." />
          </FormField>
          <FormField label="Навыки">
            <TagInput values={draft.skills} onChange={(v) => setDraftField("skills", v)} placeholder="Добавить навык..." />
          </FormField>
          <FormField label="Инструменты">
            <TagInput values={draft.tools} onChange={(v) => setDraftField("tools", v)} placeholder="Figma, Miro..." />
          </FormField>
          <FormField label="Домены">
            <TagInput values={draft.domains} onChange={(v) => setDraftField("domains", v)} placeholder="fintech, e-commerce..." />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle>AI-анализ</SectionTitle>
          <FormField label="AI-резюме">
            <textarea
              value={draft.aiSummary}
              onChange={(e) => setDraftField("aiSummary", e.target.value)}
              rows={4}
              className="w-full [border-radius:var(--r-button)] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Краткое описание кандидата..."
            />
          </FormField>
          <FormField label="Сильные стороны">
            <TagInput values={draft.aiStrengths} onChange={(v) => setDraftField("aiStrengths", v)} placeholder="Добавить сильную сторону..." />
          </FormField>
          <FormField label="Риски и пробелы">
            <TagInput values={draft.aiConcerns} onChange={(v) => setDraftField("aiConcerns", v)} placeholder="Добавить риск или пробел..." />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <SectionTitle>Дополнительно</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Образование" className="col-span-2">
              <Input value={draft.education} onChange={(e) => setDraftField("education", e.target.value)} className="h-9 text-sm" placeholder="МГУ, Факультет..." />
            </FormField>
            <FormField label="Зарплатные ожидания">
              <Input value={draft.salaryExpectations} onChange={(e) => setDraftField("salaryExpectations", e.target.value)} className="h-9 text-sm" placeholder="150 000 ₽" />
            </FormField>
            <FormField label="Языки">
              <Input value={draft.languages} onChange={(e) => setDraftField("languages", e.target.value)} className="h-9 text-sm" placeholder="English C1, Russian Native" />
            </FormField>
          </div>
          <FormField label="Портфолио">
            <TagInput values={draft.portfolioLinks} onChange={(v) => setDraftField("portfolioLinks", v)} placeholder="https://..." />
          </FormField>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tag Input ──────────────────────────────────────────────────────────

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const val = input.trim();
    if (val && !values.includes(val)) onChange([...values, val]);
    setInput("");
  };

  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div
      className="flex flex-wrap gap-1.5 [border-radius:var(--r-button)] border border-input bg-background p-1.5 min-h-9 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
          {v}
          <button type="button" onClick={(e) => { e.stopPropagation(); remove(i); }} className="text-muted-foreground hover:text-foreground leading-none">×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={values.length === 0 ? placeholder : ""}
        className="flex-1 min-w-28 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-0.5 px-1"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !input && values.length > 0) remove(values.length - 1);
        }}
        onBlur={add}
      />
    </div>
  );
}

// ── Form Field ─────────────────────────────────────────────────────────

function FormField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

// ── Notes ───────────────────────────────────────────────────────────

function NotesSection({ candidateId, notes: initialNotes }: { candidateId: string; notes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [saving, setSaving] = useState(false);

  const addNote = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), authorName: authorName.trim() }),
      });
      if (res.ok) {
        const note = await res.json();
        setNotes([note, ...notes]);
        setContent("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <SectionHeaderIcon
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
          title="Заметки"
        />
        <div className="flex gap-2">
          <Input placeholder="Имя автора" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-36" />
          <Input
            placeholder="Текст заметки..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) addNote(); }}
          />
          <Button onClick={addNote} disabled={saving || !content.trim()} size="sm">Добавить</Button>
        </div>
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Пока нет заметок</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="border-t pt-3 first:border-0 first:pt-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{note.authorName}</span>
                  <span>{new Date(note.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 text-sm">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Companies ─────────────────────────────────────────────────────────

function CompaniesBlock({ experiences }: { experiences: Experience[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (experiences.length === 0) return null;
  return (
    <div className="space-y-2">
      {experiences.map((exp, i) => {
        const isOpen = expanded === i;
        const type = exp.isBigtech
          ? { label: "BigTech", color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" }
          : exp.isStudio
            ? { label: "Студия", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" }
            : { label: "Продукт", color: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" };
        return (
          <div key={exp.id}>
            <button
              onClick={() => setExpanded(isOpen ? null : i)}
              className="w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                {exp.company.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{exp.company}</p>
                <p className="text-xs text-muted-foreground truncate">{exp.role}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {exp.duration && <span className="text-xs text-muted-foreground">{exp.duration}</span>}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${type.color}`}>{type.label}</span>
              </div>
            </button>
            {isOpen && exp.keyAchievements.length > 0 && (
              <div className="mt-1 ml-11 rounded-lg bg-muted/40 px-4 py-3">
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {exp.keyAchievements.map((a, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="mt-0.5 shrink-0 text-muted-foreground/50">·</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-section-label mb-2">{children}</p>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

// ── Portfolio Visual Analysis Card ────────────────────────────────────

const PRODUCT_SCORE_LABELS: Record<string, string> = {
  visualStrength: "Визуал",
  uxStrength: "UX",
  productMaturity: "Продуктовое мышление",
  systemThinking: "Системность",
  argumentationQuality: "Аргументация",
  metricsImpact: "Метрики/импакт",
  researchDepth: "Глубина исследований",
};

const COMM_SCORE_LABELS: Record<string, string> = {
  visualCraft: "Мастерство визуала",
  conceptStrength: "Сила концепции",
  typography: "Типографика",
  brandSystems: "Бренд-системы",
  styleRange: "Диапазон стилей",
  presentation: "Подача кейсов",
  trendRelevance: "Актуальность",
};

function PortfolioAnalysisCard({
  analysis,
  candidateId,
  hasPortfolioLink,
  onUpdated,
}: {
  analysis: PortfolioAnalysisData;
  candidateId: string;
  hasPortfolioLink: boolean;
  onUpdated: () => void | Promise<void>;
}) {
  const [openCase, setOpenCase] = useState<number | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);

  const handleReanalyze = async () => {
    setReanalyzing(true);
    setReanalyzeError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/reanalyze-portfolio`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось перепроанализировать");
      await onUpdated();
    } catch (err) {
      setReanalyzeError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setReanalyzing(false);
    }
  };

  const isComm = analysis.direction === "communication";
  const scoreLabels = isComm ? COMM_SCORE_LABELS : PRODUCT_SCORE_LABELS;

  const scoreEntries = Object.keys(scoreLabels).map((key) => ({
    key,
    label: scoreLabels[key],
    value: analysis.scores[key] ?? null,
    explanation: analysis.scoreExplanations?.[key] ?? "",
  }));

  const validScores = scoreEntries.filter((s) => s.value !== null);
  const avgScore = validScores.length > 0
    ? Math.round(validScores.reduce((sum, s) => sum + (s.value as number), 0) / validScores.length)
    : null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <SectionHeaderIcon
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>}
              title="Анализ портфолио"
            />
            {isComm ? (
              <span className="inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700">
                Коммуникационный
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                Продуктовый
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasPortfolioLink && (
              <Button onClick={handleReanalyze} disabled={reanalyzing} variant="outline" size="sm">
                {reanalyzing ? "Анализируем..." : "Перепроанализировать"}
              </Button>
            )}
            {avgScore !== null && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight">{avgScore}</span>
                <span className="text-xs text-muted-foreground">средняя</span>
              </div>
            )}
          </div>
        </div>
        {reanalyzeError && <p className="mb-3 text-xs text-red-500">{reanalyzeError}</p>}

        <div className="space-y-3 mb-5">
          {scoreEntries.map((s) => (
            <ScoreBar key={s.key as string} label={s.label} value={s.value} explanation={s.explanation} />
          ))}
        </div>

        {analysis.overallAssessment && (
          <div className="mb-5 rounded-xl bg-secondary/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Общее впечатление</p>
            <p className="text-sm leading-relaxed">{analysis.overallAssessment}</p>
          </div>
        )}

        {(analysis.strengths.length > 0 || analysis.concerns.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {analysis.strengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">Сильные стороны</p>
                <ul className="space-y-1 text-sm">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-emerald-500 shrink-0">+</span><span>{s}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.concerns.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1.5">Опасения</p>
                <ul className="space-y-1 text-sm">
                  {analysis.concerns.map((c, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-amber-500 shrink-0">−</span><span>{c}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {analysis.redFlags.length > 0 && (
          <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive mb-1.5">Red flags</p>
            <ul className="space-y-1 text-sm">
              {analysis.redFlags.map((rf, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-destructive shrink-0">⚠</span><span>{rf}</span></li>
              ))}
            </ul>
          </div>
        )}

        {analysis.cases.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Разбор кейсов ({analysis.cases.length})</p>
            <div className="space-y-2">
              {analysis.cases.map((c, i) => {
                const isOpen = openCase === i;
                return (
                  <div key={i} className="rounded-xl border border-border/60 bg-background/40">
                    <button
                      type="button"
                      onClick={() => setOpenCase(isOpen ? null : i)}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-secondary/40 transition-colors rounded-xl"
                    >
                      <span className="text-sm font-medium truncate">{c.title}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-3.5 pb-3 pt-1 space-y-2">
                        {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                        {c.strengths.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">Что хорошо</p>
                            <ul className="space-y-0.5 text-sm">
                              {c.strengths.map((s, j) => <li key={j} className="flex gap-1.5"><span className="text-emerald-500 shrink-0">+</span><span>{s}</span></li>)}
                            </ul>
                          </div>
                        )}
                        {c.concerns.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">Что вызывает вопросы</p>
                            <ul className="space-y-0.5 text-sm">
                              {c.concerns.map((co, j) => <li key={j} className="flex gap-1.5"><span className="text-amber-500 shrink-0">−</span><span>{co}</span></li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {analysis.screenshotsAnalyzed && analysis.screenshotsAnalyzed > 0 && (
          <p className="mt-4 text-[11px] text-muted-foreground/70">Проанализировано {analysis.screenshotsAnalyzed} скриншотов</p>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBar({ label, value, explanation }: { label: string; value: number | null; explanation: string }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm w-44 shrink-0 text-muted-foreground/60">{label}</span>
        <span className="text-xs text-muted-foreground/60">нет данных</span>
      </div>
    );
  }

  const color = value >= 75 ? "bg-emerald-500" : value >= 55 ? "bg-primary" : value >= 35 ? "bg-amber-400" : "bg-destructive/60";

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-sm w-44 shrink-0">{label}</span>
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums w-9 text-right">{value}</span>
      </div>
      {explanation && (
        <p className="mt-1 ml-44 pl-3 text-[12px] text-muted-foreground/80 leading-snug">{explanation}</p>
      )}
    </div>
  );
}
