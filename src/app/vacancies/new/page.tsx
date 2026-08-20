"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  createContext,
  useContext,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { RangeSlider } from "@/components/ui/range-slider";
import { DropZone } from "@/components/ui/drop-zone";

// ── Field hints from AI briefing parser ─────────────────────────────
// Когда вакансия создана из записи Zoom-брифинга, AI помечает каждое поле
// уровнем уверенности. Здесь храним только статусы, требующие подсветки:
//   "low" — AI неуверен (жёлтая рамка)
//   "missing" — AI не нашёл значение (серая dashed рамка)
// При первом редактировании поля пользователем статус снимается.
const FieldHintsContext = createContext<Map<string, FieldStatus> | null>(null);
function useFieldStatus(field?: string): FieldStatus | undefined {
  const ctx = useContext(FieldHintsContext);
  if (!ctx || !field) return undefined;
  return ctx.get(field);
}
import {
  ROLE_LABELS,
  GRADE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  WORK_FORMAT_LABELS,
} from "@/lib/constants";
import {
  buildFieldsUpdate,
  type VacancyFormData,
  type ScoringCriterion,
  type ParsedFields,
  type FieldStatus,
} from "./parse-fill";

// ── Types ────────────────────────────────────────────────────────────

const INITIAL_DATA: VacancyFormData = {
  title: "",
  clientName: "",
  clientLead: "",
  productDescription: "",
  reasonForHiring: "",
  role: "PRODUCT_DESIGNER",
  grade: "MIDDLE",
  designersNeeded: 1,
  employmentType: "FULL_TIME",
  workFormat: "REMOTE",
  location: "",
  timezone: "",
  salaryRange: "",
  desiredStartDate: "",
  duration: "",
  keyTasks: [],
  requiredSkills: [],
  niceToHaveSkills: [],
  preferredDomains: [],
  requiredTools: [],
  needsInternational: false,
  specialCompetencies: [],
  redFlags: [],
  portfolioReferences: [],
  teamComposition: "",
  decisionMaker: "",
  hiringStages: null,
  testTask: "",
  scoringCriteria: [],
  clientNotes: "",
  internalNotes: "",
};

const STEPS = [
  "Основное",
  "Позиция",
  "Требования",
  "Портрет",
  "Скоринг",
  "Предпросмотр",
];

const CRITERION_TYPE_LABELS: Record<string, string> = {
  required: "Обязательный",
  nice_to_have: "Желательный",
  stop_factor: "Стоп-фактор",
};

const ROLES = Object.keys(ROLE_LABELS);
const GRADES = Object.keys(GRADE_LABELS);
const EMPLOYMENT_TYPES = Object.keys(EMPLOYMENT_TYPE_LABELS);
const WORK_FORMATS = Object.keys(WORK_FORMAT_LABELS);

// ── Один брифинг → несколько вакансий ────────────────────────────────
// На звонке нередко обсуждают две позиции подряд. Запись расшифровывается
// один раз, режется по позициям, и каждая заводится своей формой. Остаток
// живёт в sessionStorage: после создания первой вакансии страница уходит
// в редирект, и без этого второй кусок звонка потерялся бы.

interface BriefingSegment {
  label: string;
  text: string;
}

const PENDING_KEY = "auf:pending-briefing-segments";

function loadPendingSegments(): BriefingSegment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is BriefingSegment =>
        !!s && typeof s.label === "string" && typeof s.text === "string",
    );
  } catch {
    return [];
  }
}

function savePendingSegments(segments: BriefingSegment[]) {
  if (typeof window === "undefined") return;
  try {
    if (segments.length === 0) sessionStorage.removeItem(PENDING_KEY);
    else sessionStorage.setItem(PENDING_KEY, JSON.stringify(segments));
  } catch {
    /* приватный режим / переполнение — не критично, просто не сохранится */
  }
}

// ── Main Component ───────────────────────────────────────────────────

