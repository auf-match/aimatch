"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ROLE_LABELS, GRADE_LABELS } from "@/lib/constants";
import { DirectionPicker } from "@/components/candidate-direction-picker";
import { DuplicateWarning } from "@/components/candidate-duplicate-warning";
import type { CandidateResult, DuplicateInfo, NeedsDirectionInfo } from "@/components/candidate-upload-types";

type UploadStep = "idle" | "uploading" | "parsing" | "done" | "error" | "duplicate" | "needs-direction";

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [portfolioLink, setPortfolioLink] = useState("");
  const [candidate, setCandidate] = useState<CandidateResult | null>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [needsDirection, setNeedsDirection] = useState<NeedsDirectionInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    const ext = f.name.toLowerCase();
    if (!ext.endsWith(".pdf") && !ext.endsWith(".docx")) {
      setError("Поддерживаются только .pdf и .docx файлы");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Файл слишком большой (макс. 10MB)");
      return;
    }
    setError("");
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const submit = async (options: { forceCreate?: boolean; direction?: "product" | "communication" } = {}) => {
    if (!file && !portfolioLink.trim()) return;

    setStep("parsing");
    setError("");
    setDuplicate(null);
    setNeedsDirection(null);

    const formData = new FormData();
    if (file) formData.append("resume", file);
    if (portfolioLink.trim()) formData.append("portfolioLink", portfolioLink.trim());
    if (options.forceCreate) formData.append("forceCreate", "true");
    if (options.direction) formData.append("direction", options.direction);

    try {
      const res = await fetch("/api/candidates/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.status === 409 && data.duplicate) {
        setDuplicate(data as DuplicateInfo);
        setStep("duplicate");
        return;
      }

      if (res.status === 409 && data.needsDirection) {
        setNeedsDirection(data as NeedsDirectionInfo);
        setStep("needs-direction");
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || `Ошибка ${res.status}`);
      }

      setCandidate(data);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      setStep("error");
    }
  };

  const handleSubmit = () => submit({});

  const reset = () => {
    setStep("idle");
    setFile(null);
    setPortfolioLink("");
    setCandidate(null);
    setError("");
    setDuplicate(null);
    setNeedsDirection(null);
  };

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center bg-card px-6 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Кандидаты
        </Link>
      </div>
      <div className="mx-auto max-w-2xl px-6 pb-16">
        <div className="mt-8 mb-6">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            Загрузить кандидата
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Загрузите резюме, укажите портфолио или и то и другое — AI создаст карточку
          </p>
        </div>

        {step === "done" && candidate ? (
          <CandidateCard candidate={candidate} onReset={reset} />
        ) : step === "duplicate" && duplicate ? (
          <DuplicateWarning
            duplicate={duplicate}
            onForceCreate={() => submit({ forceCreate: true })}
            onReset={reset}
          />
        ) : step === "needs-direction" && needsDirection ? (
          <DirectionPicker
            info={needsDirection}
            onChoose={(direction) => submit({ direction })}
            onReset={reset}
          />
        ) : (
          <div className="space-y-6">
            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`
                relative flex cursor-pointer flex-col items-center justify-center
                rounded-lg border-2 border-dashed px-6 py-16 transition-colors
                ${isDragging
                  ? "border-foreground/40 bg-muted/50"
                  : file
                    ? "border-foreground/20 bg-muted/30"
                    : "border-border hover:border-foreground/20 hover:bg-muted/30"
                }
              `}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />

              {file ? (
                <>
                  <FileIcon />
                  <p className="mt-3 text-sm font-medium">{file.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="mt-3 text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Заменить файл
                  </button>
                </>
              ) : (
                <>
                  <UploadIcon />
                  <p className="mt-3 text-sm font-medium">
                    Перетащите файл или нажмите для выбора
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF или DOCX, до 10 MB
                  </p>
                </>
              )}
            </div>

            {/* Divider */}
            {!file && !portfolioLink.trim() && (
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">или</span>
                <div className="flex-1 border-t" />
              </div>
            )}

            {/* Portfolio link */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Ссылка на портфолио
                {file && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    (опционально)
                  </span>
                )}
              </label>
              <Input
                type="url"
                placeholder="https://..."
                value={portfolioLink}
                onChange={(e) => setPortfolioLink(e.target.value)}
                disabled={step === "parsing" || step === "uploading"}
              />
              {!file && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Notion, личный сайт, Behance и др.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Progress */}
            {(step === "uploading" || step === "parsing") && (
              <ProgressIndicator step={step} />
            )}

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                onClick={handleSubmit}
                disabled={(!file && !portfolioLink.trim()) || step === "uploading" || step === "parsing"}
                className="flex-1"
              >
                {step === "uploading" || step === "parsing"
                  ? "Обработка..."
                  : file
                    ? "Загрузить и обработать"
                    : "Обработать портфолио"}
              </Button>
              {step === "error" && (
                <Button variant="outline" onClick={reset}>
                  Сбросить
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressIndicator({ step }: { step: "uploading" | "parsing" }) {
  const steps = [
    { key: "uploading", label: "Загрузка и скрейпинг портфолио" },
    { key: "parsing", label: "AI анализирует данные" },
  ];

  return (
    <div className="space-y-3">
      {steps.map((s) => {
        const isActive = s.key === step;
        const isDone =
          (s.key === "uploading" && step === "parsing");

        return (
          <div key={s.key} className="flex items-center gap-3 text-sm">
            <div
              className={`h-2 w-2 rounded-full ${
                isDone
                  ? "bg-foreground"
                  : isActive
                    ? "bg-foreground animate-pulse"
                    : "bg-border"
              }`}
            />
            <span
              className={
                isDone || isActive ? "text-foreground" : "text-muted-foreground"
              }
            >
              {s.label}
              {isActive && "..."}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CandidateCard({
  candidate,
  onReset,
}: {
  candidate: CandidateResult;
  onReset: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="rounded-md border border-foreground/10 bg-muted/30 px-4 py-3 text-sm">
        Кандидат успешно добавлен
        {candidate.aiConfidenceScore != null && (
          <span className="ml-1 text-muted-foreground">
            &middot; уверенность парсинга {candidate.aiConfidenceScore}%
          </span>
        )}
      </div>

      {/* Main info */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{candidate.name}</h2>
              <p className="text-sm text-muted-foreground">
                {ROLE_LABELS[candidate.role] || candidate.role}
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{GRADE_LABELS[candidate.grade] || candidate.grade}</span>
          </div>

          {candidate.aiSummary && (
            <p className="text-sm leading-relaxed">{candidate.aiSummary}</p>
          )}

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {candidate.yearsOfExperience != null && (
              <InfoRow label="Опыт" value={`${candidate.yearsOfExperience} лет`} />
            )}
            {candidate.location && <InfoRow label="Локация" value={candidate.location} />}
            {candidate.segment && <InfoRow label="Сегмент" value={candidate.segment} />}
            {candidate.email && <InfoRow label="Email" value={candidate.email} />}
            {candidate.telegramContact && (
              <InfoRow label="Telegram" value={candidate.telegramContact} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Skills & tools */}
      {(candidate.skills.length > 0 || candidate.tools.length > 0) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {candidate.skills.length > 0 && (
              <div>
                <p className="t-eyebrow mb-1.5 opacity-70">Навыки</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.map((s) => (
                    <span key={s} className="inline-flex items-center rounded-full bg-card [box-shadow:var(--shadow-card)] px-2.5 py-0.5 text-xs font-normal text-foreground">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {candidate.tools.length > 0 && (
              <div>
                <p className="t-eyebrow mb-1.5 opacity-70">Инструменты</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.tools.map((t) => (
                    <span key={t} className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-xs font-normal text-foreground">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI strengths & concerns */}
      {(candidate.aiStrengths.length > 0 || candidate.aiConcerns.length > 0) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {candidate.aiStrengths.length > 0 && (
              <div>
                <p className="t-eyebrow mb-1.5 opacity-70">Сильные стороны</p>
                <ul className="space-y-1 text-sm">
                  {candidate.aiStrengths.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {candidate.aiConcerns.length > 0 && (
              <div>
                <p className="t-eyebrow mb-1.5 opacity-70">Риски</p>
                <ul className="space-y-1 text-sm">
                  {candidate.aiConcerns.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive/60" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Experience */}
      {candidate.experiences.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="t-eyebrow mb-1 opacity-70">Опыт работы</p>
            {candidate.experiences.map((exp) => (
              <div key={exp.id} className="border-t pt-3 first:border-0 first:pt-0">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{exp.company}</p>
                    <p className="text-xs text-muted-foreground">{exp.role}</p>
                  </div>
                  <div className="flex gap-1">
                    {exp.isBigtech && <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">BigTech</span>}
                    {exp.isStudio && <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">Studio</span>}
                  </div>
                </div>
                {exp.duration && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{exp.duration}</p>
                )}
                {exp.keyAchievements.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {exp.keyAchievements.map((a, i) => (
                      <li key={i}>&middot; {a}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Link href={`/candidates/${candidate.id}`} className="flex-1">
          <Button className="w-full">Открыть карточку</Button>
        </Link>
        <Button variant="outline" onClick={onReset}>
          Загрузить ещё
        </Button>
      </div>
    </div>
  );
}


function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/60">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/60">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
