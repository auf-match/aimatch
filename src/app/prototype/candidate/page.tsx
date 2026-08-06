"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimateCount } from "@/components/unlumen-ui/animate-count";
import {
  ArrowLeft,
  Pencil,
  ExternalLink,
  Sparkles,
  TrendingUp,
  ThumbsUp,
  Target,
  Briefcase,
  MapPin,
  Clock,
  Globe,
  Monitor,
  Award,
  Layers,
  GraduationCap,
  Wallet,
  Languages,
  CheckCircle2,
  ChevronDown,
  Building2,
  LayoutGrid,
  AlertTriangle,
  Star,
  Mail,
  Send,
  Linkedin,
  Link2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { PrototypeShell } from "../_shell";
import { cn } from "@/lib/utils";

// ── Демо-данные (полная форма карточки кандидата) ────────────────────
const candidate = {
  name: "Игорь Шнайдер",
  role: "Art Director",
  grade: "Senior+",
  matchScore: 80,
  matchLabel: "Хорошее соответствие",
  summary:
    "Игорь Марк Шнайдер — опытный дизайнер и иллюстратор с более чем 8 годами фриланс-опыта. Специализируется на арт-дирекшне, брендинге, промышленном и графическом дизайне. Ведёт команды, создаёт обучающие материалы, работает с международными клиентами.",
  triage: "Новый",
  info: {
    role: "Art Director",
    grade: "Senior+",
    experience: "8 лет",
    platforms: "веб, мобильные приложения, десктоп",
    location: "Тбилиси, Грузия",
    timezone: "GMT+4",
    languages: "Русский (C2), English (B2)",
    education: "БВШД, графический дизайн",
    salary: "от 4 500 $/мес",
  },
  flags: ["BigTech", "Международный опыт"],
  specializations: [
    "Арт-дирекшн",
    "Графический дизайн",
    "Промышленный дизайн",
    "Коммуникационный дизайн",
    "Айдентика и брендинг",
    "Упаковка и печать",
  ],
  strengths: [
    "Широкий спектр специализаций в дизайне",
    "Опыт арт-дирекшна и управления командами",
    "Опыт создания обучающих материалов и наставничества",
    "Международный опыт работы",
  ],
  concerns: [
    "Не указан уровень владения английским языком",
    "Мало продуктовых кейсов с метриками",
  ],
  recommendation:
    "Отлично подходит для бренд- и коммуникационных команд в сферах e-commerce, events и медиа. Силён в айдентике и арт-дирекшне; для продуктовых ролей стоит уточнить опыт с метриками.",
  companies: [
    {
      id: "c1",
      company: "UrbanAds",
      role: "Art Director",
      duration: "2 г 3 мес",
      type: { label: "Студия", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
      achievements: [
        "Собрал и вёл команду из 4 дизайнеров",
        "Ребрендинг для 6 клиентов из e-commerce",
        "Запустил дизайн-систему бренд-материалов",
      ],
    },
    {
      id: "c2",
      company: "Freelance",
      role: "Brand / Graphic Designer",
      duration: "4 года",
      type: { label: "Продукт", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
      achievements: ["30+ проектов айдентики", "Работа с клиентами из США и ЕС"],
    },
    {
      id: "c3",
      company: "Yandex",
      role: "Visual Designer",
      duration: "1 г 6 мес",
      type: { label: "BigTech", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
      achievements: ["Кампании для промо-страниц", "Гайдлайны иллюстраций"],
    },
  ],
  portfolio: {
    direction: "communication" as const,
    avg: 77,
    scores: [
      { label: "Мастерство визуала", value: 82, explanation: "Чистая, уверенная графика; сильная композиция в промо-кейсах." },
      { label: "Сила концепции", value: 78, explanation: "Идеи считываются, но местами не хватает нарратива вокруг бренда." },
      { label: "Типографика", value: 88, explanation: "Отличная работа со шрифтовыми парами и иерархией." },
      { label: "Бренд-системы", value: 74, explanation: "Есть системность, но мало примеров масштабирования на много носителей." },
      { label: "Диапазон стилей", value: 70, explanation: "Преобладает один визуальный почерк." },
      { label: "Подача кейсов", value: 65, explanation: "Кейсы без процесса и обоснований решений." },
      { label: "Актуальность", value: 80, explanation: "Стиль современный, попадает в текущие тренды." },
    ],
    overallAssessment:
      "Сильный бренд- и графический дизайнер с уверенным визуальным вкусом и типографикой. Портфолио убедительно показывает результат, но слабее раскрывает процесс и продуктовую аргументацию.",
    strengths: ["Сильная типографика и композиция", "Целостный визуальный вкус", "Современный, актуальный стиль"],
    concerns: ["Кейсы без описания процесса", "Мало примеров сложных бренд-систем"],
    redFlags: ["Нет метрик влияния работ на бизнес"],
    cases: [
      {
        id: "case1",
        title: "Ребрендинг UrbanAds",
        description: "Полный редизайн айдентики: логотип, палитра, типографика, гайдлайны и носители.",
        strengths: ["Цельная система", "Сильная типографика"],
        concerns: ["Не показан процесс исследования"],
      },
      {
        id: "case2",
        title: "Промо-кампания Yandex Games",
        description: "Серия ключевых визуалов и промо-страниц для игрового направления.",
        strengths: ["Яркий визуал", "Хорошая адаптация под форматы"],
        concerns: ["Нет данных по результатам кампании"],
      },
    ],
    screenshotsAnalyzed: 24,
  },
  portfolioLinks: ["https://igorschneider.com", "https://behance.net/igorschneider"],
  contacts: {
    email: "igor.schneider@example.com",
    telegram: "@igor_schneider",
    linkedin: "https://linkedin.com/in/igorschneider",
  },
  pipelines: [
    { title: "Senior / Middle+ Brand Designer", client: "UrbanAds", grade: "Middle+", stage: "Одобрен ДЛ", score: 80 },
  ],
  matches: [
    { title: "Графический дизайнер", note: "Игорь — сильный специалист по визуалу и брендингу", score: 85 },
    { title: "Яигры ком", note: "Хороший фит по арт-дирекшну, но нет игрового опыта", score: 66 },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────
function scoreTone(s: number) {
  if (s >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
function scoreRing(s: number) {
  if (s >= 75) return "border-emerald-500/30 bg-emerald-500/10";
  if (s >= 50) return "border-amber-500/30 bg-amber-500/10";
  return "border-red-500/30 bg-red-500/10";
}
function barColor(v: number) {
  if (v >= 75) return "bg-emerald-500";
  if (v >= 55) return "bg-primary";
  if (v >= 35) return "bg-amber-400";
  return "bg-destructive/70";
}

function SectionTitle({ icon: Icon, title, tint = "text-primary" }: { icon: React.ElementType; title: string; tint?: string }) {
  return (
    <CardTitle className="flex items-center gap-2 text-sm">
      <Icon className={cn("size-4", tint)} /> {title}
    </CardTitle>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, explanation }: { label: string; value: number; explanation: string }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-40 shrink-0 text-sm">{label}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full rounded-full transition-all", barColor(value))} style={{ width: `${value}%` }} />
        </div>
        <span className="w-8 text-right text-sm font-semibold tabular-nums">{value}</span>
      </div>
      {explanation && <p className="ml-40 mt-1 pl-3 text-xs leading-snug text-muted-foreground">{explanation}</p>}
    </div>
  );
}

export default function CandidatePrototype() {
  const p = candidate.portfolio;
  // Триггер анимации счётчиков (Unlumen AnimateCount): 0 → значение после маунта
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <PrototypeShell>
        {/* Top bar */}
        <div className="mb-5 flex items-center justify-between">
          <Link href="/prototype/candidates" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeft /> Кандидаты
          </Link>
          <Button variant="outline" size="sm">
            <Pencil /> Редактировать
          </Button>
        </div>

        {/* Hero */}
        <Card className="rounded-xl border border-border shadow-sm">
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarFallback className="bg-primary/12 text-xl font-semibold text-primary">И</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{candidate.name}</h1>
                <p className="text-sm text-muted-foreground">{candidate.role}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{candidate.grade}</Badge>
                  <a
                    href={candidate.portfolioLinks[0]}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Портфолио <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>
            <div className="sm:w-56 sm:border-l sm:border-border sm:pl-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Match score</p>
              <div className="mt-1 flex items-baseline gap-1">
                <AnimateCount className="text-5xl font-bold leading-none text-primary">
                  {animated ? candidate.matchScore : 0}
                </AnimateCount>
                <span className="text-xl font-semibold text-primary">%</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${candidate.matchScore}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{candidate.matchLabel}</p>
            </div>
          </CardContent>
        </Card>

        <div className="my-5">
          <Button size="lg" className="w-full sm:w-auto">
            <Target /> Проверить по всем вакансиям
          </Button>
        </div>

        {/* Content grid */}
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          {/* ── Left column ── */}
          <div className="flex flex-col gap-5">
            {/* AI summary */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={Sparkles} title="AI-резюме" />
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <p className="text-sm leading-relaxed text-muted-foreground">{candidate.summary}</p>
              </CardContent>
            </Card>

            {/* Основная информация */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-1">
                <SectionTitle icon={Briefcase} title="Основная информация" />
              </CardHeader>
              <CardContent className="p-5 pt-2">
                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  <InfoRow icon={Briefcase} label="Роль" value={candidate.info.role} />
                  <InfoRow icon={Award} label="Грейд" value={candidate.info.grade} />
                  <InfoRow icon={Clock} label="Опыт" value={candidate.info.experience} />
                  <InfoRow icon={Monitor} label="Платформы" value={candidate.info.platforms} />
                  <InfoRow icon={MapPin} label="Локация" value={candidate.info.location} />
                  <InfoRow icon={Globe} label="Часовой пояс" value={candidate.info.timezone} />
                  <InfoRow icon={Languages} label="Языки" value={candidate.info.languages} />
                  <InfoRow icon={GraduationCap} label="Образование" value={candidate.info.education} />
                  <InfoRow icon={Wallet} label="Зарплата" value={candidate.info.salary} />
                </div>
                <Separator className="my-3" />
                <div className="flex flex-wrap gap-2">
                  {candidate.flags.map((f) => (
                    <Badge key={f} variant="tinted">
                      <CheckCircle2 className="size-3" /> {f}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Специализации */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={Layers} title="Специализации" />
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="flex flex-wrap gap-2">
                  {candidate.specializations.map((s) => (
                    <Badge key={s} variant="outline">{s}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Компании */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={Building2} title="Компании" tint="text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <Accordion className="flex flex-col gap-2">
                  {candidate.companies.map((c) => (
                    <AccordionItem key={c.id} value={c.id} className="rounded-lg border border-border">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex flex-1 items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
                            {c.company.charAt(0)}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="truncate text-sm font-medium">{c.company}</p>
                            <p className="truncate text-xs text-muted-foreground">{c.role}</p>
                          </div>
                          <div className="ml-auto flex items-center gap-2 pr-1">
                            <span className="text-xs text-muted-foreground">{c.duration}</span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", c.type.cls)}>{c.type.label}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <ul className="ml-11 space-y-1 text-xs text-muted-foreground">
                          {c.achievements.map((a, j) => (
                            <li key={j} className="flex gap-1.5"><span className="text-muted-foreground/50">·</span>{a}</li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>

            {/* Анализ портфолио */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="flex-row items-center justify-between p-5 pb-3">
                <div className="flex items-center gap-2">
                  <SectionTitle icon={LayoutGrid} title="Анализ портфолио" />
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                    Коммуникационный
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm">Перепроанализировать</Button>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold tracking-tight">{p.avg}</span>
                    <span className="text-xs text-muted-foreground">средняя</span>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="space-y-5 p-5">
                {/* Шкалы */}
                <div className="space-y-3">
                  {p.scores.map((s) => (
                    <ScoreBar key={s.label} label={s.label} value={s.value} explanation={s.explanation} />
                  ))}
                </div>

                {/* Общее впечатление */}
                <div className="rounded-xl bg-secondary/60 px-4 py-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Общее впечатление</p>
                  <p className="text-sm leading-relaxed">{p.overallAssessment}</p>
                </div>

                {/* Сильные / Опасения */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Сильные стороны</p>
                    <ul className="space-y-1 text-sm">
                      {p.strengths.map((s, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-emerald-500">+</span><span>{s}</span></li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Опасения</p>
                    <ul className="space-y-1 text-sm">
                      {p.concerns.map((c, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-amber-500">−</span><span>{c}</span></li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Red flags */}
                {p.redFlags.length > 0 && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive">
                      <AlertTriangle className="size-3.5" /> Red flags
                    </p>
                    <ul className="space-y-1 text-sm">
                      {p.redFlags.map((rf, i) => (
                        <li key={i} className="flex gap-1.5"><span className="text-destructive">⚠</span><span>{rf}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Разбор кейсов */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Разбор кейсов ({p.cases.length})
                  </p>
                  <Accordion className="flex flex-col gap-2">
                    {p.cases.map((c) => (
                      <AccordionItem key={c.id} value={c.id} className="rounded-xl border border-border">
                        <AccordionTrigger className="px-3.5 py-2.5 text-sm font-medium hover:no-underline">
                          {c.title}
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 px-3.5 pb-3">
                          <p className="text-sm text-muted-foreground">{c.description}</p>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Что хорошо</p>
                            <ul className="space-y-0.5 text-sm">
                              {c.strengths.map((s, j) => (
                                <li key={j} className="flex gap-1.5"><span className="text-emerald-500">+</span>{s}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Что вызывает вопросы</p>
                            <ul className="space-y-0.5 text-sm">
                              {c.concerns.map((co, j) => (
                                <li key={j} className="flex gap-1.5"><span className="text-amber-500">−</span>{co}</li>
                              ))}
                            </ul>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>

                <p className="text-[11px] text-muted-foreground/70">Проанализировано {p.screenshotsAnalyzed} скриншотов</p>
              </CardContent>
            </Card>

            {/* Портфолио ссылки */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={Link2} title="Портфолио" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-5 pt-0">
                {candidate.portfolioLinks.map((l) => (
                  <a
                    key={l}
                    href={l}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-primary transition-colors hover:bg-muted/50"
                  >
                    <ExternalLink className="size-3.5 shrink-0" />
                    <span className="truncate">{l.replace(/^https?:\/\//, "")}</span>
                  </a>
                ))}
              </CardContent>
            </Card>

            {/* Контакты */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={Mail} title="Контакты" tint="text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5 p-5 pt-0 text-sm">
                <a href={`mailto:${candidate.contacts.email}`} className="flex items-center gap-2 text-primary hover:underline">
                  <Mail className="size-4 shrink-0 text-muted-foreground" /> {candidate.contacts.email}
                </a>
                <a href={`https://t.me/${candidate.contacts.telegram.replace(/^@/, "")}`} className="flex items-center gap-2 text-primary hover:underline">
                  <Send className="size-4 shrink-0 text-muted-foreground" /> {candidate.contacts.telegram}
                </a>
                <a href={candidate.contacts.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                  <Linkedin className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{candidate.contacts.linkedin.replace(/^https?:\/\//, "")}</span>
                </a>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-5">
            {/* Strengths */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={ThumbsUp} title="Сильные стороны" tint="text-emerald-500" />
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <ul className="space-y-2.5">
                  {candidate.strengths.map((s) => (
                    <li key={s} className="flex gap-2 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Growth */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={TrendingUp} title="Зоны роста" />
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <ul className="space-y-2.5">
                  {candidate.concerns.map((c) => (
                    <li key={c} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Рекомендация */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="p-5 pb-2">
                <SectionTitle icon={Star} title="Рекомендация" />
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <p className="text-sm leading-relaxed text-muted-foreground">{candidate.recommendation}</p>
              </CardContent>
            </Card>

            {/* Триаж */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Триаж в базе</p>
                  <Badge variant="secondary" className="mt-2">
                    <span className="size-1.5 rounded-full bg-muted-foreground" /> {candidate.triage}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  сменить <ChevronDown />
                </Button>
              </CardContent>
            </Card>

            {/* Вакансии в работе */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="flex-row items-center justify-between p-5 pb-3">
                <CardTitle className="text-sm">Вакансии в работе</CardTitle>
                <Button variant="tinted" size="xs">+ Добавить</Button>
              </CardHeader>
              <Separator />
              <CardContent className="p-5">
                {candidate.pipelines.map((pl) => (
                  <div key={pl.title} className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{pl.title}</p>
                        <p className="text-xs text-muted-foreground">{pl.client} · {pl.grade}</p>
                      </div>
                      <Badge variant="success" className="shrink-0">
                        <span className="size-1.5 rounded-full bg-emerald-500" /> {pl.stage}
                      </Badge>
                    </div>
                    <Badge className={cn("border", scoreRing(pl.score), scoreTone(pl.score))}>{pl.score}% соответствие</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Вакансии (матчи) */}
            <Card className="rounded-xl border border-border shadow-sm">
              <CardHeader className="flex-row items-center gap-2 p-5 pb-3">
                <Target className="size-4 text-primary" />
                <CardTitle className="text-sm">Вакансии</CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="flex flex-col gap-2 p-3">
                {candidate.matches.map((m) => (
                  <div key={m.title} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
                    <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold", scoreRing(m.score), scoreTone(m.score))}>
                      <AnimateCount>{animated ? m.score : 0}</AnimateCount>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.note}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
    </PrototypeShell>
  );
}
