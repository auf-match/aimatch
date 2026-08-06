"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Briefcase,
  MapPin,
  Wallet,
  Clock,
  Target,
  ListChecks,
  Sparkles,
  MessageSquare,
  Copy,
} from "lucide-react";
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
import { AnimateCount } from "@/components/unlumen-ui/animate-count";
import { PrototypeShell, scoreRing, scoreTone } from "../_shell";
import { cn } from "@/lib/utils";

const vacancy = {
  title: "Senior / Middle+ Brand Designer",
  client: "UrbanAds",
  grade: "Middle+",
  status: "Открыта",
  params: [
    { icon: Briefcase, label: "Полная занятость" },
    { icon: MapPin, label: "Удалённо · Москва" },
    { icon: Wallet, label: "от 4 000 $/мес" },
    { icon: Clock, label: "Старт: ASAP" },
  ],
  product:
    "Развитие визуального стиля бренда UrbanAds: работа с мероприятиями (BTL, events), мерчом и бренд-коммуникациями. Команда из 4 дизайнеров, прямое подчинение арт-директору.",
  keyTasks: [
    "Развивать и поддерживать бренд-систему",
    "Айдентика для мероприятий и мерча",
    "Ключевые визуалы для кампаний",
  ],
  requiredSkills: ["Айдентика", "Типографика", "Бренд-системы", "Композиция"],
  niceToHave: ["Motion", "3D", "Иллюстрация"],
  domains: ["e-commerce", "events", "media"],
  criteria: [
    { criterion: "Айдентика и брендинг", weight: 35, type: "required" as const },
    { criterion: "Типографика", weight: 25, type: "required" as const },
    { criterion: "Бренд-системы", weight: 20, type: "nice" as const },
    { criterion: "Опыт с мероприятиями/BTL", weight: 15, type: "nice" as const },
    { criterion: "Нет продуктового портфолио", weight: 5, type: "stop" as const },
  ],
  matches: [
    {
      name: "Ольга Крылова", role: "Brand Designer · Senior", score: 91,
      explanation: "Сильная айдентика и типографика, есть кейсы с мероприятиями и мерчом.",
      strengths: ["Опыт BTL/events", "Целостные бренд-системы"],
      gaps: ["Нет motion"],
    },
    {
      name: "Игорь Шнайдер", role: "Art Director · Senior+", score: 80,
      explanation: "Арт-дирекшн и брендинг на высоком уровне; меньше опыта именно с мерчом.",
      strengths: ["Арт-дирекшн", "Международный опыт"],
      gaps: ["Мало кейсов с мерчом", "Нет метрик"],
    },
    {
      name: "Алёна Мадянова", role: "Brand Designer · Senior", score: 74,
      explanation: "Хороший визуальный вкус, e-commerce фон подходит под клиента.",
      strengths: ["e-commerce", "Визуальный вкус"],
      gaps: ["Слабее в типографике"],
    },
    {
      name: "Глеб Воронин", role: "UI Designer · Middle", score: 41,
      explanation: "Профиль UI/цифровой дизайн, слабо пересекается с бренд-задачами.",
      strengths: ["Аккуратный UI"],
      gaps: ["Нет бренд-кейсов", "Грейд ниже"],
    },
  ],
  funnel: [
    { label: "Одобрен ДЛ", count: 6, color: "#0d9488" },
    { label: "В подборке", count: 3, color: "#4338ca" },
    { label: "Интервью", count: 1, color: "#0891b2" },
  ],
};

