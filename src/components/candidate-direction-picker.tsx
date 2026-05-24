// src/components/candidate-direction-picker.tsx
"use client";

import type { NeedsDirectionInfo } from "@/components/candidate-upload-types";

interface Props {
  info: NeedsDirectionInfo;
  onChoose: (direction: "product" | "communication") => void;
  onReset: () => void;
  resetLabel?: string; // default "Отмена"
}

export function DirectionPicker({ info, onChoose, onReset, resetLabel = "Отмена" }: Props) {
  const confidenceLabel =
    info.confidence >= 70 ? "высокая" : info.confidence >= 50 ? "средняя" : "низкая";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-5 py-4">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
          Нужно уточнить направление дизайнера
        </p>
        <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
          Кандидат{" "}
          <span className="font-medium">{info.parsedName}</span> — роль не позволяет однозначно
          определить направление. AI предполагает{" "}
          <span className="font-medium">
            {info.suggestedDirection === "product" ? "продуктовый дизайн" : "коммуникационный дизайн"}
          </span>{" "}
          (уверенность: {confidenceLabel}, {info.confidence}%).
        </p>
        {info.reasoning && (
          <p className="mt-2 text-xs text-blue-700 dark:text-blue-400 italic">{info.reasoning}</p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Выберите, по каким критериям оценивать портфолио:
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChoose("product")}
          className={`[border-radius:var(--r-button)] border-2 p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 ${
            info.suggestedDirection === "product"
              ? "border-[#F97029]/50 bg-[#F97029]/5"
              : "border-border"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-blue-100 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <span className="text-sm font-semibold">Продуктовый</span>
            {info.suggestedDirection === "product" && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#F97029]">ИИ рекомендует</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            UX/UI, интерфейсы, дизайн-системы, продуктовое мышление, метрики
          </p>
        </button>

        <button
          onClick={() => onChoose("communication")}
          className={`[border-radius:var(--r-button)] border-2 p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 ${
            info.suggestedDirection === "communication"
              ? "border-[#F97029]/50 bg-[#F97029]/5"
              : "border-border"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-purple-100 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <span className="text-sm font-semibold">Коммуникационный</span>
            {info.suggestedDirection === "communication" && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#F97029]">ИИ рекомендует</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Брендинг, айдентика, полиграфия, типографика, рекламные материалы
          </p>
        </button>
      </div>

      <button
        onClick={onReset}
        className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
      >
        {resetLabel}
      </button>
    </div>
  );
}
