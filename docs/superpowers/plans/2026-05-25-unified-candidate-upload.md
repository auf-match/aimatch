# Unified Candidate Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the single-upload and bulk-upload pages into one unified `/candidates/upload` page where each candidate card supports both a file picker and a portfolio link, and the user can add N candidates before submitting.

**Architecture:** Extend the existing `useBulkUpload` hook (move it from `bulk/` to `upload/`, add `file?: File` support per row, rewrite `start()` to work with existing in-state rows). Rewrite `upload/page.tsx` as a card-list UI using the extended hook. Convert `bulk/page.tsx` to a Next.js redirect. No backend changes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Vitest

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/app/candidates/upload/use-bulk-upload.ts` | **Create** | Hook moved from `bulk/`, extended with `file`, `fileError`, `setFile`, `clearFile`, new `start()` |
| `src/app/candidates/upload/use-bulk-upload.test.ts` | **Create** | Unit test for exported `isRowValid` helper |
| `src/app/candidates/upload/page.tsx` | **Rewrite** | New card-list UI (input + processing + done phases) |
| `src/app/candidates/upload/bulk/page.tsx` | **Replace** | `redirect("/candidates/upload")` |
| `src/app/candidates/upload/bulk/use-bulk-upload.ts` | **Delete** | Moved to parent directory |
| `src/app/page.tsx` | **Modify** | Remove "Загрузить пачкой" link; rename "Загрузить кандидата" → "Загрузить кандидатов" |

---

## Task 1: Unit test for `isRowValid`

**Files:**
- Create: `src/app/candidates/upload/use-bulk-upload.test.ts`

Write the test first (TDD). The function doesn't exist yet — test will fail until Task 2.

- [ ] **Step 1: Write the failing test**

Create `src/app/candidates/upload/use-bulk-upload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isRowValid } from "./use-bulk-upload";

