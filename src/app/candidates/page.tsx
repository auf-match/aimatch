"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ROLE_LABELS,
  GRADE_LABELS,
  STATUS_LABELS,
  PLATFORM_OPTIONS,
} from "@/lib/constants";
import AnalyzeBatchBar from "./analyze-batch-bar";

interface Candidate {
  id: string;
  name: string;
  role: string;
  grade: string;
  status: string;
  yearsOfExperience: number | null;
  location: string | null;
  email: string | null;
  specializations: string[];
  domains: string[];
  platforms: string[];
  skills: string[];
  tools: string[];
  aiSummary: string | null;
  aiConfidenceScore: number | null;
  createdAt: string;
  searchScore?: number;
  searchIndexed?: boolean;
}

interface SmartParsed {
  roles: string[] | null;
  grades: string[] | null;
  location: string | null;
  hasBigtech: true | null;
  semanticQuery: string;
  interpretation: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ROLES = Object.keys(ROLE_LABELS);
const GRADES = Object.keys(GRADE_LABELS);
const STATUSES = Object.keys(STATUS_LABELS);

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [grade, setGrade] = useState("");
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [page, setPage] = useState(1);

  // ── Семантический поиск «найди как» ──────────────────────────────
  const [smartInput, setSmartInput] = useState("");
  const [smartActive, setSmartActive] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartResults, setSmartResults] = useState<Candidate[]>([]);
  const [smartParsed, setSmartParsed] = useState<SmartParsed | null>(null);
  const [smartError, setSmartError] = useState("");

  const runSemantic = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setSmartActive(true);
    setSmartLoading(true);
    setSmartError("");
    try {
      const res = await fetch("/api/candidates/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      setSmartResults(data.data || []);
      setSmartParsed(data.parsed || null);
    } catch (err) {
      setSmartError(err instanceof Error ? err.message : "Ошибка поиска");
      setSmartResults([]);
    } finally {
      setSmartLoading(false);
    }
  }, []);

  const exitSmart = () => {
    setSmartActive(false);
    setSmartInput("");
    setSmartResults([]);
    setSmartParsed(null);
    setSmartError("");
    // Убрать ?q= из URL, не перезагружая страницу
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", "/candidates");
    }
  };

  // Прочитать ?q= при заходе с дашборда
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) {
      setSmartInput(q);
      runSemantic(q);
    }
  }, [runSemantic]);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (search) params.set("search", search);
    if (role) params.set("role", role);
    if (grade) params.set("grade", grade);
    if (status) params.set("status", status);
    if (platform) params.set("platform", platform);

    try {
      const res = await fetch(`/api/candidates?${params}`);
      const data = await res.json();
      setCandidates(data.data || []);
      setPagination(data.pagination);
    } catch {
      console.error("Failed to fetch candidates");
    } finally {
      setLoading(false);
    }
  }, [page, search, role, grade, status, platform]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);
  useEffect(() => { setPage(1); }, [search, role, grade, status, platform]);

  const hasFilters = !!(search || role || grade || status || platform);
  const clearFilters = () => {
    setSearch(""); setRole(""); setGrade(""); setStatus(""); setPlatform(""); setPage(1);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-card px-6 py-5 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Кандидаты</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pagination.total}{" "}
              {pluralize(pagination.total, "кандидат", "кандидата", "кандидатов")}
            </p>
          </div>
          <Link href="/candidates/upload">
            <Button size="sm" variant="accent">Загрузить кандидата</Button>
          </Link>
        </div>
      </div>

      <AnalyzeBatchBar />

      <div className="p-6 max-w-6xl">
        {/* Smart search bar */}
        <div className="mb-5">
          {/* Pill-контейнер с утопленным поиском */}
          <div className="flex items-center gap-2 max-w-2xl mb-2" style={{
            background: "var(--muted)",
            boxShadow: "var(--shadow-inset)",
            borderRadius: "var(--r-pill)",
            height: "48px",
            padding: "0 8px 0 16px",
          }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="shrink-0 text-muted-foreground/40"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={smartInput}
              onChange={(e) => setSmartInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSemantic(smartInput)}
              placeholder="Например: сеньор продуктовый с финтехом, желательно из bigtech"
              className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/40"
            />
            {smartActive && (
              <button
                onClick={exitSmart}
                className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground transition-colors px-2"
              >
                ✕
              </button>
            )}
            <button
              onClick={() => runSemantic(smartInput)}
              disabled={!smartInput.trim() || smartLoading}
              className="shrink-0 font-semibold text-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "#F97029",
                borderRadius: "var(--r-pill)",
                height: "34px",
                padding: "0 16px",
                transition: "opacity 0.2s",
              }}
            >
              {smartLoading ? "Ищу..." : "✦ Найти"}
            </button>
          </div>

          {/* Что AI понял */}
          {smartActive && smartParsed && !smartLoading && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {smartParsed.interpretation && (
                <span className="t-caption mr-1">{smartParsed.interpretation}</span>
              )}
              {smartParsed.roles?.map((r) => (
                <Chip key={r}>{ROLE_LABELS[r] || r}</Chip>
              ))}
              {smartParsed.grades && smartParsed.grades.length > 0 && (
                <Chip>{smartParsed.grades.map((g) => GRADE_LABELS[g] || g).join(" / ")}</Chip>
              )}
              {smartParsed.location && <Chip>{smartParsed.location}</Chip>}
              {smartParsed.hasBigtech && <Chip>bigtech</Chip>}
            </div>
          )}
        </div>

        {smartActive ? (
          <SmartResultsView
            loading={smartLoading}
            error={smartError}
            results={smartResults}
          />
        ) : (
        <>
        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени, email..."
              className="h-9 rounded-[var(--r-button)] border border-input bg-card pl-8 pr-3 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 focus:ring-3 focus:ring-primary/15 w-60 transition-[border-color,box-shadow]"
            />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-9 rounded-[var(--r-button)] border border-input bg-card px-3 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 transition-[border-color]"
          >
            <option value="">Все роли</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="h-9 rounded-[var(--r-button)] border border-input bg-card px-3 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 transition-[border-color]"
          >
            <option value="">Все грейды</option>
            {GRADES.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-[var(--r-button)] border border-input bg-card px-3 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 transition-[border-color]"
          >
            <option value="">Все статусы</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="h-9 rounded-[var(--r-button)] border border-input bg-card px-3 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 transition-[border-color]"
          >
            <option value="">Все платформы</option>
            {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              Сбросить
            </Button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <EmptyState text="Загрузка..." />
        ) : candidates.length === 0 ? (
          <EmptyState
            text={hasFilters ? "Ничего не найдено" : "Пока нет кандидатов"}
            action={!hasFilters && (
              <Link href="/candidates/upload">
                <Button variant="outline" size="sm">Загрузить первого кандидата</Button>
              </Link>
            )}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {candidates.map((c) => (
                <CandidateRow key={c.id} candidate={c} />
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between">
                <p className="text-sm text-muted-foreground tabular-nums">
                  Стр. {pagination.page} из {pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Назад
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center text-[11px] font-semibold"
      style={{
        borderRadius: "var(--r-pill)",
        background: "var(--card)",
        boxShadow: "var(--shadow-card)",
        padding: "3px 10px",
        color: "var(--foreground)",
      }}
    >
      {children}
    </span>
  );
}

function SmartResultsView({
  loading,
  error,
  results,
}: {
  loading: boolean;
  error: string;
  results: Candidate[];
}) {
  if (loading) return <EmptyState text="AI ищет подходящих кандидатов..." />;
  if (error) {
    return (
      <div className="rounded-2xl bg-card py-12 text-center shadow-[0_2px_12px_0_oklch(0_0_0/0.07),0_0_0_1px_oklch(0_0_0/0.04)]">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (results.length === 0) {
    return <EmptyState text="Ничего не нашлось по этому запросу" />;
  }
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Найдено {results.length}{" "}
        {pluralize(results.length, "кандидат", "кандидата", "кандидатов")}, отсортированы по релевантности
      </p>
      <div className="flex flex-col gap-3">
        {results.map((c) => (
          <CandidateRow key={c.id} candidate={c} showScore />
        ))}
      </div>
    </>
  );
}

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "pill--green",
  PORTFOLIO_ANALYZED: "pill--green",
  IN_PROCESS: "pill--blue",
  ANALYSIS_FAILED: "pill--red",
};

function CandidateRow({ candidate: c, showScore }: { candidate: Candidate; showScore?: boolean }) {
  const handleClick = (e: React.MouseEvent) => {
    if ((window.getSelection()?.toString().length ?? 0) > 0) {
      e.preventDefault();
    }
  };
  const score = c.searchScore ?? 0;
  const scoreColor = score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-muted-foreground/40";
  const statusPillClass = STATUS_PILL[c.status] ?? "";
  return (
    <Link
      href={`/candidates/${c.id}`}
      onClick={handleClick}
      className="group soft-card flex items-start gap-4 py-4 px-5 hover:shadow-[var(--shadow-clay)] transition-shadow"
    >
      {/* Score / Avatar */}
      {showScore && c.searchIndexed !== false ? (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${scoreColor}`}>
          {score}
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {c.name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold tracking-tight">{c.name}</span>
          <span
            className="inline-flex items-center text-[11px] font-semibold text-muted-foreground"
            style={{ borderRadius: "var(--r-pill)", background: "var(--secondary)", padding: "2px 8px" }}
          >
            {GRADE_LABELS[c.grade] || c.grade}
          </span>
          <span
            className={`inline-flex items-center text-[11px] font-semibold ${statusPillClass}`}
            style={!statusPillClass ? {
              borderRadius: "var(--r-pill)",
              background: "var(--secondary)",
              padding: "2px 8px",
              color: "var(--muted-foreground)",
            } : {
              borderRadius: "var(--r-pill)",
              padding: "2px 8px",
            }}
          >
            {STATUS_LABELS[c.status] || c.status}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {ROLE_LABELS[c.role] || c.role}
          {c.yearsOfExperience != null && ` · ${c.yearsOfExperience} лет`}
          {c.location && ` · ${c.location}`}
        </p>
        {c.aiSummary && (
          <p className="mt-1.5 text-[12.5px] text-muted-foreground/90 line-clamp-2 leading-relaxed">
            {c.aiSummary}
          </p>
        )}
        {c.domains.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {c.domains.slice(0, 4).map((d) => (
              <span
                key={d}
                className="text-[11px] font-medium text-muted-foreground"
                style={{
                  borderRadius: "var(--r-pill)",
                  background: "var(--card)",
                  boxShadow: "var(--shadow-card)",
                  padding: "2px 8px",
                }}
              >
                {d}
              </span>
            ))}
            {c.domains.length > 4 && (
              <span className="self-center text-[11px] text-muted-foreground">+{c.domains.length - 4}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {c.aiConfidenceScore != null && (
          <span className="text-xs tabular-nums text-muted-foreground">{c.aiConfidenceScore}%</span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30 group-hover:text-muted-foreground transition-colors">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}

function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="[border-radius:var(--r-card)] bg-card py-16 text-center [box-shadow:var(--shadow-clay)]">
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
