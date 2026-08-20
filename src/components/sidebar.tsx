"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref } from "@/lib/sidebar-active";

const NAV_ITEMS = [
  { href: "/", label: "Дашборд", icon: HomeIcon },
  { href: "/candidates", label: "Кандидаты", icon: UsersIcon },
  { href: "/vacancies", label: "Вакансии", icon: BriefcaseIcon },
  { href: "/pipeline", label: "Этапы", icon: ColumnsIcon },
  { href: "/candidates/analyze-status", label: "Анализ", icon: ActivityIcon },
];

const QUICK_ITEMS = [
  { href: "/candidates/upload", label: "Новый кандидат", icon: PlusIcon },
  { href: "/vacancies/new", label: "Новая вакансия", icon: PlusIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  // Считаем по всем пунктам сразу: иначе навигация и быстрые действия
  // найдут каждая своего победителя и подсветятся оба.
  const active = activeHref(
    [...NAV_ITEMS, ...QUICK_ITEMS].map((i) => i.href),
    pathname ?? "/",
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-card shadow-[1px_0_0_0_oklch(0_0_0/0.05)]">
      {/* Brand */}
      <div className="flex h-16 items-center px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-[0_2px_8px_0_oklch(0.62_0.22_33/0.40)]">
            А
          </span>
          AIслав
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = active === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 [border-radius:var(--r-button)] px-3 py-2.5 text-[13.5px] font-medium transition-all",
                isActive
                  ? "bg-[#F97029] text-white shadow-[0_1px_4px_0_oklch(0_0_0/0.12)]"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center shrink-0",
                isActive ? "text-white" : "text-muted-foreground"
              )}>
                <Icon />
              </span>
              {label}
            </Link>
          );
        })}

        <div className="pt-5">
          <p className="t-eyebrow px-3 pb-2 opacity-60">
            Быстрые действия
          </p>
          {QUICK_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 [border-radius:var(--r-button)] px-3 py-2.5 text-[13.5px] font-medium transition-all",
                active === href
                  ? "bg-[#F97029] text-white"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center shrink-0",
                active === href ? "text-white" : "text-primary"
              )}>
                <Icon />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </aside>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="7" width="19" height="13" rx="2" />
      <path d="M16 20V5.5A2.5 2.5 0 0 0 13.5 3h-3A2.5 2.5 0 0 0 8 5.5V20" />
      <path d="M2.5 13h19" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="18" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