describe("isRowValid", () => {
  it("returns false for an empty row (no file, no url)", () => {
    expect(isRowValid({ url: "", status: "idle" })).toBe(false);
  });

  it("returns false for a whitespace-only url and no file", () => {
    expect(isRowValid({ url: "   ", status: "idle" })).toBe(false);
  });

  it("returns true for a row with a file and no url", () => {
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    expect(isRowValid({ url: "", file, status: "idle" })).toBe(true);
  });

  it("returns true for a row with a url and no file", () => {
    expect(isRowValid({ url: "https://example.com", status: "idle" })).toBe(true);
  });

  it("returns true for a row with both a file and a url", () => {
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    expect(isRowValid({ url: "https://example.com", file, status: "idle" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm the test fails**

```bash
cd /Users/slava/Documents/auf-match && npm test -- use-bulk-upload.test
```

Expected: FAIL — `isRowValid` not found (file doesn't exist yet). If the test file itself errors on import, that's also expected.

- [ ] **Step 3: Commit the test**

```bash
git add src/app/candidates/upload/use-bulk-upload.test.ts
git commit -m "test: add isRowValid unit test (red)"
```

---

## Task 2: Move and extend `useBulkUpload` hook

**Files:**
- Create: `src/app/candidates/upload/use-bulk-upload.ts`
- Keep (do not delete yet): `src/app/candidates/upload/bulk/use-bulk-upload.ts`

Key changes vs the old hook:
- `BulkRow` gains `file?: File` and `fileError?: string`
- New exported pure helper `isRowValid(row)`
- New methods `setFile(id, file)` and `clearFile(id)` (with validation inside `setFile`)
- `uploadOne(url, file, options?)` — adds `resume` and `portfolioLink` to FormData conditionally
- `start()` takes no arguments; reads current `rows` from state; filters/deduplicates; marks valid rows as `pending`; processes them sequentially
- Resolution methods (`resolveDirection`, `resolveForceCreate`, `retryRow`) now accept the full `BulkRow` instead of just a `url: string`, so they can pass `file` too

- [ ] **Step 1: Create the new hook file**

Create `src/app/candidates/upload/use-bulk-upload.ts` with this exact content:

```ts
// src/app/candidates/upload/use-bulk-upload.ts
"use client";

import { useState, useRef, useCallback } from "react";
import type {
  CandidateResult,
  DuplicateInfo,
  NeedsDirectionInfo,
} from "@/components/candidate-upload-types";
import { parsePortfolioLinks } from "@/lib/parse-portfolio-links";

export type BulkRowStatus =
  | "idle"
  | "pending"
  | "processing"
  | "created"
  | "needs-direction"
  | "duplicate"
  | "skipped"
  | "error";

export interface BulkRow {
  id: string;
  url: string;
  file?: File;        // attached resume
  fileError?: string; // validation error shown below picker
  status: BulkRowStatus;
  candidate?: CandidateResult;
  duplicate?: DuplicateInfo;
  needsDirection?: NeedsDirectionInfo;
  error?: string;
  noPortfolioAnalysis?: boolean;
}

/** Pure helper — exported for unit tests */
export function isRowValid(row: Pick<BulkRow, "url" | "file" | "status">): boolean {
  return !!row.file || row.url.trim().length > 0;
}

type UploadOneResult =
  | { status: "created"; candidate: CandidateResult }
  | { status: "needs-direction"; needsDirection: NeedsDirectionInfo }
  | { status: "duplicate"; duplicate: DuplicateInfo };

async function uploadOne(
  url: string,
  file: File | undefined,
  options?: { direction?: "product" | "communication"; forceCreate?: boolean },
): Promise<UploadOneResult> {
  const formData = new FormData();
  if (file) formData.append("resume", file);
  if (url) formData.append("portfolioLink", url);
  if (options?.direction) formData.append("direction", options.direction);
  if (options?.forceCreate) formData.append("forceCreate", "true");

  const res = await fetch("/api/candidates/upload", { method: "POST", body: formData });
  const data = await res.json();

  if (res.status === 201) {
    return { status: "created", candidate: data as CandidateResult };
  }
  if (res.status === 409 && data.needsDirection) {
    return { status: "needs-direction", needsDirection: data as NeedsDirectionInfo };
  }
  if (res.status === 409 && data.duplicate) {
    return { status: "duplicate", duplicate: data as DuplicateInfo };
  }
  throw new Error(data.error || `Ошибка ${res.status}`);
}

function updateRow(
  setRows: React.Dispatch<React.SetStateAction<BulkRow[]>>,
  id: string,
  patch: Partial<BulkRow>,
) {
  setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

export function useBulkUpload() {
  const [rows, setRows] = useState<BulkRow[]>([{ id: "0", url: "", status: "idle" }]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  // ── Input management ──────────────────────────────────────────────

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { id: String(Date.now()), url: "", status: "idle" },
    ]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev; // always keep at least one card
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const setUrl = useCallback((id: string, url: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, url } : r)));
  }, []);

  const setFile = useCallback((id: string, file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".pdf") && !ext.endsWith(".docx")) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, fileError: "Поддерживаются только .pdf и .docx файлы" }
            : r,
        ),
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, fileError: "Файл слишком большой (макс. 10 MB)" }
            : r,
        ),
      );
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, file, fileError: undefined } : r,
      ),
    );
  }, []);

  const clearFile = useCallback((id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, file: undefined, fileError: undefined } : r,
      ),
    );
  }, []);

  // ── Processing ────────────────────────────────────────────────────

  const start = useCallback(
    async () => {
      stopRef.current = false;
      setRunning(true);

      // Build the list of rows to process.
      // Rules:
      //   - Empty cards (no file, no url) → skip
      //   - URL dedup: only among rows that have a url; file-only rows are never duplicates
      //   - Invalid URL + no file → skip; invalid URL + file → process as file-only
      const seenUrls = new Set<string>();
      const toProcess: BulkRow[] = [];

      for (const row of rows) {
        const hasFile = !!row.file;
        const trimmedUrl = row.url.trim();

        if (!hasFile && !trimmedUrl) continue; // empty card

        if (trimmedUrl) {
          const parsed = parsePortfolioLinks([trimmedUrl]);
          if (parsed.length === 0) {
            // Invalid URL — only include if there's a file
            if (!hasFile) continue;
          } else {
            const normUrl = parsed[0];
            if (seenUrls.has(normUrl)) {
              // Duplicate URL — only include if there's a file (file is still unique)
              if (!hasFile) continue;
            } else {
              seenUrls.add(normUrl);
            }
          }
        }

        toProcess.push(row);
      }

      // Mark processable rows as pending (others stay idle)
      const processIds = new Set(toProcess.map((r) => r.id));
      setRows((prev) =>
        prev.map((r) => (processIds.has(r.id) ? { ...r, status: "pending" } : r)),
      );

      for (const row of toProcess) {
        if (stopRef.current) {
          setRows((prev) =>
            prev.map((r) => (r.status === "pending" ? { ...r, status: "idle" } : r)),
          );
          break;
        }

        updateRow(setRows, row.id, { status: "processing" });

        // Normalize URL before sending (empty string if invalid / not present)
        const urlToSend = parsePortfolioLinks([row.url])[0] ?? "";

        try {
          const result = await uploadOne(urlToSend, row.file);
          if (result.status === "created") {
            updateRow(setRows, row.id, {
              status: "created",
              candidate: result.candidate,
              noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
            });
          } else if (result.status === "needs-direction") {
            updateRow(setRows, row.id, {
              status: "needs-direction",
              needsDirection: result.needsDirection,
            });
          } else if (result.status === "duplicate") {
            updateRow(setRows, row.id, {
              status: "duplicate",
              duplicate: result.duplicate,
            });
          }
        } catch (err) {
          updateRow(setRows, row.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Ошибка обработки",
          });
        }
      }

      setRunning(false);
    },
    [rows], // rows captured at call time; safe because toProcess is built synchronously
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  // ── Resolution ────────────────────────────────────────────────────
  // All resolution methods now accept the full BulkRow (not just url) so they
  // can forward the file on retry requests.

  const resolveDirection = useCallback(
    async (rowId: string, row: BulkRow, direction: "product" | "communication") => {
      updateRow(setRows, rowId, { status: "processing", needsDirection: undefined });
      const urlToSend = parsePortfolioLinks([row.url])[0] ?? "";
      try {
        const result = await uploadOne(urlToSend, row.file, { direction });
        if (result.status === "created") {
          updateRow(setRows, rowId, {
            status: "created",
            candidate: result.candidate,
            noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
          });
        } else {
          updateRow(setRows, rowId, {
            status: "error",
            error: "Неожиданный ответ от сервера",
          });
        }
      } catch (err) {
        updateRow(setRows, rowId, {
          status: "error",
          error: err instanceof Error ? err.message : "Ошибка",
        });
      }
    },
    [],
  );

  const resolveForceCreate = useCallback(async (rowId: string, row: BulkRow) => {
    updateRow(setRows, rowId, { status: "processing", duplicate: undefined });
    const urlToSend = parsePortfolioLinks([row.url])[0] ?? "";
    try {
      const result = await uploadOne(urlToSend, row.file, { forceCreate: true });
      if (result.status === "created") {
        updateRow(setRows, rowId, {
          status: "created",
          candidate: result.candidate,
          noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
        });
      } else {
        updateRow(setRows, rowId, {
          status: "error",
          error: "Неожиданный ответ от сервера",
        });
      }
    } catch (err) {
      updateRow(setRows, rowId, {
        status: "error",
        error: err instanceof Error ? err.message : "Ошибка",
      });
    }
  }, []);

  const skipRow = useCallback((rowId: string) => {
    updateRow(setRows, rowId, { status: "skipped" });
  }, []);

  const retryRow = useCallback(async (rowId: string, row: BulkRow) => {
    updateRow(setRows, rowId, { status: "processing", error: undefined });
    const urlToSend = parsePortfolioLinks([row.url])[0] ?? "";
    try {
      const result = await uploadOne(urlToSend, row.file);
      if (result.status === "created") {
        updateRow(setRows, rowId, {
          status: "created",
          candidate: result.candidate,
          noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
        });
      } else if (result.status === "needs-direction") {
        updateRow(setRows, rowId, {
          status: "needs-direction",
          needsDirection: result.needsDirection,
        });
      } else if (result.status === "duplicate") {
        updateRow(setRows, rowId, {
          status: "duplicate",
          duplicate: result.duplicate,
        });
      }
    } catch (err) {
      updateRow(setRows, rowId, {
        status: "error",
        error: err instanceof Error ? err.message : "Ошибка",
      });
    }
  }, []);

  // ── Derived state ─────────────────────────────────────────────────

  const phase: "input" | "processing" | "done" =
    rows.every((r) => r.status === "idle")
      ? "input"
      : running
        ? "processing"
        : "done";

  const counts = {
    created: rows.filter((r) => r.status === "created").length,
    review: rows.filter(
      (r) => r.status === "needs-direction" || r.status === "duplicate",
    ).length,
    error: rows.filter((r) => r.status === "error").length,
    processed: rows.filter(
      (r) => r.status !== "pending" && r.status !== "idle",
    ).length,
    total: rows.filter((r) => r.status !== "idle").length,
  };

  return {
    rows,
    running,
    phase,
    counts,
    // input
    addRow,
    removeRow,
    setUrl,
    setFile,
    clearFile,
    start,
    stop,
    // resolution
    resolveDirection,
    resolveForceCreate,
    skipRow,
    retryRow,
  };
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
cd /Users/slava/Documents/auf-match && npm test -- use-bulk-upload.test
```

Expected: All 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/candidates/upload/use-bulk-upload.ts src/app/candidates/upload/use-bulk-upload.test.ts
git commit -m "feat: extend useBulkUpload hook with file support"
```

---

## Task 3: Rewrite unified upload page

**Files:**
- Modify: `src/app/candidates/upload/page.tsx` (full rewrite)

Replace the entire content of `src/app/candidates/upload/page.tsx` with:

```tsx
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
```

- [ ] **Step 1: Write the new page**

Replace the full content of `src/app/candidates/upload/page.tsx` with the code above.

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/slava/Documents/auf-match && npx tsc --noEmit
```

Expected: No errors. If there are type errors, fix them before committing.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/slava/Documents/auf-match && npm test
```

Expected: All tests pass (the 5 `isRowValid` tests + existing `parsePortfolioLinks` tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/candidates/upload/page.tsx
git commit -m "feat: unified upload page — card list with file + link per candidate"
```

---

## Task 4: Convert bulk page to redirect and remove old hook

**Files:**
- Modify: `src/app/candidates/upload/bulk/page.tsx` → redirect
- Delete: `src/app/candidates/upload/bulk/use-bulk-upload.ts`

- [ ] **Step 1: Replace `bulk/page.tsx` with a redirect**

Replace the entire content of `src/app/candidates/upload/bulk/page.tsx` with:

```tsx
// src/app/candidates/upload/bulk/page.tsx
// Permanent redirect — bulk upload is now part of /candidates/upload
import { redirect } from "next/navigation";

export default function BulkUploadRedirect() {
  redirect("/candidates/upload");
}
```

- [ ] **Step 2: Delete the old hook file**

```bash
rm /Users/slava/Documents/auf-match/src/app/candidates/upload/bulk/use-bulk-upload.ts
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/slava/Documents/auf-match && npx tsc --noEmit
```

Expected: No errors. The old `bulk/page.tsx` no longer imports the deleted hook, so there should be no broken imports.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/slava/Documents/auf-match && npm test
```

Expected: All tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/candidates/upload/bulk/page.tsx
git rm src/app/candidates/upload/bulk/use-bulk-upload.ts
git commit -m "feat: redirect /candidates/upload/bulk to /candidates/upload"
```

---

## Task 5: Update home page entry points

**Files:**
- Modify: `src/app/page.tsx`

Changes:
1. Remove the "Загрузить пачкой" `Link` pointing to `/candidates/upload/bulk`
2. Change "Загрузить кандидата" to "Загрузить кандидатов" (single entry for upload)

- [ ] **Step 1: Update the home page**

In `src/app/page.tsx`, find the "Быстрые действия" section (around line 141–167) and replace the three links with two:

**Before:**
```tsx
<div className="flex flex-col gap-2 mt-1">
  <Link
    href="/candidates/upload"
    className="pill pill--outline flex justify-center"
    style={{ height: "40px", fontSize: "13px" }}
  >
    + Загрузить кандидата
  </Link>
  <Link
    href="/vacancies/new"
    className="pill pill--outline flex justify-center"
    style={{ height: "40px", fontSize: "13px" }}
  >
    + Создать вакансию
  </Link>
  <Link
    href="/candidates/upload/bulk"
    className="pill pill--outline flex justify-center"
    style={{ height: "40px", fontSize: "13px" }}
  >
    + Загрузить пачкой
  </Link>
</div>
```

**After:**
```tsx
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
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/slava/Documents/auf-match && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/slava/Documents/auf-match && npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: unify home page upload action — single entry point"
```

---

## Manual Verification Checklist

After all tasks are complete, verify in the running app (`npm run dev`):

- [ ] `/candidates/upload` shows one card by default ("Кандидат 1")
- [ ] Clicking "Добавить ещё кандидата" adds a new card with "Кандидат 2" etc.
- [ ] Delete button (×) appears when >1 cards; missing when only 1
- [ ] File picker: clicking opens file dialog; attaches .pdf/.docx; shows name + size + ×
- [ ] File picker: wrong type (.txt) → error message below picker, file not attached
- [ ] File picker: file >10MB → error message, file not attached
- [ ] URL field accepts any text; button becomes active when url is non-empty
- [ ] "Обработать N кандидатов" shows correct count; disabled when no valid cards
- [ ] One card with file only → processes, creates candidate, badge "создан"
- [ ] One card with url only → processes as before
- [ ] One card with file + url → processes with both fields
- [ ] Batch of 3 cards (mix) → sequential processing, progress indicator updates
- [ ] "Стоп" during processing → unprocessed cards return to "ожидает"
- [ ] `needs-direction` card → DirectionPicker shown inline → resolve → "создан"
- [ ] `duplicate` card → DuplicateWarning shown inline → force create or skip
- [ ] `error` card → "Повторить" button shown
- [ ] `/candidates/upload/bulk` → redirects to `/candidates/upload`
- [ ] Home page shows only "Загрузить кандидатов" (no separate "Загрузить пачкой")
