"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ROLE_LABELS,
  GRADE_LABELS,
  VACANCY_STATUS_LABELS,
} from "@/lib/constants";

interface Vacancy {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  role: string;
  grade: string;
  employmentType: string;
  workFormat: string;
  location: string | null;
  salaryRange: string | null;
  designersNeeded: number;
  createdAt: string;
  _count: { matchResults: number; pipelines: number };
}

interface Pagination {
  page: number; limit: number; total: number; totalPages: number;
}

const STATUSES = Object.keys(VACANCY_STATUS_LABELS);
const ROLES = Object.keys(ROLE_LABELS);
const GRADES = Object.keys(GRADE_LABELS);

export default function VacanciesPage() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [grade, setGrade] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const fetchVacancies = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (search) params.set("search", search);
    if (role) params.set("role", role);
    if (grade) params.set("grade", grade);
    if (status) params.set("status", status);
    try {
      const res = await fetch(`/api/vacancies?${params}`);
      const data = await res.json();
      setVacancies(data.data || []);
      setPagination(data.pagination);
    } catch { console.error("Failed to fetch vacancies"); }
    finally { setLoading(false); }
  }, [page, search, role, grade, status]);

  useEffect(() => { fetchVacancies(); }, [fetchVacancies]);
  useEffect(() => { setPage(1); }, [search, role, grade, status]);

  const hasFilters = !!(search || role || grade || status);
  const clearFilters = () => { setSearch(""); setRole(""); setGrade(""); setStatus(""); setPage(1); };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-card px-6 py-5 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Вакансии</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pagination.total}{" "}
              {pluralize(pagination.total, "вакансия", "вакансии", "вакансий")}
            </p>
          </div>
          <Link href="/vacancies/new">
            <Button size="sm" variant="accent">Создать вакансию</Button>
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-6xl">
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
              placeholder="Поиск по названию, клиенту..."
              className="h-9 [border-radius:var(--r-button)] border border-input bg-card pl-8 pr-3 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 focus:ring-3 focus:ring-primary/15 w-64 transition-[border-color,box-shadow]"
            />
          </div>
          {[
            { value: status, onChange: setStatus, options: STATUSES, labels: VACANCY_STATUS_LABELS, placeholder: "Все статусы" },
            { value: role, onChange: setRole, options: ROLES, labels: ROLE_LABELS, placeholder: "Все роли" },
            { value: grade, onChange: setGrade, options: GRADES, labels: GRADE_LABELS, placeholder: "Все грейды" },
          ].map(({ value, onChange, options, labels, placeholder }) => (
            <select
              key={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 [border-radius:var(--r-button)] border border-input bg-card px-3 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 transition-[border-color]"
            >
              <option value="">{placeholder}</option>
              {options.map((o) => <option key={o} value={o}>{(labels as Record<string,string>)[o]}</option>)}
            </select>
          ))}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              Сбросить
            </Button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <EmptyState text="Загрузка..." />
        ) : vacancies.length === 0 ? (
          <EmptyState
            text={hasFilters ? "Ничего не найдено" : "Пока нет вакансий"}
            action={!hasFilters && (
              <Link href="/vacancies/new"><Button variant="outline" size="sm">Создать первую вакансию</Button></Link>
            )}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {vacancies.map((v) => (
                <VacancyRow key={v.id} vacancy={v} />
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between">
                <p className="text-sm text-muted-foreground tabular-nums">Стр. {pagination.page} из {pagination.totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Назад</Button>
                  <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Вперёд</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VacancyRow({ vacancy: v }: { vacancy: Vacancy }) {
  const isOpen = v.status === "OPEN";
  const handleClick = (e: React.MouseEvent) => {
    if ((window.getSelection()?.toString().length ?? 0) > 0) {
      e.preventDefault();
    }
  };
  return (
    <Link
      href={`/vacancies/${v.id}`}
      onClick={handleClick}
      className="group soft-card flex items-center gap-4 py-4 px-5 hover:shadow-[var(--shadow-clay)] transition-shadow"
    >
      {/* Status dot */}
      <div className="shrink-0">
        <span className={`block h-2.5 w-2.5 rounded-full ${
          isOpen ? "bg-emerald-500" : v.status === "PAUSED" ? "bg-amber-400" : "bg-muted-foreground/30"
        }`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold tracking-tight">{v.title}</span>
          <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{GRADE_LABELS[v.grade] || v.grade}</span>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isOpen ? "text-[var(--tint-green-fg)] bg-[var(--tint-green-bg)]" : "border border-border bg-transparent text-foreground"}`}>
            {VACANCY_STATUS_LABELS[v.status] || v.status}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {ROLE_LABELS[v.role] || v.role}
          {v.clientName && ` · ${v.clientName}`}
          {v.location && ` · ${v.location}`}
        </p>
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
        {v._count.matchResults > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{v._count.matchResults} матч.</span>
        )}
        {v._count.pipelines > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{v._count.pipelines} в воронке</span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors">
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
