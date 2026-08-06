"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Plus, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AnimateCount } from "@/components/unlumen-ui/animate-count";
import { PrototypeShell, scoreRing, scoreTone } from "../_shell";
import { cn } from "@/lib/utils";

const roleFilters = ["Все роли", "Product", "Brand", "UX", "Art Director"];
const gradeFilters = ["Все грейды", "Middle", "Middle+", "Senior", "Senior+", "Lead"];

const candidates = [
  { name: "Дмитрий Ковалёв", role: "Product Designer", grade: "Senior", score: 94, location: "Берлин", domains: ["fintech", "SaaS"], flags: ["BigTech"] },
  { name: "Игорь Шнайдер", role: "Art Director", grade: "Senior+", score: 80, location: "Тбилиси", domains: ["brand", "media"], flags: ["Международный"] },
  { name: "Алёна Мадянова", role: "Brand Designer", grade: "Senior", score: 74, location: "Москва", domains: ["e-commerce"], flags: ["Студия"] },
  { name: "Мария Ворожцова", role: "UX Designer", grade: "Middle+", score: 61, location: "Тбилиси", domains: ["b2b"], flags: [] },
  { name: "Владимир Сидоркин", role: "Product Designer", grade: "Senior", score: 88, location: "Ереван", domains: ["fintech"], flags: ["BigTech"] },
  { name: "Екатерина Никифорова", role: "Communication Designer", grade: "Senior", score: 71, location: "Лиссабон", domains: ["games"], flags: ["Международный"] },
  { name: "Глеб Воронин", role: "UI Designer", grade: "Middle", score: 47, location: "Казань", domains: ["b2c"], flags: [] },
  { name: "Арман Дюсенов", role: "Product Designer", grade: "Lead", score: 83, location: "Алматы", domains: ["SaaS", "b2b"], flags: ["Студия"] },
];

export default function CandidatesPrototype() {
  const [on, setOn] = useState(false);
  const [role, setRole] = useState("Все роли");
  const [grade, setGrade] = useState("Все грейды");
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <PrototypeShell wide>
      {/* Header */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Кандидаты</h1>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="inline-flex font-medium text-foreground">
              <AnimateCount>{on ? 2648 : 0}</AnimateCount>
            </span>
            в базе · показано {candidates.length}
          </div>
        </div>
        <Button size="sm"><Plus /> Новый кандидат</Button>
      </div>

      {/* Search + filters */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Поиск «как…» — семантический поиск по базе" className="h-10 pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Роль:</span>
            <ToggleGroup
              value={[role]}
              onValueChange={(v) => setRole(v[0] ?? role)}
              size="sm"
              spacing={1}
            >
              {roleFilters.map((r) => (
                <ToggleGroupItem
                  key={r}
                  value={r}
                  className={cn(
                    "rounded-full px-2.5 text-xs font-medium",
                    r === role ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  {r}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Грейд:</span>
            <ToggleGroup
              value={[grade]}
              onValueChange={(v) => setGrade(v[0] ?? grade)}
              size="sm"
              spacing={1}
            >
              {gradeFilters.map((g) => (
                <ToggleGroupItem
                  key={g}
                  value={g}
                  className={cn(
                    "rounded-full px-2.5 text-xs font-medium",
                    g === grade ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  {g}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((c) => (
          <Link key={c.name} href="/prototype/candidate">
            <Card className="group h-full rounded-xl border border-border shadow-sm transition-colors hover:border-primary/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                    {c.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.role} · {c.grade}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {c.location}
                    </p>
                  </div>
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold", scoreRing(c.score), scoreTone(c.score))}>
                    <AnimateCount>{on ? c.score : 0}</AnimateCount>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.domains.map((d) => (
                    <Badge key={d} variant="outline" className="text-[11px]">{d}</Badge>
                  ))}
                  {c.flags.map((f) => (
                    <Badge key={f} variant="tinted" className="text-[11px]">{f}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PrototypeShell>
  );
}
