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