const CRIT_STYLE = {
  required: { label: "обязательный", cls: "bg-primary/10 text-primary" },
  nice: { label: "желательный", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  stop: { label: "стоп-фактор", cls: "bg-destructive/10 text-destructive" },
};

export default function VacancyPrototype() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <PrototypeShell wide>
      {/* Top bar */}
      <div className="mb-5 flex items-center justify-between">
        <Link href="/prototype/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft /> Вакансии
        </Link>
        <Button variant="outline" size="sm"><Pencil /> Редактировать</Button>
      </div>

      {/* Header card */}
      <Card className="rounded-xl border border-border shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="success">● {vacancy.status}</Badge>
                <span className="text-xs text-muted-foreground">{vacancy.client} · {vacancy.grade}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{vacancy.title}</h1>
            </div>
            <Button size="sm"><Target /> Запустить матчинг</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {vacancy.params.map((p) => (
              <span key={p.label} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
                <p.icon className="size-3.5 text-muted-foreground" /> {p.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Left */}
        <div className="flex flex-col gap-5">
          {/* Продукт */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="p-5 pb-2"><CardTitle className="text-sm">Описание продукта</CardTitle></CardHeader>
            <CardContent className="p-5 pt-0">
              <p className="text-sm leading-relaxed text-muted-foreground">{vacancy.product}</p>
            </CardContent>
          </Card>

          {/* Требования */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><ListChecks className="size-4 text-primary" /> Требования</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5 pt-0">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ключевые задачи</p>
                <ul className="space-y-1 text-sm">
                  {vacancy.keyTasks.map((t) => (
                    <li key={t} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" /><span>{t}</span></li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Обязательные навыки</p>
                  <div className="flex flex-wrap gap-1.5">{vacancy.requiredSkills.map((s) => <Badge key={s} variant="tinted">{s}</Badge>)}</div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Будет плюсом</p>
                  <div className="flex flex-wrap gap-1.5">{vacancy.niceToHave.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Критерии оценки */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-sm">Критерии оценки · веса</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 p-5 pt-2">
              {vacancy.criteria.map((c) => (
                <div key={c.criterion} className="flex items-center gap-3">
                  <span className="w-56 shrink-0 truncate text-sm">{c.criterion}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className={cn("h-full rounded-full", c.type === "stop" ? "bg-destructive/60" : c.type === "nice" ? "bg-blue-500" : "bg-primary")} style={{ width: `${c.weight * 2.4}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold tabular-nums">{c.weight}%</span>
                  <span className={cn("hidden shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:inline", CRIT_STYLE[c.type].cls)}>{CRIT_STYLE[c.type].label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Результаты матчинга */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="flex-row items-center justify-between p-5 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Target className="size-4 text-primary" /> Результаты матчинга</CardTitle>
              <span className="text-xs text-muted-foreground">{vacancy.matches.length} кандидатов</span>
            </CardHeader>
            <Separator />
            <CardContent className="p-3">
              <Accordion className="flex flex-col gap-2">
                {vacancy.matches.map((m, i) => (
                  <AccordionItem key={m.name} value={`m${i}`} className="rounded-xl border border-border">
                    <AccordionTrigger className="px-3 py-3 hover:no-underline">
                      <div className="flex flex-1 items-center gap-3">
                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold", scoreRing(m.score), scoreTone(m.score))}>
                          <AnimateCount>{on ? m.score : 0}</AnimateCount>
                        </span>
                        <div className="min-w-0 text-left">
                          <p className="truncate text-sm font-medium">{m.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.role}</p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 px-4 pb-4">
                      <p className="text-sm text-muted-foreground">{m.explanation}</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Сильные стороны</p>
                          <ul className="space-y-0.5 text-sm">{m.strengths.map((s) => <li key={s} className="flex gap-1.5"><span className="text-emerald-500">+</span>{s}</li>)}</ul>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Пробелы</p>
                          <ul className="space-y-0.5 text-sm">{m.gaps.map((g) => <li key={g} className="flex gap-1.5"><span className="text-amber-500">−</span>{g}</li>)}</ul>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="tinted" size="sm"><MessageSquare /> Сообщение кандидату</Button>
                        <Button variant="outline" size="sm"><Copy /> Скопировать</Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Right */}
        <div className="flex flex-col gap-5">
          {/* Сводка */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardContent className="grid grid-cols-2 gap-4 p-5">
              <div>
                <div className="text-3xl font-bold tracking-tight text-primary"><AnimateCount>{on ? 24 : 0}</AnimateCount></div>
                <p className="mt-1 text-xs text-muted-foreground">кандидатов в пуле</p>
              </div>
              <div>
                <div className="text-3xl font-bold tracking-tight"><AnimateCount>{on ? 10 : 0}</AnimateCount></div>
                <p className="mt-1 text-xs text-muted-foreground">в воронке</p>
              </div>
            </CardContent>
          </Card>

          {/* Мини-воронка */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="p-5 pb-3"><CardTitle className="text-sm">Воронка по вакансии</CardTitle></CardHeader>
            <Separator />
            <CardContent className="space-y-2.5 p-5">
              {vacancy.funnel.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: f.color }} />
                  <span className="flex-1 text-sm">{f.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{f.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Инсайты интервью */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-primary" /> Инсайты из брифинга</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-5 pt-0">
              <p className="rounded-lg bg-secondary/60 px-3 py-2 text-sm">Клиент ценит «живую» типографику и смелые визуалы.</p>
              <p className="rounded-lg bg-secondary/60 px-3 py-2 text-sm">Стоп-фактор: чисто цифровые UI-портфолио без бренд-кейсов.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PrototypeShell>
  );
}
