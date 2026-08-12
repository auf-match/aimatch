"use client";

/**
 * Оболочка приложения: сайдбар плюс отступ под него.
 *
 * Публичные страницы и их прототипы рисуются без сайдбара — снаружи он
 * бессмысленен, а половина его пунктов ведёт туда, куда доступа нет.
 * Список таких адресов живёт в lib/public-routes, чтобы лейаут и middleware
 * не разъехались.
 */
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { isChromelessRoute } from "@/lib/public-routes";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (isChromelessRoute(pathname)) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 ml-64">{children}</main>
    </>
  );
}
