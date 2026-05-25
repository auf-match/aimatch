"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const EXAMPLES = [
  "сеньор продуктовый дизайнер с финтехом",
  "миддл из bigtech, опыт в e-commerce",
  "UX-исследователь, B2B, удалёнка",
  "дизайн-лид с опытом в стартапах",
  "коммуникационный дизайнер, брендинг",
];

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState({ candidates: 0, vacancies: 0 });
  const [query, setQuery] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/candidates?limit=1").then((r) => r.json()),
      fetch("/api/vacancies?limit=1").then((r) => r.json()),
    ]).then(([c, v]) => {
      setStats({
        candidates: c.pagination?.total ?? 0,
        vacancies: v.pagination?.total ?? 0,
      });
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 3000);
    return () => clearInterval(id);
  }, []);

  const handleSearch = () => {
    const q = query.trim();
    if (!q) return;
    router.push(`/candidates?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="p-8 max-w-2xl">

      {/* Header */}
      <div className="mb-10">
        <p className="t-eyebrow mb-3">✦ АУФ рекрутинг</p>
        <h1 className="text-[32px] font-bold leading-none" style={{ letterSpacing: "-0.02em" }}>
          АУФ Match
        </h1>
        <p className="t-body-muted mt-2">AI-система матчинга дизайнеров</p>
      </div>

      {/* Semantic search — pill-контейнер с утопленным поиском */}
      <div className="mb-10">
        <div
          className="flex items-center gap-2 w-full mb-2"
          style={{
            background: "var(--muted)",
            boxShadow: "var(--shadow-inset)",
            borderRadius: "var(--r-pill)",
            height: "54px",
            padding: "0 8px 0 18px",
          }}
        >
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-muted-foreground/40"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={`Например: ${EXAMPLES[exampleIdx]}`}
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/40"
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className="shrink-0 font-semibold text-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: query.trim() ? "#F97029" : "var(--muted-foreground)",
              boxShadow: query.trim() ? "var(--glow-accent)" : "none",
              borderRadius: "var(--r-pill)",
              height: "38px",
              padding: "0 20px",
              transition: "opacity 0.2s, box-shadow 0.2s",
            }}
          >
            ✦ Найти
          </button>
        </div>
        <p className="t-caption ml-2">
          Опишите нужного кандидата — AI найдёт подходящих из всей базы
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Кандидаты */}
        <div className="soft-card flex flex-col gap-4">
          <p className="t-eyebrow">Кандидатов</p>
          <div className="stat" style={{ fontSize: "44px" }}>
            <span className="stat__value">{stats.candidates}</span>
          </div>
          <Link
            href="/candidates"
            className="pill pill--outline self-start"
            style={{ height: "36px", padding: "0 14px", fontSize: "13px" }}
          >
            Смотреть всех →
          </Link>
        </div>

        {/* Вакансии */}
        <div className="soft-card flex flex-col gap-4">
          <p className="t-eyebrow">Вакансий</p>
          <div className="stat" style={{ fontSize: "44px" }}>
            <span className="stat__value">{stats.vacancies}</span>
          </div>
          <Link
            href="/vacancies"
            className="pill pill--outline self-start"
            style={{ height: "36px", padding: "0 14px", fontSize: "13px" }}
          >
            Смотреть все →
          </Link>
        </div>

        {/* Быстрые действия */}
        <div className="soft-card flex flex-col gap-3">
          <p className="t-eyebrow">Действия</p>
          <div className="flex flex-col gap-2 mt-1">
            <Link
              href="/candidates/upload"
              className="pill pill--outline flex justify-center"
              style={{ height: "40px", fontSize: "13px" }}
            >
              + Загрузить кандидатов
            </Link>
            <Link
              href="/vacancies/new"
              className="pill pill--outline flex justify-center"
              style={{ height: "40px", fontSize: "13px" }}
            >
              + Создать вакансию
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
