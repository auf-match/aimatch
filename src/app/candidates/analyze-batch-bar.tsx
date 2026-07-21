"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface StatusResponse {
  pending: number;
  failed: number;
}

const LIMIT_OPTIONS = [10, 20, 50] as const;
const POLL_INTERVAL_MS = 5000;
const POLL_CAP_MS = 10 * 60 * 1000;

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export default function AnalyzeBatchBar() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [limit, setLimit] = useState<number>(20);
  const [submitting, setSubmitting] = useState(false);
  // justLaunched блокирует кнопку ТОЛЬКО пока пачку запустили мы сами в этой
  // вкладке — не путать с "есть отставание в очереди" (pending > 0), которое
  // истинно почти всегда на большой базе и не означает, что анализ идёт прямо
  // сейчас (сервер не хранит промежуточный статус "в обработке").
  const [justLaunched, setJustLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const launchCapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLaunchLock = () => {
    if (launchCapRef.current) {
      clearTimeout(launchCapRef.current);
      launchCapRef.current = null;
    }
    setJustLaunched(false);
  };

  const stopRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const fetchStatus = async (): Promise<StatusResponse | null> => {
    try {
      const res = await fetch("/api/candidates/analyze-batch/status");
      if (!res.ok) return null;
      const data = await res.json();
      return data as StatusResponse;
    } catch {
      return null;
    }
  };

  // Обновление счётчиков — просто наблюдение, кнопку не трогает. Работает
  // и после релоада страницы, и после запуска пачки, пока pending не обнулится
  // или не истечёт 10-минутный потолок (страховка от вечного интервала).
  const startRefresh = () => {
    stopRefresh();
    refreshIntervalRef.current = setInterval(async () => {
      const data = await fetchStatus();
      if (!data) return;
      setPending(data.pending);
      setFailed(data.failed);
      if (data.pending === 0) {
        stopRefresh();
        clearLaunchLock();
      }
    }, POLL_INTERVAL_MS);
    setTimeout(() => stopRefresh(), POLL_CAP_MS);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await fetchStatus();
      if (!active) return;
      if (data) {
        setPending(data.pending);
        setFailed(data.failed);
        if (data.pending > 0) startRefresh();
      }
      setInitialized(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      stopRefresh();
      if (launchCapRef.current) clearTimeout(launchCapRef.current);
    };
  }, []);

  const handleAnalyze = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/analyze-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      setJustLaunched(true);
      launchCapRef.current = setTimeout(clearLaunchLock, POLL_CAP_MS);
      startRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить анализ");
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialized || (pending === 0 && failed === 0)) return null;

  return (
    <div className="bg-card px-6 py-2.5 shadow-[0_1px_0_0_oklch(0_0_0/0.05)] flex items-center gap-3 flex-wrap text-sm">
      <span className="text-muted-foreground">
        {pending} {pluralize(pending, "кандидат", "кандидата", "кандидатов")} без AI-анализа
        {failed > 0 && (
          <span className="text-muted-foreground/60">
            , {failed} с ошибкой анализа
          </span>
        )}
      </span>
      <select
        value={limit}
        onChange={(e) => setLimit(Number(e.target.value))}
        title="50 может не успеть за один заход — недообработанные останутся в очереди"
        className="h-8 rounded-[var(--r-button)] border border-input bg-card px-2 text-sm outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] focus:border-primary/50 transition-[border-color]"
      >
        {LIMIT_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <Button size="sm" variant="accent" onClick={handleAnalyze} disabled={submitting || justLaunched}>
        {submitting ? "Запускаю..." : "Проанализировать"}
      </Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
