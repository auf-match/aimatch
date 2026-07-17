// src/app/candidates/upload/import-json-block.tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ImportResult = {
  found: number;
  imported: number;
  skippedExisting: number;
  skippedInvalid: number;
};

export default function ImportJsonBlock() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setError(null);
    }
    e.target.value = "";
  };

  const handleClearFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/candidates/import-json", {
        method: "POST",
        body: formData,
      });
      let body: unknown = null;
      let parseFailed = false;
      try {
        body = await res.json();
      } catch {
        body = null;
        parseFailed = true;
      }
      if (!res.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Не удалось импортировать";
        setError(message);
        return;
      }
      if (parseFailed) {
        setError("Не удалось разобрать ответ сервера");
        return;
      }
      setResult(body as ImportResult);
    } catch {
      setError("Не удалось импортировать");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="soft-card space-y-3">
      <div>
        <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Импорт из JSON
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Выгрузка профилей Behance. Карточки создаются без AI-анализа —
          запустить его можно позже на странице кандидатов.
        </p>
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        {file ? (
          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-card">
            <SmallFileIcon />
            <span className="text-sm flex-1 truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <button
              onClick={handleClearFile}
              disabled={loading}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-xl leading-none disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Убрать файл"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full flex items-center gap-2 border border-dashed border-border rounded-lg px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SmallFileIcon />
            <span className="text-sm">Прикрепить JSON-файл</span>
          </button>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={!file || loading} className="w-full">
        {loading ? "Импортирую…" : "Импортировать"}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {result && (
        <p className="text-xs text-muted-foreground">
          Импортировано {result.imported}. Пропущено: уже в базе{" "}
          {result.skippedExisting}, без имени/ссылки {result.skippedInvalid}.
          Всего найдено {result.found}.
        </p>
      )}
    </div>
  );
}

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
