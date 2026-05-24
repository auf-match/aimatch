// src/app/candidates/upload/bulk/page.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirectionPicker } from "@/components/candidate-direction-picker";
import { DuplicateWarning } from "@/components/candidate-duplicate-warning";
import { parsePortfolioLinks } from "@/lib/parse-portfolio-links";
import { useBulkUpload } from "./use-bulk-upload";
import type { BulkRow } from "./use-bulk-upload";

export default function BulkUploadPage() {
  const {
    rows,
    running,
    phase,
    counts,
    addRow,
    removeRow,
    setUrl,
    start,
    stop,
    resolveDirection,
    resolveForceCreate,
    skipRow,
    retryRow,
  } = useBulkUpload();

  // Предупреждение при уходе во время обработки (только full-page reload)
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const handleStart = () => {
    const urls = parsePortfolioLinks(rows.map((r) => r.url));
    if (urls.length === 0) return;
    start(urls);
  };

  const validUrls = parsePortfolioLinks(rows.map((r) => r.url));

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between bg-card px-6 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <Link
          href="/candidates/upload"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Загрузка кандидатов
        </Link>
        {running && (
          <button
            onClick={stop}
            className="text-sm text-muted-foreground hover:text-destructive transition-colors"
          >
            Стоп
          </button>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-16">
        <div className="mt-8 mb-6">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            Загрузить пачкой
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Добавьте ссылки на портфолио — AI обработает каждого и создаст карточку
          </p>
        </div>

        {/* ── Phase: INPUT ─────────────────────────────────────── */}
        {phase === "input" && (
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.id} className="flex items-center gap-3">
                {/* Номер */}
                <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground/60">
                  {index + 1}
                </span>
                {/* Поле */}
                <Input
                  type="url"
                  placeholder="https://notion.so/..."
                  value={row.url}
                  onChange={(e) => setUrl(row.id, e.target.value)}
                  className="flex-1"
                />
                {/* Удалить */}
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(row.id)}
                    className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
                    aria-label="Удалить строку"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Добавить строку */}
            <button
              onClick={addRow}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors ml-8"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Добавить ещё кандидата
            </button>

            {/* Кнопка запуска */}
            <div className="pt-2">
              <Button
                onClick={handleStart}
                disabled={validUrls.length === 0}
                className="w-full"
                style={{ background: validUrls.length > 0 ? "#F97029" : undefined }}
              >
                {validUrls.length > 0
                  ? `Обработать ${validUrls.length} ${pluralLinks(validUrls.length)}`
                  : "Добавьте хотя бы одну ссылку"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Phase: PROCESSING / DONE ──────────────────────────── */}
        {(phase === "processing" || phase === "done") && (
          <div className="space-y-4">
            {/* Прогресс */}
            {phase === "processing" && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Обрабатываем {counts.processed} из {counts.total}…
                </span>
                <span className="text-muted-foreground/50 text-xs">
                  Это может занять до 3 минут на ссылку
                </span>
              </div>
            )}

            {/* Итог после завершения */}
            {phase === "done" && (
              <div className="soft-card flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-4 text-sm">
                  <span className="text-emerald-600 font-medium">✓ Создано {counts.created}</span>
                  {counts.review > 0 && (
                    <span className="text-amber-600 font-medium">⚠ На ревью {counts.review}</span>
                  )}
                  {counts.error > 0 && (
                    <span className="text-destructive font-medium">✕ Ошибок {counts.error}</span>
                  )}
                </div>
                <Link href="/candidates">
                  <Button variant="outline" size="sm">К списку кандидатов →</Button>
                </Link>
              </div>
            )}

            {/* Список строк */}
            <div className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <BulkRowView
                  key={row.id}
                  row={row}
                  index={index}
                  onResolveDirection={(dir) => resolveDirection(row.id, dir)}
                  onForceCreate={() => resolveForceCreate(row.id)}
                  onSkip={() => skipRow(row.id)}
                  onRetry={() => retryRow(row.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BulkRowView ───────────────────────────────────────────────────────

function BulkRowView({
  row,
  index,
  onResolveDirection,
  onForceCreate,
  onSkip,
  onRetry,
}: {
  row: BulkRow;
  index: number;
  onResolveDirection: (dir: "product" | "communication") => void;
  onForceCreate: () => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="soft-card space-y-3">
      {/* Заголовок строки */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground/50">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{row.url}</p>
          {row.status === "created" && row.candidate && (
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <Link
                href={`/candidates/${row.candidate.id}`}
                className="text-xs text-[#F97029] hover:underline"
              >
                {row.candidate.name}
              </Link>
              {row.noPortfolioAnalysis && (
                <span className="text-xs text-muted-foreground/60">· без анализа портфолио</span>
              )}
            </div>
          )}
          {row.status === "error" && row.error && (
            <p className="mt-0.5 text-xs text-destructive">{row.error}</p>
          )}
        </div>
        {/* Статус-значок */}
        <StatusBadge status={row.status} />
      </div>

      {/* Ревью-очередь: направление */}
      {row.status === "needs-direction" && row.needsDirection && (
        <div className="ml-8">
          <DirectionPicker
            info={row.needsDirection}
            onChoose={onResolveDirection}
            onReset={onSkip}
            resetLabel="Пропустить"
          />
        </div>
      )}

      {/* Ревью-очередь: дубликат */}
      {row.status === "duplicate" && row.duplicate && (
        <div className="ml-8">
          <DuplicateWarning
            duplicate={row.duplicate}
            onForceCreate={onForceCreate}
            onReset={onSkip}
            resetLabel="Пропустить"
          />
        </div>
      )}

      {/* Повтор при ошибке */}
      {row.status === "error" && (
        <div className="ml-8">
          <button
            onClick={onRetry}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Повторить
          </button>
        </div>
      )}
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  idle: "ожидает",
  pending: "ожидает",
  processing: "обрабатывается",
  created: "создан",
  "needs-direction": "на ревью",
  duplicate: "на ревью",
  skipped: "пропущен",
  error: "ошибка",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
  processing: "bg-blue-100 text-blue-700",
  created: "bg-[var(--tint-green-bg)] text-[var(--tint-green-fg)]",
  "needs-direction": "bg-amber-100 text-amber-700",
  duplicate: "bg-amber-100 text-amber-700",
  skipped: "bg-muted text-muted-foreground",
  error: "bg-red-100 text-red-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status === "processing" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function pluralLinks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "ссылок";
  if (mod10 === 1) return "ссылку";
  if (mod10 >= 2 && mod10 <= 4) return "ссылки";
  return "ссылок";
}
