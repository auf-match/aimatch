"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { igraSans } from "./fonts";

const NAV = [
  { href: "/prototype/dashboard", label: "Дашборд" },
  { href: "/prototype/candidates", label: "Кандидаты" },
  { href: "/prototype/vacancy", label: "Вакансия" },
  { href: "/prototype/pipeline", label: "Этапы" },
  { href: "/prototype/candidate", label: "Карточка" },
  { href: "/prototype/navbar", label: "Меню" },
  { href: "/prototype/dropdowns", label: "Списки" },
];

export function PrototypeShell({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className={cn("min-h-screen bg-background", igraSans.className)}>
      {/* Баннер + навигация прототипа */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className={cn("mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5", wide ? "max-w-6xl" : "max-w-5xl")}>
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Прототип</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">shadcn/ui + Unlumen</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className={cn("mx-auto px-6 py-6", wide ? "max-w-6xl" : "max-w-5xl")}>{children}</div>
    </div>
  );
}

// ── Общие score-хелперы ──────────────────────────────────────────────
export function scoreTone(s: number) {
  if (s >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
export function scoreRing(s: number) {
  if (s >= 75) return "border-emerald-500/30 bg-emerald-500/10";
  if (s >= 50) return "border-amber-500/30 bg-amber-500/10";
  return "border-red-500/30 bg-red-500/10";
}
