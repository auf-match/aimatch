"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface ProcessingEntry {
  id: string;
  name: string;
  portfolioLink: string;
  startedAt: number;
  elapsedSeconds: number;
}

interface FailedEntry {
  id: string;
  name: string;
  lastAnalysisError: string | null;
  updatedAt: string;
}

interface StatusDebugResponse {
  processing: ProcessingEntry[];
  failed: FailedEntry[];
  pending: number;
}

const POLL_INTERVAL_MS = 4000;

function hostnameOf(link: string): string {
  try {
    return new URL(link).hostname;
  } catch {
    return link;
  }
}

export default function AnalyzeStatusPage() {
  const [data, setData] = useState<StatusDebugResponse | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRetryFailed = async () => {
    setRetrying(true);
    setRetryMsg(null);
    try {
      const res = await fetch("/api/candidates/analyze-batch/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Ошибка ${res.status}`);
      setRetryMsg(`Запущен повтор: ${json.started} кандидат(ов). Прогресс обновится ниже.`);
    } catch (err) {
      setRetryMsg(err instanceof Error ? err.message : "Не удалось запустить повтор");
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/candidates/analyze-status-debug");
        if (!res.ok) throw new Error(`Ошибка ${res.status}`);
        const json = (await res.json()) as StatusDebugResponse;
        if (!active) return;
        setData(json);
        setFetchError(false);
      } catch {
        if (!active) return;
        setFetchError(true);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const processing = data?.processing ?? [];
  const failed = data?.failed ?? [];
  const pending = data?.pending ?? 0;

  return (
    <div className="min-h-screen">
      <div className="bg-card px-6 py-5 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Мониторинг анализа</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Осталось в очереди: {pending} · В обработке: {processing.length} · С ошибкой: {failed.length}
            </p>
          </div>
          {failed.length > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={retrying}
              className="shrink-0 rounded-lg bg-[#F97029] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#F97029]/90 disabled:opacity-50"
            >
              {retrying ? "Запуск…" : `Повторить упавшие (до 50)`}
            </button>
          )}
        </div>
        {retryMsg && <p className="text-xs text-muted-foreground mt-2">{retryMsg}</p>}
        {fetchError && (
          <p className="text-xs text-red-500 mt-1">Не удалось обновить данные</p>
        )}
      </div>

      <div className="p-6 max-w-3xl space-y-8">
        <section>
          <h2 className="text-sm font-semibold mb-3">В обработке сейчас</h2>
          {processing.length === 0 ? (
            <p className="text-sm text-muted-foreground">Сейчас никто не обрабатывается</p>
          ) : (
            <ul className="space-y-2">
              {processing.map((p) => (
                <li key={p.id} className="text-sm flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/candidates/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="text-muted-foreground">{hostnameOf(p.portfolioLink)}</span>
                  <span className="text-muted-foreground">{p.elapsedSeconds} с</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3">Ошибки (последние 50)</h2>
          {failed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ошибок нет</p>
          ) : (
            <ul className="space-y-2">
              {failed.map((f) => (
                <li key={f.id} className="text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/candidates/${f.id}`}
                      className="font-medium hover:underline"
                    >
                      {f.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {new Date(f.updatedAt).toLocaleTimeString("ru-RU")}
                    </span>
                  </div>
                  <p className="text-xs text-red-500">{f.lastAnalysisError || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
