"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PrototypeShell, scoreRing, scoreTone } from "../_shell";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "DL_APPROVED", label: "Одобрен ДЛ", color: "#0d9488" },
  { key: "IN_CLIENT_SELECTION", label: "В подборке для клиента", color: "#4338ca" },
  { key: "REHEARSAL", label: "Репетиция", color: "#1d4ed8" },
  { key: "CLIENT_INTERVIEW", label: "Интервью с клиентом", color: "#0891b2" },
  { key: "TEST_TASK", label: "Тестовое задание", color: "#0284c7" },
  { key: "OFFER", label: "Оффер", color: "#e11d48" },
  { key: "HIRED", label: "Нанят", color: "#059669" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

const cards: Record<StageKey, { name: string; role: string; vac: string; score: number; days: number }[]> = {
  DL_APPROVED: [
    { name: "Влад Калашников", role: "Product Designer · Senior", vac: "Контентные Сервисы", score: 97, days: 62 },
    { name: "Vlad Gordeev", role: "Product Designer · Senior", vac: "X5 · Senior PD", score: 88, days: 62 },
    { name: "Arman D", role: "Product Designer · Lead", vac: "X5 · Senior PD", score: 83, days: 62 },
    { name: "Игорь Шнайдер", role: "Art Director · Senior+", vac: "UrbanAds · Brand", score: 80, days: 3 },
  ],
  IN_CLIENT_SELECTION: [
    { name: "Екатерина Никифорова", role: "Communication · Senior", vac: "Яндекс Игры", score: 71, days: 62 },
    { name: "Михаил Соломонов", role: "Product Designer · Senior", vac: "Дизайн ДС", score: 84, days: 27 },
    { name: "Dima Kovalev", role: "Product Designer · Senior", vac: "X5 · Senior PD", score: 94, days: 15 },
  ],
  REHEARSAL: [
    { name: "Мария Ворожцова", role: "UX Designer · Middle+", vac: "b2b платформа", score: 61, days: 8 },
  ],
  CLIENT_INTERVIEW: [
    { name: "Владимир Сидоркин", role: "Product Designer · Senior", vac: "Дизайн ДС", score: 88, days: 4 },
    { name: "Ульянова Аня", role: "Product Designer · Lead", vac: "Дизайн ДС", score: 79, days: 11 },
  ],
  TEST_TASK: [
    { name: "Глеб Воронин", role: "UI Designer · Middle", vac: "b2c приложение", score: 54, days: 6 },
  ],
  OFFER: [
    { name: "Арман Дюсенов", role: "Product Designer · Lead", vac: "SaaS b2b", score: 83, days: 2 },
  ],
  HIRED: [
    { name: "Ольга Крылова", role: "Brand Designer · Senior", vac: "UrbanAds · Brand", score: 91, days: 0 },
  ],
};

function fmtDays(d: number) {
  return d === 0 ? "сегодня" : `${d} дн.`;
}

export default function PipelinePrototype() {
  const [filter] = useState("все");
  const total = Object.values(cards).reduce((s, arr) => s + arr.length, 0);

  return (
    <PrototypeShell wide>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Этапы</h1>
        <p className="text-sm text-muted-foreground">Воронка по всем открытым вакансиям</p>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] transition-colors hover:bg-muted/40">
          Вакансия: {filter} <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
        <span className="text-[13px] text-muted-foreground">{total} кандидатов в воронке</span>
      </div>

      {/* Board */}
      <div className="overflow-x-auto pb-3" style={{ scrollbarWidth: "thin" }}>
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const list = cards[stage.key] ?? [];
            return (
              <div key={stage.key} className="w-[240px] shrink-0 overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: stage.color }} />
                  <span className="flex-1 truncate text-[11.5px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
                    {stage.label}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground/50">{list.length}</span>
                </div>
                <div className="flex min-h-[60px] flex-col gap-2 p-2">
                  {list.length === 0 ? (
                    <div className="py-3 text-center text-[11px] text-muted-foreground/30">—</div>
                  ) : (
                    list.map((c) => (
                      <Card key={c.name} className="cursor-pointer rounded-lg border border-border shadow-none transition-colors hover:border-primary/40 hover:bg-muted/30">
                        <CardContent className="p-2.5">
                          <p className="mb-0.5 truncate text-[13px] font-medium">{c.name}</p>
                          <p className="mb-1 truncate text-[11px] text-muted-foreground">{c.role}</p>
                          <p className="mb-2 truncate text-[11px] text-muted-foreground/70">{c.vac}</p>
                          <div className="flex items-center gap-1.5">
                            <Badge className={cn("border px-1.5 py-0 text-[11px]", scoreRing(c.score), scoreTone(c.score))}>
                              {c.score}%
                            </Badge>
                            <span className="ml-auto text-[11px] text-muted-foreground">{fmtDays(c.days)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PrototypeShell>
  );
}