export default function NewVacancyPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<VacancyFormData>(INITIAL_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Audio briefing state
  const [audioParsing, setAudioParsing] = useState(false);
  const [briefingLoaded, setBriefingLoaded] = useState(false);
  const [briefingSummary, setBriefingSummary] = useState<string | null>(null);
  const [briefingTranscript, setBriefingTranscript] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [fieldHints, setFieldHints] = useState<Map<string, FieldStatus>>(new Map());

  // Каким способом заполняем форму: показываем один ввод, а не все три сразу
  const [way, setWay] = useState<"audio" | "pdf" | "text">("audio");

  // Free-text paste state
  const [textInput, setTextInput] = useState("");
  const [textParsing, setTextParsing] = useState(false);

  // Один звонок — несколько позиций: куски, из которых ещё не заведена вакансия
  const [segments, setSegments] = useState<BriefingSegment[] | null>(null);
  const [transcriptLength, setTranscriptLength] = useState(0);
  const [pending, setPending] = useState<BriefingSegment[]>([]);

  // Сколько полей AI заполнил уверенно, где сомневается, чего не нашёл.
  // Считаем от подсказок: каждая — это поле, требующее внимания.
  const totalFieldCount = Object.keys(INITIAL_DATA).length;
  const lowCount = [...fieldHints.values()].filter((v) => v === "low").length;
  const missingCount = [...fieldHints.values()].filter((v) => v === "missing").length;
  const filledCount = totalFieldCount - missingCount;

  const update = <K extends keyof VacancyFormData>(
    field: K,
    value: VacancyFormData[K],
  ) => {
    setData((prev) => ({ ...prev, [field]: value }));
    // Любая правка пользователя — это подтверждение значения. Снимаем подсветку
    // от AI, чтобы поле перестало выглядеть как «требует проверки».
    setFieldHints((prev) => {
      if (!prev.has(field as string)) return prev;
      const next = new Map(prev);
      next.delete(field as string);
      return next;
    });
  };

  const handlePdfUpload = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".pdf") && !ext.endsWith(".docx")) {
      setError("Поддерживаются только .pdf и .docx файлы");
      return;
    }
    setPdfParsing(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/vacancies/parse-pdf", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || `Ошибка ${res.status}`);
      }
      const parsed = await res.json();
      setData((prev) => ({
        ...prev,
        title: parsed.title || prev.title,
        clientName: parsed.clientName || prev.clientName,
        clientLead: parsed.clientLead || prev.clientLead,
        productDescription: parsed.productDescription || prev.productDescription,
        reasonForHiring: parsed.reasonForHiring || prev.reasonForHiring,
        role: parsed.role || prev.role,
        grade: parsed.grade || prev.grade,
        designersNeeded: parsed.designersNeeded || prev.designersNeeded,
        employmentType: parsed.employmentType || prev.employmentType,
        workFormat: parsed.workFormat || prev.workFormat,
        location: parsed.location || prev.location,
        timezone: parsed.timezone || prev.timezone,
        salaryRange: parsed.salaryRange || prev.salaryRange,
        desiredStartDate: parsed.desiredStartDate || prev.desiredStartDate,
        duration: parsed.duration || prev.duration,
        keyTasks: parsed.keyTasks?.length ? parsed.keyTasks : prev.keyTasks,
        requiredSkills: parsed.requiredSkills?.length ? parsed.requiredSkills : prev.requiredSkills,
        niceToHaveSkills: parsed.niceToHaveSkills?.length ? parsed.niceToHaveSkills : prev.niceToHaveSkills,
        preferredDomains: parsed.preferredDomains?.length ? parsed.preferredDomains : prev.preferredDomains,
        requiredTools: parsed.requiredTools?.length ? parsed.requiredTools : prev.requiredTools,
        needsInternational: parsed.needsInternational ?? prev.needsInternational,
        specialCompetencies: parsed.specialCompetencies?.length ? parsed.specialCompetencies : prev.specialCompetencies,
        redFlags: parsed.redFlags?.length ? parsed.redFlags : prev.redFlags,
        portfolioReferences: parsed.portfolioReferences?.length ? parsed.portfolioReferences : prev.portfolioReferences,
        teamComposition: parsed.teamComposition || prev.teamComposition,
        decisionMaker: parsed.decisionMaker || prev.decisionMaker,
        hiringStages: parsed.hiringStages ?? prev.hiringStages,
        testTask: parsed.testTask || prev.testTask,
        scoringCriteria: parsed.scoringCriteria?.length ? parsed.scoringCriteria : prev.scoringCriteria,
        clientNotes: parsed.clientNotes || prev.clientNotes,
        internalNotes: parsed.internalNotes || prev.internalNotes,
      }));
      setPdfLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка парсинга PDF");
    } finally {
      setPdfParsing(false);
    }
  }, []);

  // ── Audio briefing upload ────────────────────────────────────────
  const handleAudioUpload = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".m4a") && !lower.endsWith(".mp3") && !lower.endsWith(".aac")) {
      setError("Поддерживаются только .m4a, .mp3 и .aac файлы");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setError("Файл слишком большой (максимум 200 MB)");
      return;
    }
    setAudioParsing(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/vacancies/parse-audio", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Ошибка ${res.status}`);
      }

      // На записи несколько позиций — не заполняем форму вслепую,
      // а даём выбрать, какую заводим сейчас.
      if (Array.isArray(json.segments) && json.segments.length > 1) {
        setSegments(json.segments as BriefingSegment[]);
        setTranscriptLength(String(json.transcript ?? "").length);
        return;
      }

      // Сохраняем транскрипт + summary даже если поля не пришли (parseError)
      setBriefingTranscript(json.transcript || null);
      setBriefingSummary(json.summary || null);

      // Если шаг 2 (парсинг) упал — открываем форму пустой, чтобы user заполнил вручную
      if (!json.fields) {
        setError(
          json.parseError
            ? `Транскрипт получен, но AI не смог структурировать вакансию: ${json.parseError}. Заполните форму вручную — транскрипт сохранится при создании.`
            : "AI не смог структурировать вакансию. Заполните форму вручную.",
        );
        setBriefingLoaded(true);
        return;
      }

      // Применяем поля + строим карту подсветок
      const { data: newData, hints } = buildFieldsUpdate(
        json.fields as ParsedFields,
      );
      setData((prev) => ({ ...prev, ...newData }));
      setFieldHints(hints);
      setBriefingLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обработки аудио");
    } finally {
      setAudioParsing(false);
    }
  }, []);

  // ── Один звонок → несколько вакансий ─────────────────────────────
  const handleSegmentPick = useCallback(
    async (chosen: BriefingSegment, all: BriefingSegment[]) => {
      setTextParsing(true);
      setError("");
      try {
        const res = await fetch("/api/vacancies/parse-segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chosen.text }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Ошибка ${res.status}`);

        const { data: newData, hints } = buildFieldsUpdate(json.fields as ParsedFields);
        setData((prev) => ({ ...prev, ...newData }));
        setFieldHints(hints);
        // В вакансию сохраняем ТОЛЬКО её часть звонка: иначе в карточке
        // одной позиции лежал бы разговор про соседнюю.
        setBriefingTranscript(chosen.text);
        setBriefingSummary(json.summary ?? null);

        const rest = all.filter((s) => s.label !== chosen.label);
        setPending(rest);
        savePendingSegments(rest);
        setSegments(null);
        setBriefingLoaded(true);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Не удалось разобрать фрагмент: ${err.message}. Заполните форму вручную.`
            : "Не удалось разобрать фрагмент.",
        );
      } finally {
        setTextParsing(false);
      }
    },
    [],
  );

  // Остаток звонка переживает создание первой вакансии: после редиректа
  // пользователь возвращается на эту же страницу и продолжает со второй.
  useEffect(() => {
    const stored = loadPendingSegments();
    if (stored.length > 0) setPending(stored);
  }, []);

  // ── Free-text paste ──────────────────────────────────────────────
  const handleTextParse = useCallback(async () => {
    const text = textInput.trim();
    if (text.length < 20) return;
    setTextParsing(true);
    setError("");
    try {
      const res = await fetch("/api/vacancies/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Ошибка ${res.status}`);
      }
      const { data: newData, hints } = buildFieldsUpdate(json.fields as ParsedFields);
      setData((prev) => ({ ...prev, ...newData }));
      setFieldHints(hints);
      setBriefingLoaded(true); // прячет кнопки загрузки; summary-карточка не появится (briefingSummary остаётся null)
    } catch (err) {
      setError(
        err instanceof Error
          ? `AI не смог структурировать текст: ${err.message}. Заполните форму вручную.`
          : "Не удалось обработать текст. Заполните форму вручную.",
      );
    } finally {
      setTextParsing(false);
    }
  }, [textInput]);

  const canNext = () => {
    if (currentStep === 0) return data.title.trim().length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const body = {
        ...data,
        designersNeeded: data.designersNeeded || 1,
        hiringStages: data.hiringStages || undefined,
        scoringCriteria:
          data.scoringCriteria.length > 0 ? data.scoringCriteria : undefined,
        // Remove empty strings
        clientName: data.clientName || undefined,
        clientLead: data.clientLead || undefined,
        productDescription: data.productDescription || undefined,
        reasonForHiring: data.reasonForHiring || undefined,
        location: data.location || undefined,
        timezone: data.timezone || undefined,
        salaryRange: data.salaryRange || undefined,
        desiredStartDate: data.desiredStartDate || undefined,
        duration: data.duration || undefined,
        teamComposition: data.teamComposition || undefined,
        decisionMaker: data.decisionMaker || undefined,
        testTask: data.testTask || undefined,
        clientNotes: data.clientNotes || undefined,
        internalNotes: data.internalNotes || undefined,
        briefingTranscript: briefingTranscript || undefined,
        briefingSummary: briefingSummary || undefined,
      };

      const res = await fetch("/api/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || `Ошибка ${res.status}`);
      }

      const vacancy = await res.json();
      router.push(`/vacancies/${vacancy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex h-14 items-center bg-card px-6 shadow-[0_1px_0_0_oklch(0_0_0/0.05)]">
        <Link
          href="/vacancies"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Вакансии
        </Link>
      </div>
      <div className="mx-auto max-w-2xl px-6 pb-16">
        <div className="mt-8 mb-6">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">
            Создать вакансию
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Опишите позицию — AI поможет структурировать критерии скоринга
          </p>
        </div>

        {/* Переключатель способов: раньше три кнопки шли стопкой и все три
            занимали экран, хотя пользуется всегда одним. */}
        {!briefingLoaded && !pdfLoaded && !audioParsing && !pdfParsing && !textParsing && (
          <div className="mb-4 inline-flex rounded-full border border-border bg-card p-1">
            {([
              ["audio", "Запись брифинга"],
              ["pdf", "PDF от клиента"],
              ["text", "Текстом"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setWay(id)}
                className={`rounded-full px-4 py-1.5 text-[13px] leading-[18px] transition-colors ${
                  way === id
                    ? "bg-[#F97029] font-medium text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Audio briefing upload */}
        <div className="mb-3">
          {audioParsing ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-foreground/20 bg-muted/30 px-5 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              <span className="text-sm">
                AI расшифровывает встречу и заполняет вакансию... ~1-3 мин
              </span>
            </div>
          ) : !briefingLoaded && !pdfLoaded && way === "audio" ? (
            <DropZone
              accept=".m4a,.mp3,.aac"
              formats="M4A, MP3, AAC"
              maxMb={200}
              disabled={pdfParsing}
              title="Запись брифинга"
              onFile={handleAudioUpload}
            />
          ) : null}
        </div>

        {/* Выбор позиции: на записи распознано несколько вакансий */}
        {segments && segments.length > 1 && (
          <div className="mb-6 rounded-lg border border-foreground/10 bg-muted/30 px-5 py-4">
            <p className="text-sm font-medium mb-1">
              На записи {segments.length} позиции
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Заводим по одной. Выбери, с какой начать — остальные останутся
              здесь, и ты создашь их сразу после сохранения этой.
            </p>
            <div className="space-y-2.5">
              {(() => {
                // Доля разговора: показывает, что запись разобрана целиком,
                // и сколько осталось за пределами позиций — приветствия,
                // оплата, болтовня. Без этого непонятно, не потерян ли кусок.
                const covered = segments.reduce((n, x) => n + x.text.length, 0);
                const whole = Math.max(covered, transcriptLength || covered);
                return segments.map((s, i) => {
                  const share = Math.round((s.text.length / whole) * 100);
                  return (
                    <button
                      key={s.label}
                      type="button"
                      disabled={textParsing}
                      onClick={() => handleSegmentPick(s, segments)}
                      className="group flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#F97029]/50 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      <span className="t-caption font-mono">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="t-card-title block">{s.label}</span>
                        <span className="t-caption mt-1 block font-mono">
                          {s.text.length.toLocaleString("ru")} символов · {share}% разговора
                        </span>
                        <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-secondary">
                          <span
                            className="block h-full rounded-full bg-[#F97029]/70"
                            style={{ width: `${share}%` }}
                          />
                        </span>
                      </span>
                      <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                    </button>
                  );
                });
              })()}
            </div>
            {textParsing && (
              <p className="mt-3 text-xs text-muted-foreground">
                AI заполняет форму по выбранному фрагменту…
              </p>
            )}
          </div>
        )}

        {/* Остаток звонка: позиции, которые ещё предстоит завести */}
        {!segments && pending.length > 0 && (
          <div className="mb-6 rounded-lg border border-[#F97029]/30 bg-[#F97029]/5 px-5 py-4">
            <p className="text-sm font-medium mb-1">
              С того же звонка осталось: {pending.length}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {briefingLoaded
                ? "Сохрани текущую вакансию, потом вернись сюда и заведи следующую."
                : "Продолжи с оставшейся позиции — фрагмент звонка сохранён."}
            </p>
            <div className="space-y-2">
              {pending.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={textParsing || briefingLoaded}
                  onClick={() => handleSegmentPick(s, pending)}
                  className="w-full text-left rounded-md border border-foreground/10 bg-background px-4 py-3 text-sm hover:border-foreground/30 transition-colors disabled:opacity-50"
                >
                  <span className="font-medium">{s.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setPending([]);
                savePendingSegments([]);
              }}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Больше не нужно — убрать
            </button>
          </div>
        )}

        {/* Briefing summary card — показываем над формой когда вакансия пришла из аудио */}
        {briefingLoaded && briefingSummary && (
          <div className="mb-6 overflow-hidden rounded-xl border border-[#F97029]/25 bg-[#F97029]/[0.05]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#F97029]/20 px-5 py-3">
              <span className="t-micro rounded-full bg-[#F97029] px-2 py-[3px] text-white">
                из записи
              </span>
              <span className="t-caption font-mono">брифинг разобран AI</span>
            </div>
            <div className="px-5 py-4">
            <p className="t-body leading-relaxed whitespace-pre-line">
              {briefingSummary}
            </p>

            {/* Счёт полей: сколько AI заполнил, где не уверен, чего не нашёл.
                Без него подсветка отдельных полей теряется среди трёх десятков
                и человек не понимает, сколько работы осталось. */}
            <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1">
              <span className="t-caption">
                заполнено <b className="text-foreground">{filledCount}</b> из {totalFieldCount} полей
              </span>
              {lowCount > 0 && (
                <span className="t-caption text-amber-700 dark:text-amber-400">
                  {lowCount} требуют проверки
                </span>
              )}
              {missingCount > 0 && (
                <span className="t-caption">{missingCount} не нашлись</span>
              )}
            </div>
            {briefingTranscript && (
              <div className="mt-3">
                <button
                  onClick={() => setTranscriptOpen((s) => !s)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {transcriptOpen ? "Свернуть транскрипт" : "Показать полный транскрипт"}
                </button>
                {transcriptOpen && (
                  <pre className="mt-2 max-h-80 overflow-auto rounded border border-foreground/10 bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                    {briefingTranscript}
                  </pre>
                )}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Заполненная форма (аудио/текст) — компактная сводка + сразу активная
            кнопка «Создать вакансию», как у PDF-пути. Полная форма со степпером
            скрыта, пока пользователь не нажмёт «Редактировать вручную». */}
        {briefingLoaded && (
          <div className="mb-8 space-y-4 rounded-lg border border-foreground/10 bg-muted/30 px-5 py-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">{data.title || "Без названия"}</p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">{ROLE_LABELS[data.role] || data.role}</span>
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">{GRADE_LABELS[data.grade] || data.grade}</span>
                {data.workFormat && <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-foreground">{WORK_FORMAT_LABELS[data.workFormat] || data.workFormat}</span>}
                {data.location && <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-foreground">{data.location}</span>}
                {data.salaryRange && <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-foreground">{data.salaryRange}</span>}
              </div>
              {data.requiredSkills.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {data.requiredSkills.slice(0, 6).map((s) => (
                    <span key={s} className="rounded bg-neutral-200 px-1.5 py-0.5 text-[11px]">{s}</span>
                  ))}
                  {data.requiredSkills.length > 6 && (
                    <span className="text-[11px] text-muted-foreground">+{data.requiredSkills.length - 6}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleSubmit} disabled={submitting} size="sm">
                {submitting ? "Создание..." : "Создать вакансию"}
              </Button>
              <button
                onClick={() => { setBriefingLoaded(false); setCurrentStep(0); }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Редактировать вручную
              </button>
            </div>
          </div>
        )}

        {/* PDF upload */}
        <div className={`mb-8 ${way !== "pdf" && !pdfLoaded && !pdfParsing ? "hidden" : ""}`}>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfUpload(f);
            }}
          />
          {pdfParsing ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-foreground/20 bg-muted/30 px-5 py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              <span className="text-sm">AI анализирует документ...</span>
            </div>
          ) : pdfLoaded ? (
            <div className="space-y-4 rounded-lg border border-foreground/10 bg-muted/30 px-5 py-5">
              {/* Summary */}
              <div className="space-y-2">
                <p className="text-sm font-medium">{data.title || "Без названия"}</p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">{ROLE_LABELS[data.role] || data.role}</span>
                  <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">{GRADE_LABELS[data.grade] || data.grade}</span>
                  {data.workFormat && <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-foreground">{WORK_FORMAT_LABELS[data.workFormat] || data.workFormat}</span>}
                  {data.location && <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-foreground">{data.location}</span>}
                  {data.salaryRange && <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-foreground">{data.salaryRange}</span>}
                </div>
                {data.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {data.requiredSkills.slice(0, 6).map((s) => (
                      <span key={s} className="rounded bg-neutral-200 px-1.5 py-0.5 text-[11px]">{s}</span>
                    ))}
                    {data.requiredSkills.length > 6 && (
                      <span className="text-[11px] text-muted-foreground">+{data.requiredSkills.length - 6}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button onClick={handleSubmit} disabled={submitting} size="sm">
                  {submitting ? "Создание..." : "Создать вакансию"}
                </Button>
                <button
                  onClick={() => { setPdfLoaded(false); setCurrentStep(0); }}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Редактировать вручную
                </button>
                <button
                  onClick={() => {
                    setPdfLoaded(false);
                    pdfInputRef.current?.click();
                  }}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Загрузить другой
                </button>
              </div>
            </div>
          ) : (
            <DropZone
              accept=".pdf,.docx"
              formats="PDF или DOCX"
              maxMb={20}
              disabled={audioParsing}
              title="Описание от клиента"
              onFile={handlePdfUpload}
            />
          )}
        </div>

        {/* Free-text paste — заполнение формы из вставленного текста */}
        {!briefingLoaded && !pdfLoaded && !audioParsing && !pdfParsing && (way === "text" || textParsing) && (
          <div className="mb-8 space-y-2">
            {textParsing ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-foreground/20 bg-muted/30 px-5 py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                <span className="text-sm">
                  AI анализирует текст и заполняет вакансию...
                </span>
              </div>
            ) : (
              <>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  aria-label="Описание вакансии"
                  rows={5}
                  placeholder="Вставьте описание вакансии: письмо от клиента, сообщение, заметки…"
                  className="w-full rounded-lg border border-dashed border-foreground/20 bg-transparent px-5 py-4 text-sm placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors resize-y"
                />
                <button
                  onClick={handleTextParse}
                  disabled={textParsing || textInput.trim().length < 20}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 px-5 py-4 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                  Заполнить из текста — AI структурирует вакансию
                </button>
              </>
            )}
          </div>
        )}

        {/* Step indicator — hidden when PDF loaded and not editing */}
        <div className={`mb-8 flex gap-1 ${pdfLoaded || briefingLoaded ? "hidden" : ""}`}>
          {STEPS.map((label, i) => (
            <button
              key={i}
              onClick={() => {
                if (i < currentStep) setCurrentStep(i);
              }}
              className={`
                flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors
                ${
                  i === currentStep
                    ? "bg-[#F97029] text-white"
                    : i < currentStep
                      ? "bg-muted text-foreground cursor-pointer hover:bg-muted/80"
                      : "bg-muted/50 text-muted-foreground"
                }
              `}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                {i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Step content — hidden when PDF loaded and not editing */}
        <FieldHintsContext.Provider value={fieldHints}>
        {/* Легенда подсветки: без неё жёлтая рамка выглядит просто ошибкой,
            а пунктир — незаполненным полем. Показываем только когда AI
            действительно что-то пометил. */}
        {fieldHints.size > 0 && !pdfLoaded && !briefingLoaded && (
          <div className="t-caption mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-secondary/60 px-4 py-2.5">
            <span className="font-medium text-foreground">Как читать подсветку</span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" />
              AI не уверен — проверь
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-dashed border-border" />
              не нашёл в записи
            </span>
          </div>
        )}

        <div className={`space-y-6 ${pdfLoaded || briefingLoaded ? "hidden" : ""}`}>
          {currentStep === 0 && <Step1 data={data} update={update} />}
          {currentStep === 1 && <Step2 data={data} update={update} />}
          {currentStep === 2 && <Step3 data={data} update={update} />}
          {currentStep === 3 && <Step4 data={data} update={update} />}
          {currentStep === 4 && <Step5 data={data} update={update} />}
          {currentStep === 5 && <StepPreview data={data} />}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep((s) => s - 1)}
              >
                Назад
              </Button>
            )}
            <div className="flex-1" />
            {currentStep < STEPS.length - 1 ? (
              <Button
                onClick={() => setCurrentStep((s) => s + 1)}
                disabled={!canNext()}
              >
                Далее
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Создание..." : "Создать вакансию"}
              </Button>
            )}
          </div>
        </div>
        </FieldHintsContext.Provider>
      </div>
    </div>
  );
}

// ── Step Components ──────────────────────────────────────────────────

type UpdateFn = <K extends keyof VacancyFormData>(
  field: K,
  value: VacancyFormData[K],
) => void;

function Step1({
  data,
  update,
}: {
  data: VacancyFormData;
  update: UpdateFn;
}) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <SectionTitle>Основная информация</SectionTitle>

        <FieldGroup label="Название вакансии" required field="title">
          <Input
            value={data.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Senior Product Designer в Fintech стартап"
          />
        </FieldGroup>

        <FieldGroup label="Клиент" field="clientName">
          <Input
            value={data.clientName}
            onChange={(e) => update("clientName", e.target.value)}
            placeholder="Название компании"
          />
        </FieldGroup>

        <FieldGroup label="Лид со стороны клиента" field="clientLead">
          <Input
            value={data.clientLead}
            onChange={(e) => update("clientLead", e.target.value)}
            placeholder="Имя контактного лица"
          />
        </FieldGroup>

        <FieldGroup label="Описание продукта / команды" field="productDescription">
          <Textarea
            value={data.productDescription}
            onChange={(v) => update("productDescription", v)}
            placeholder="Чем занимается компания, какой продукт, команда..."
          />
        </FieldGroup>

        <FieldGroup label="Причина найма" field="reasonForHiring">
          <Textarea
            value={data.reasonForHiring}
            onChange={(v) => update("reasonForHiring", v)}
            placeholder="Почему открылась вакансия..."
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function Step2({
  data,
  update,
}: {
  data: VacancyFormData;
  update: UpdateFn;
}) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <SectionTitle>Параметры позиции</SectionTitle>

        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="Роль" required field="role">
            <NativeSelect
              value={data.role}
              onChange={(v) => update("role", v)}
              options={ROLES}
              labels={ROLE_LABELS}
            />
          </FieldGroup>

          <FieldGroup label="Грейд" required field="grade">
            <NativeSelect
              value={data.grade}
              onChange={(v) => update("grade", v)}
              options={GRADES}
              labels={GRADE_LABELS}
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FieldGroup label="Кол-во дизайнеров" field="designersNeeded">
            <Input
              type="number"
              min={1}
              value={data.designersNeeded}
              onChange={(e) =>
                update("designersNeeded", parseInt(e.target.value) || 1)
              }
            />
          </FieldGroup>

          <FieldGroup label="Тип занятости" field="employmentType">
            <NativeSelect
              value={data.employmentType}
              onChange={(v) => update("employmentType", v)}
              options={EMPLOYMENT_TYPES}
              labels={EMPLOYMENT_TYPE_LABELS}
            />
          </FieldGroup>

          <FieldGroup label="Формат работы" field="workFormat">
            <NativeSelect
              value={data.workFormat}
              onChange={(v) => update("workFormat", v)}
              options={WORK_FORMATS}
              labels={WORK_FORMAT_LABELS}
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="Локация" field="location">
            <Input
              value={data.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="Москва / любая"
            />
          </FieldGroup>

          <FieldGroup label="Часовой пояс" field="timezone">
            <Input
              value={data.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              placeholder="UTC+3"
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="Зарплатная вилка" field="salaryRange">
            <Input
              value={data.salaryRange}
              onChange={(e) => update("salaryRange", e.target.value)}
              placeholder="200-300k руб."
            />
          </FieldGroup>

          <FieldGroup label="Желаемый старт" field="desiredStartDate">
            <Input
              value={data.desiredStartDate}
              onChange={(e) => update("desiredStartDate", e.target.value)}
              placeholder="Апрель 2026"
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Продолжительность" field="duration">
          <Input
            value={data.duration}
            onChange={(e) => update("duration", e.target.value)}
            placeholder="Бессрочно / 6 месяцев"
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function Step3({
  data,
  update,
}: {
  data: VacancyFormData;
  update: UpdateFn;
}) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <SectionTitle>Требования</SectionTitle>

        <TagField
          label="Ключевые задачи"
          values={data.keyTasks}
          onChange={(v) => update("keyTasks", v)}
          placeholder="Добавить задачу..."
          field="keyTasks"
        />

        <TagField
          label="Обязательные навыки"
          values={data.requiredSkills}
          onChange={(v) => update("requiredSkills", v)}
          placeholder="Добавить навык..."
          field="requiredSkills"
        />

        <TagField
          label="Будет плюсом"
          values={data.niceToHaveSkills}
          onChange={(v) => update("niceToHaveSkills", v)}
          placeholder="Добавить навык..."
          field="niceToHaveSkills"
        />

        <TagField
          label="Желательные домены"
          values={data.preferredDomains}
          onChange={(v) => update("preferredDomains", v)}
          placeholder="fintech, e-commerce..."
          field="preferredDomains"
        />

        <TagField
          label="Инструменты"
          values={data.requiredTools}
          onChange={(v) => update("requiredTools", v)}
          placeholder="Figma, Sketch..."
          field="requiredTools"
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="needsInternational"
            checked={data.needsInternational}
            onChange={(e) => update("needsInternational", e.target.checked)}
            className="h-4 w-4 rounded border-input accent-foreground"
          />
          <label htmlFor="needsInternational" className="text-sm">
            Нужен международный опыт
          </label>
        </div>

        <TagField
          label="Спец. компетенции"
          values={data.specialCompetencies}
          onChange={(v) => update("specialCompetencies", v)}
          placeholder="Design systems, accessibility..."
          field="specialCompetencies"
        />

        <TagField
          label="Стоп-факторы (red flags)"
          values={data.redFlags}
          onChange={(v) => update("redFlags", v)}
          placeholder="Нет портфолио, менее 2 лет опыта..."
          field="redFlags"
        />
      </CardContent>
    </Card>
  );
}

function Step4({
  data,
  update,
}: {
  data: VacancyFormData;
  update: UpdateFn;
}) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <SectionTitle>Портрет кандидата</SectionTitle>

        <TagField
          label="Референсы портфолио"
          values={data.portfolioReferences}
          onChange={(v) => update("portfolioReferences", v)}
          placeholder="https://..."
          field="portfolioReferences"
        />

        <FieldGroup label="Состав команды" field="teamComposition">
          <Textarea
            value={data.teamComposition}
            onChange={(v) => update("teamComposition", v)}
            placeholder="С кем будет работать дизайнер..."
          />
        </FieldGroup>

        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="Кто принимает решение" field="decisionMaker">
            <Input
              value={data.decisionMaker}
              onChange={(e) => update("decisionMaker", e.target.value)}
              placeholder="CTO / Head of Design"
            />
          </FieldGroup>

          <FieldGroup label="Этапов собеседования" field="hiringStages">
            <Input
              type="number"
              min={1}
              value={data.hiringStages ?? ""}
              onChange={(e) =>
                update(
                  "hiringStages",
                  e.target.value ? parseInt(e.target.value) : null,
                )
              }
              placeholder="3"
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Тестовое задание" field="testTask">
          <Textarea
            value={data.testTask}
            onChange={(v) => update("testTask", v)}
            placeholder="Описание тестового задания, если есть..."
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function Step5({
  data,
  update,
}: {
  data: VacancyFormData;
  update: UpdateFn;
}) {
  const [freeText, setFreeText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  // New criterion form
  const [newCriterion, setNewCriterion] = useState("");
  const [newWeight, setNewWeight] = useState(10);
  const [newType, setNewType] = useState<"required" | "nice_to_have" | "stop_factor">("required");

  const totalWeight = data.scoringCriteria.reduce((s, c) => s + c.weight, 0);

  const handleAIParse = async () => {
    if (!freeText.trim()) return;
    setParsing(true);
    setParseError("");

    try {
      const res = await fetch("/api/vacancies/parse-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: freeText }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Ошибка парсинга");
      }

      const result = await res.json();
      update("scoringCriteria", result.criteria);
      setFreeText("");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setParsing(false);
    }
  };

  const addCriterion = () => {
    if (!newCriterion.trim()) return;
    update("scoringCriteria", [
      ...data.scoringCriteria,
      { criterion: newCriterion.trim(), weight: newWeight, type: newType },
    ]);
    setNewCriterion("");
    setNewWeight(10);
  };

  const removeCriterion = (idx: number) => {
    update(
      "scoringCriteria",
      data.scoringCriteria.filter((_, i) => i !== idx),
    );
  };

  const updateCriterion = (idx: number, field: keyof ScoringCriterion, value: unknown) => {
    const updated = data.scoringCriteria.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c,
    );
    update("scoringCriteria", updated);
  };

  return (
    <div className="space-y-6">
      {/* AI parse */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <SectionTitle>AI-структурирование критериев</SectionTitle>
          <p className="text-xs text-muted-foreground">
            Опишите требования свободным текстом — AI разобьёт их на критерии с весами
          </p>
          <Textarea
            value={freeText}
            onChange={setFreeText}
            placeholder="Нужен сильный продуктовый дизайнер с опытом в B2B SaaS, обязательно enterprise UX, приоритет — системное мышление и навыки исследований..."
            rows={4}
          />
          <div className="flex gap-2 items-center">
            <Button
              onClick={handleAIParse}
              disabled={parsing || !freeText.trim()}
              variant="outline"
            >
              {parsing ? "Анализ..." : "AI-структурировать"}
            </Button>
            {parseError && (
              <span className="text-xs text-destructive">{parseError}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual criteria */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>Критерии скоринга</SectionTitle>
            <span
              className={`text-xs font-medium ${
                totalWeight === 100
                  ? "text-emerald-600"
                  : totalWeight > 100
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              Сумма весов: {totalWeight}%
              {totalWeight !== 100 && totalWeight > 0 && " (рекомендуется 100%)"}
            </span>
          </div>

          {/* Existing criteria */}
          {data.scoringCriteria.length > 0 && (
            <div className="space-y-2">
              {data.scoringCriteria.map((c, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2.5">
                    <span className="t-card-title min-w-0 flex-1">{c.criterion}</span>
                    <select
                      value={c.type}
                      onChange={(e) => updateCriterion(i, "type", e.target.value)}
                      className="h-7 [border-radius:var(--r-icon)] border border-input bg-background px-2 text-xs outline-none"
                    >
                      <option value="required">Обязательный</option>
                      <option value="nice_to_have">Желательный</option>
                      <option value="stop_factor">Стоп-фактор</option>
                    </select>
                    {c.type !== "stop_factor" && (
                      <span className="t-card-title w-11 text-right tabular-nums">
                        {c.weight}%
                      </span>
                    )}
                    <button
                      onClick={() => removeCriterion(i)}
                      className="px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Убрать критерий «${c.criterion}»`}
                    >
                      &times;
                    </button>
                  </div>

                  {c.type !== "stop_factor" ? (
                    <RangeSlider
                      label={`Вес критерия «${c.criterion}»`}
                      value={c.weight}
                      onChange={(v) => updateCriterion(i, "weight", v)}
                    />
                  ) : (
                    <p className="t-caption">
                      Кандидаты с этим признаком отсеиваются до скоринга — вес не нужен.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new criterion */}
          <div className="flex items-end gap-2 border-t pt-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                Критерий
              </label>
              <Input
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                placeholder="Enterprise UX опыт"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCriterion();
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Тип
              </label>
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(
                    e.target.value as "required" | "nice_to_have" | "stop_factor",
                  )
                }
                className="h-8 [border-radius:var(--r-icon)] border border-input bg-background px-2 text-sm outline-none"
              >
                <option value="required">Обязательный</option>
                <option value="nice_to_have">Желательный</option>
                <option value="stop_factor">Стоп-фактор</option>
              </select>
            </div>
            <div className="w-20">
              <label className="mb-1 block text-xs text-muted-foreground">
                Вес %
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                value={newWeight}
                onChange={(e) => setNewWeight(parseInt(e.target.value) || 0)}
              />
            </div>
            <Button onClick={addCriterion} disabled={!newCriterion.trim()}>
              Добавить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <SectionTitle>Заметки</SectionTitle>

          <FieldGroup label="Заметки по клиенту" field="clientNotes">
            <Textarea
              value={data.clientNotes}
              onChange={(v) => update("clientNotes", v)}
              placeholder="Особенности работы с клиентом..."
            />
          </FieldGroup>

          <FieldGroup label="Внутренние заметки" field="internalNotes">
            <Textarea
              value={data.internalNotes}
              onChange={(v) => update("internalNotes", v)}
              placeholder="Внутренняя информация для команды..."
            />
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}

function StepPreview({ data }: { data: VacancyFormData }) {
  const totalWeight = data.scoringCriteria.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{data.title}</h2>
              {data.clientName && (
                <p className="text-sm text-muted-foreground">
                  {data.clientName}
                  {data.clientLead && ` / ${data.clientLead}`}
                </p>
              )}
            </div>
            <div className="flex gap-1.5">
              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{ROLE_LABELS[data.role] || data.role}</span>
              <span className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-0.5 text-xs text-foreground">{GRADE_LABELS[data.grade] || data.grade}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <InfoRow
              label="Занятость"
              value={EMPLOYMENT_TYPE_LABELS[data.employmentType]}
            />
            <InfoRow
              label="Формат"
              value={WORK_FORMAT_LABELS[data.workFormat]}
            />
            {data.designersNeeded > 1 && (
              <InfoRow
                label="Кол-во"
                value={`${data.designersNeeded} чел.`}
              />
            )}
            {data.location && <InfoRow label="Локация" value={data.location} />}
            {data.timezone && (
              <InfoRow label="Часовой пояс" value={data.timezone} />
            )}
            {data.salaryRange && (
              <InfoRow label="Зарплата" value={data.salaryRange} />
            )}
            {data.desiredStartDate && (
              <InfoRow label="Старт" value={data.desiredStartDate} />
            )}
            {data.duration && (
              <InfoRow label="Длительность" value={data.duration} />
            )}
          </div>

          {data.productDescription && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Описание</p>
              <p className="text-sm">{data.productDescription}</p>
            </div>
          )}
          {data.reasonForHiring && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Причина найма
              </p>
              <p className="text-sm">{data.reasonForHiring}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requirements */}
      {(data.keyTasks.length > 0 ||
        data.requiredSkills.length > 0 ||
        data.niceToHaveSkills.length > 0 ||
        data.requiredTools.length > 0) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <SectionTitle>Требования</SectionTitle>
            <PreviewTags label="Ключевые задачи" items={data.keyTasks} />
            <PreviewTags label="Обязательные навыки" items={data.requiredSkills} />
            <PreviewTags label="Будет плюсом" items={data.niceToHaveSkills} />
            <PreviewTags label="Домены" items={data.preferredDomains} />
            <PreviewTags label="Инструменты" items={data.requiredTools} />
            <PreviewTags label="Спец. компетенции" items={data.specialCompetencies} />
            <PreviewTags label="Стоп-факторы" items={data.redFlags} variant="destructive" />
            {data.needsInternational && (
              <p className="text-sm text-muted-foreground">
                Нужен международный опыт
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Candidate portrait */}
      {(data.teamComposition ||
        data.decisionMaker ||
        data.hiringStages ||
        data.testTask ||
        data.portfolioReferences.length > 0) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <SectionTitle>Портрет кандидата</SectionTitle>
            <PreviewTags label="Референсы портфолио" items={data.portfolioReferences} />
            {data.teamComposition && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Команда</p>
                <p className="text-sm">{data.teamComposition}</p>
              </div>
            )}
            {data.decisionMaker && (
              <InfoRow label="Принимает решение" value={data.decisionMaker} />
            )}
            {data.hiringStages && (
              <InfoRow label="Этапов" value={`${data.hiringStages}`} />
            )}
            {data.testTask && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Тестовое задание
                </p>
                <p className="text-sm">{data.testTask}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scoring criteria */}
      {data.scoringCriteria.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <SectionTitle>Критерии скоринга</SectionTitle>
              <span
                className={`text-xs font-medium ${
                  totalWeight === 100
                    ? "text-emerald-600"
                    : "text-muted-foreground"
                }`}
              >
                {totalWeight}%
              </span>
            </div>
            <div className="space-y-2">
              {data.scoringCriteria.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{c.criterion}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.type === "stop_factor" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}`}>
                      {CRITERION_TYPE_LABELS[c.type]}
                    </span>
                  </div>
                  <span className="text-muted-foreground">{c.weight}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {(data.clientNotes || data.internalNotes) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <SectionTitle>Заметки</SectionTitle>
            {data.clientNotes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  По клиенту
                </p>
                <p className="text-sm">{data.clientNotes}</p>
              </div>
            )}
            {data.internalNotes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Внутренние
                </p>
                <p className="text-sm">{data.internalNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Reusable Inline Components ───────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-eyebrow mb-3 opacity-70">
      {children}
    </p>
  );
}

function FieldGroup({
  label,
  required,
  field,
  children,
}: {
  label: string;
  required?: boolean;
  field?: string;
  children: React.ReactNode;
}) {
  const status = useFieldStatus(field);
  // Подсветка через прокрытие ребёнка (input/textarea/select наследуют классы
  // от обёртки через [data-status] селектор в globals.css ниже не использовали,
  // делаем проще — рисуем внешнюю рамку на обёртке children).
  const wrapClass =
    status === "low"
      ? "rounded-md ring-2 ring-amber-300/70 ring-offset-1 ring-offset-background"
      : status === "missing"
        ? "rounded-md ring-1 ring-dashed ring-neutral-400/60"
        : "";
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <span>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        {status === "low" && (
          <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">
            AI не уверен — проверь
          </span>
        )}
        {status === "missing" && (
          <span className="text-[10px] font-normal text-neutral-500">
            AI не нашёл, заполни вручную
          </span>
        )}
      </label>
      <div className={wrapClass}>{children}</div>
    </div>
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="flex w-full [border-radius:var(--r-button)] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:border-ring transition-colors resize-y"
    />
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-8 w-full [border-radius:var(--r-button)] border border-input bg-background px-3 text-sm outline-none focus:border-ring transition-colors"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {labels[opt] || opt}
        </option>
      ))}
    </select>
  );
}

function TagField({
  label,
  values,
  onChange,
  placeholder,
  field,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  field?: string;
}) {
  const [input, setInput] = useState("");
  const status = useFieldStatus(field);

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  const remove = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  const wrapClass =
    status === "low"
      ? "rounded-md ring-2 ring-amber-300/70 ring-offset-1 ring-offset-background p-2"
      : status === "missing"
        ? "rounded-md ring-1 ring-dashed ring-neutral-400/60 p-2"
        : "";

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <span>{label}</span>
        {status === "low" && (
          <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">
            AI не уверен — проверь
          </span>
        )}
        {status === "missing" && (
          <span className="text-[10px] font-normal text-neutral-500">
            AI не нашёл, заполни вручную
          </span>
        )}
      </label>
      <div className={wrapClass}>
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-card [box-shadow:var(--shadow-card)] px-2.5 py-0.5 text-xs font-normal"
            >
              {v}
              <button
                onClick={() => remove(i)}
                className="ml-0.5 hover:text-foreground text-muted-foreground"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          variant="outline"
          onClick={add}
          disabled={!input.trim()}
          className="shrink-0"
        >
          +
        </Button>
      </div>
      </div>
    </div>
  );
}

function PreviewTags({
  label,
  items,
  variant = "secondary",
}: {
  label: string;
  items: string[];
  variant?: "secondary" | "destructive";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span
            key={i}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-normal ${variant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-card [box-shadow:var(--shadow-card)] text-foreground"}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </div>
  );
}
