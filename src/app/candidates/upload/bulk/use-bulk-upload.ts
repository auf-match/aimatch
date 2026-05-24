// src/app/candidates/upload/bulk/use-bulk-upload.ts
"use client";

import { useState, useRef, useCallback } from "react";
import type { CandidateResult, DuplicateInfo, NeedsDirectionInfo } from "@/components/candidate-upload-types";

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
  status: BulkRowStatus;
  candidate?: CandidateResult;
  duplicate?: DuplicateInfo;
  needsDirection?: NeedsDirectionInfo;
  error?: string;
  noPortfolioAnalysis?: boolean; // true = создан, но анализ портфолио не запускался
}

type UploadOneResult =
  | { status: "created"; candidate: CandidateResult }
  | { status: "needs-direction"; needsDirection: NeedsDirectionInfo }
  | { status: "duplicate"; duplicate: DuplicateInfo };

async function uploadOne(
  url: string,
  options?: { direction?: "product" | "communication"; forceCreate?: boolean },
): Promise<UploadOneResult> {
  const formData = new FormData();
  formData.append("portfolioLink", url);
  if (options?.direction) formData.append("direction", options.direction);
  if (options?.forceCreate) formData.append("forceCreate", "true");

  const res = await fetch("/api/candidates/upload", { method: "POST", body: formData });
  const data = await res.json();

  if (res.status === 201) {
    return { status: "created", candidate: data as CandidateResult };
  }
  if (res.status === 409 && data.needsDirection) {
    // data = { needsDirection: true, suggestedDirection, confidence, reasoning, parsedName }
    // data has all NeedsDirectionInfo fields — casting the whole object is correct
    return { status: "needs-direction", needsDirection: data as NeedsDirectionInfo };
  }
  if (res.status === 409 && data.duplicate) {
    // data = { duplicate: true, reason, existing, parsedName }
    // data has all DuplicateInfo fields — casting the whole object is correct
    // (data.duplicate is the boolean flag used for detection; result.duplicate is the full data object)
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
      if (prev.length <= 1) return prev; // нельзя удалить последнее поле
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const setUrl = useCallback((id: string, url: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, url } : r)));
  }, []);

  // ── Processing ────────────────────────────────────────────────────

  const start = useCallback(
    async (urlList: string[]) => {
      stopRef.current = false;
      setRunning(true);

      // Инициализировать строки
      const initialRows: BulkRow[] = urlList.map((url, i) => ({
        id: String(i),
        url,
        status: "pending",
      }));
      setRows(initialRows);

      for (const row of initialRows) {
        if (stopRef.current) {
          setRows((prev) =>
            prev.map((r) => (r.status === "pending" ? { ...r, status: "idle" } : r)),
          );
          break;
        }

        updateRow(setRows, row.id, { status: "processing" });

        try {
          const result = await uploadOne(row.url);
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
    [],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  // ── Resolution ────────────────────────────────────────────────────

  const resolveDirection = useCallback(
    async (rowId: string, direction: "product" | "communication") => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      updateRow(setRows, rowId, { status: "processing", needsDirection: undefined });
      try {
        const result = await uploadOne(row.url, { direction });
        if (result.status === "created") {
          updateRow(setRows, rowId, {
            status: "created",
            candidate: result.candidate,
            noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
          });
        } else {
          updateRow(setRows, rowId, { status: "error", error: "Неожиданный ответ от сервера" });
        }
      } catch (err) {
        updateRow(setRows, rowId, {
          status: "error",
          error: err instanceof Error ? err.message : "Ошибка",
        });
      }
    },
    [rows],
  );

  const resolveForceCreate = useCallback(
    async (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      updateRow(setRows, rowId, { status: "processing", duplicate: undefined });
      try {
        const result = await uploadOne(row.url, { forceCreate: true });
        if (result.status === "created") {
          updateRow(setRows, rowId, {
            status: "created",
            candidate: result.candidate,
            noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
          });
        } else {
          updateRow(setRows, rowId, { status: "error", error: "Неожиданный ответ от сервера" });
        }
      } catch (err) {
        updateRow(setRows, rowId, {
          status: "error",
          error: err instanceof Error ? err.message : "Ошибка",
        });
      }
    },
    [rows],
  );

  const skipRow = useCallback((rowId: string) => {
    updateRow(setRows, rowId, { status: "skipped" });
  }, []);

  const retryRow = useCallback(
    async (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      updateRow(setRows, rowId, { status: "processing", error: undefined });
      try {
        const result = await uploadOne(row.url);
        if (result.status === "created") {
          updateRow(setRows, rowId, {
            status: "created",
            candidate: result.candidate,
            noPortfolioAnalysis: result.candidate.portfolioAnalysis === null,
          });
        } else if (result.status === "needs-direction") {
          updateRow(setRows, rowId, { status: "needs-direction", needsDirection: result.needsDirection });
        } else if (result.status === "duplicate") {
          updateRow(setRows, rowId, { status: "duplicate", duplicate: result.duplicate });
        }
      } catch (err) {
        updateRow(setRows, rowId, {
          status: "error",
          error: err instanceof Error ? err.message : "Ошибка",
        });
      }
    },
    [rows],
  );

  // ── Derived state ─────────────────────────────────────────────────

  const phase: "input" | "processing" | "done" =
    rows.every((r) => r.status === "idle")
      ? "input"
      : running
        ? "processing"
        : "done";

  const counts = {
    created: rows.filter((r) => r.status === "created").length,
    review: rows.filter((r) => r.status === "needs-direction" || r.status === "duplicate").length,
    error: rows.filter((r) => r.status === "error").length,
    processed: rows.filter((r) => r.status !== "pending" && r.status !== "idle").length,
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
    start,
    stop,
    // resolution
    resolveDirection,
    resolveForceCreate,
    skipRow,
    retryRow,
  };
}
