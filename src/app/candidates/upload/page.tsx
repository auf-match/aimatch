// src/app/candidates/upload/page.tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirectionPicker } from "@/components/candidate-direction-picker";
import { DuplicateWarning } from "@/components/candidate-duplicate-warning";
import { useBulkUpload, isRowValid } from "./use-bulk-upload";
import type { BulkRow } from "./use-bulk-upload";
import ImportJsonBlock from "./import-json-block";

export default function UploadPage() {
  const {
    rows,
    running,
    phase,
    counts,
    addRow,
    removeRow,
    setUrl,
    setFile,
    clearFile,
    start,
    stop,
    resolveDirection,
    resolveForceCreate,
    skipRow,
    retryRow,
  } = useBulkUpload();

  // Warn on full-page reload during processing (SPA navigation warning is a known limitation)
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  const validCount = rows.filter(isRowValid).length;

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between bg-card px-6 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Кандидаты
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
            Загрузить кандидатов
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Добавьте резюме и/или ссылку на портфолио — AI создаст карточку
          </p>
        </div>

        {/* ── Phase: INPUT ───────────────────────────────────────────── */}
        {phase === "input" && (
          <div>
            <div className="space-y-3 mb-3">
              {rows.map((row, index) => (
                <CandidateInputCard
                  key={row.id}
                  row={row}
                  index={index}
                  showDelete={rows.length > 1}
                  onSetUrl={(url) => setUrl(row.id, url)}
                  onSetFile={(file) => setFile(row.id, file)}
                  onClearFile={() => clearFile(row.id)}
                  onRemove={() => removeRow(row.id)}
                />
              ))}
            </div>

            <button
              onClick={addRow}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Добавить ещё кандидата
            </button>

            <Button
              onClick={start}
              disabled={validCount === 0}
              className="w-full"
              style={{ background: validCount > 0 ? "#F97029" : undefined }}
            >
              {validCount > 0
                ? `Обработать ${validCount} ${pluralCandidates(validCount)}`
                : "Добавьте файл или ссылку"}
            </Button>
          </div>
        )}

        {/* ── Phase: PROCESSING / DONE ────────────────────────────────── */}
        {(phase === "processing" || phase === "done") && (
          <div className="space-y-4">
            {phase === "processing" && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Обрабатываем {counts.processed} из {counts.total}…
                </span>
                <span className="text-muted-foreground/50 text-xs">
                  До 3 минут на кандидата
                </span>
              </div>
            )}

            {phase === "done" && (
              <div className="soft-card flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-4 text-sm">
                  <span className="text-emerald-600 font-medium">
                    ✓ Создано {counts.created}
                  </span>
                  {counts.review > 0 && (
                    <span className="text-amber-600 font-medium">
                      ⚠ На ревью {counts.review}
                    </span>
                  )}
                  {counts.error > 0 && (
                    <span className="text-destructive font-medium">
                      ✕ Ошибок {counts.error}
                    </span>
                  )}
                </div>
                <Link href="/candidates">
                  <Button variant="outline" size="sm">
                    К списку кандидатов →
                  </Button>
                </Link>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {rows
                .map((row, originalIndex) => ({ row, originalIndex }))
                .filter(({ row }) => row.status !== "idle")
                .map(({ row, originalIndex }) => (
                  <CandidateResultRow
                    key={row.id}
                    row={row}
                    index={originalIndex}
                    onResolveDirection={(dir) => resolveDirection(row.id, row, dir)}
                    onForceCreate={() => resolveForceCreate(row.id, row)}
                    onSkip={() => skipRow(row.id)}
                    onRetry={() => retryRow(row.id, row)}
                  />
                ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <ImportJsonBlock />
        </div>
      </div>
    </div>
  );
}

// ── CandidateInputCard ─────────────────────────────────────────────────

function CandidateInputCard({
  row,
  index,
  showDelete,
  onSetUrl,
  onSetFile,
  onClearFile,
  onRemove,
}: {
  row: BulkRow;
  index: number;
  showDelete: boolean;
  onSetUrl: (url: string) => void;
  onSetFile: (file: File) => void;
  onClearFile: () => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Кандидат {index + 1}
        </span>
        {showDelete && (
          <button
            onClick={onRemove}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-xl leading-none"
            aria-label="Удалить кандидата"
          >
            ×
          </button>
        )}
      </div>

      {/* File picker */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSetFile(f);
            // Reset value so the same file can be re-selected after clearing
            e.target.value = "";
          }}
        />
        {row.file ? (
          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-card">
            <SmallFileIcon />
            <span className="text-sm flex-1 truncate">{row.file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {(row.file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <button
              onClick={onClearFile}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-xl leading-none"
              aria-label="Убрать файл"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-2 border border-dashed border-border rounded-lg px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <SmallFileIcon />
            <span className="text-sm">Прикрепить резюме .pdf .docx</span>
          </button>
        )}
        {row.fileError && (
          <p className="mt-1 text-xs text-destructive">{row.fileError}</p>
        )}
      </div>

      {/* Portfolio URL */}
      <Input
        type="url"
        placeholder="Ссылка на портфолио..."
        value={row.url}
        onChange={(e) => onSetUrl(e.target.value)}
      />
    </div>
  );
}

// ── CandidateResultRow ─────────────────────────────────────────────────

function CandidateResultRow({
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
  // Subheading: show url if available; filename if file-only; never an empty string
  const trimmedUrl = row.url.trim();
  const subheading = trimmedUrl
    ? row.file
      ? `${row.file.name} · ${trimmedUrl}`
      : trimmedUrl
    : row.file
      ? row.file.name
      : "";

  return (
    <div className="soft-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Кандидат {index + 1}
            </span>
            <StatusBadge status={row.status} />
          </div>
          {subheading && (
            <p className="text-sm text-muted-foreground truncate">{subheading}</p>
          )}
          {row.status === "created" && row.candidate && (
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <Link
                href={`/candidates/${row.candidate.id}`}
                className="text-sm text-[#F97029] hover:underline font-medium"
              >
                {row.candidate.name}
              </Link>
              {row.noPortfolioAnalysis && (
                <span className="text-xs text-muted-foreground/60">
                  · без анализа портфолио
                </span>
              )}
            </div>
          )}
          {row.status === "error" && row.error && (
            <p className="mt-0.5 text-xs text-destructive">{row.error}</p>
          )}
        </div>
      </div>

      {/* Inline review: needs-direction */}
      {row.status === "needs-direction" && row.needsDirection && (
        <DirectionPicker
          info={row.needsDirection}
          onChoose={onResolveDirection}
          onReset={onSkip}
          resetLabel="Пропустить"
        />
      )}

      {/* Inline review: duplicate */}
      {row.status === "duplicate" && row.duplicate && (
        <DuplicateWarning
          duplicate={row.duplicate}
          onForceCreate={onForceCreate}
          onReset={onSkip}
          resetLabel="Пропустить"
        />
      )}

      {/* Retry on error */}
      {row.status === "error" && (
        <button
          onClick={onRetry}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Повторить
        </button>
      )}
    </div>
  );
}

// ── StatusBadge ────────────────────────────────────────────────────────

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

// ── Icons ──────────────────────────────────────────────────────────────

function SmallFileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-muted-foreground"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function pluralCandidates(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "кандидатов";
  if (mod10 === 1) return "кандидата";
  if (mod10 >= 2 && mod10 <= 4) return "кандидата";
  return "кандидатов";
}
