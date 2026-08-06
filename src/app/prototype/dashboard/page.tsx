"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Briefcase,
  Columns3,
  CheckCircle2,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AnimateCount } from "@/components/unlumen-ui/animate-count";
import { PrototypeShell, scoreRing, scoreTone } from "../_shell";
import { cn } from "@/lib/utils";

const stats = [
  { icon: Users, label: "Кандидатов в базе", value: 2648, accent: false },
  { icon: Briefcase, label: "Открытых вакансий", value: 12, accent: true },
  { icon: Columns3, label: "В воронке", value: 38, accent: false },
  { icon: CheckCircle2, label: "Нанято за квартал", value: 7, accent: false },
];

const recentCandidates = [
  { name: "Игорь Шнайдер", role: "Art Director · Senior+", score: 80 },
  { name: "Алёна Мадянова", role: "Brand Designer · Senior", score: 74 },
  { name: "Дмитрий Ковалёв", role: "Product Designer · Senior", score: 94 },
  { name: "Мария Ворожцова", role: "UX Designer · Middle+", score: 61 },
];

const activeVacancies = [
  { title: "Senior / Middle+ Brand Designer", client: "UrbanAds", pool: 24, stage: "Матчинг" },
  { title: "Product Designer, Дизайн-система", client: "X5", pool: 41, stage: "Подборка" },
  { title: "Communication Designer", client: "Яндекс Игры", pool: 12, stage: "Интервью" },
];

const funnel = [
  { label: "Одобрен ДЛ", count: 18, color: "#0d9488" },
  { label: "В подборке", count: 9, color: "#4338ca" },
  { label: "Интервью", count: 6, color: "#0891b2" },
  { label: "Оффер", count: 3, color: "#e11d48" },
  { label: "Нанят", count: 2, color: "#059669" },
];

export default function DashboardPrototype() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 200);
    return () => clearTimeout(t);
  }, []);
  const funnelMax = Math.max(...funnel.map((f) => f.count));

  return (
    <PrototypeShell wide>
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
          <p className="text-sm text-muted-foreground">Обзор базы, вакансий и воронки</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Plus /> Кандидат</Button>
          <Button size="sm"><Plus /> Вакансия</Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-xl border border-border shadow-sm">
            <CardContent className="p-5">
              <div className={cn("mb-3 flex size-9 items-center justify-center rounded-lg", s.accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                <s.icon className="size-4.5" />
              </div>
              <div className="text-3xl font-bold tracking-tight">
                <AnimateCount>{on ? s.value : 0}</AnimateCount>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main grid */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Recent candidates */}
        <Card className="rounded-xl border border-border shadow-sm">
          <CardHeader className="flex-row items-center justify-between p-5 pb-3">
            <CardTitle className="text-sm">Недавние кандидаты</CardTitle>
            <Link href="/prototype/candidates" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Все <ArrowUpRight className="size-3.5" />
            </Link>
          </CardHeader>
          <Separator />
          <CardContent className="p-2">
            {recentCandidates.map((c) => (
              <div key={c.name} className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {c.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.role}</p>
                </div>
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold", scoreRing(c.score), scoreTone(c.score))}>
                  <AnimateCount>{on ? c.score : 0}</AnimateCount>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Right: funnel + vacancies */}
        <div className="flex flex-col gap-5">
          {/* Funnel */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm">Воронка</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="space-y-2.5 p-5">
              {funnel.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{f.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(f.count / funnelMax) * 100}%`, background: f.color }} />
                  </div>
                  <span className="w-6 text-right text-sm font-semibold tabular-nums">{f.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Active vacancies */}
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="flex-row items-center justify-between p-5 pb-3">
              <CardTitle className="text-sm">Активные вакансии</CardTitle>
              <Link href="/prototype/vacancy" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Все <ArrowUpRight className="size-3.5" />
              </Link>
            </CardHeader>
            <Separator />
            <CardContent className="p-2">
              {activeVacancies.map((v) => (
                <Link key={v.title} href="/prototype/vacancy" className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.client}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{v.pool} в пуле</Badge>
                  <Badge variant="tinted" className="shrink-0">{v.stage}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PrototypeShell>
  );
}
