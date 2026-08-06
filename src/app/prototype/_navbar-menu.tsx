"use client";

import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// Пружинный transition — как в оригинале Aceternity/21st.
const transition = {
  type: "spring" as const,
  mass: 0.5,
  damping: 11.5,
  stiffness: 100,
  restDelta: 0.001,
  restSpeed: 0.001,
};

export function MenuItem({
  setActive,
  active,
  item,
  children,
}: {
  setActive: (item: string) => void;
  active: string | null;
  item: string;
  children?: React.ReactNode;
}) {
  return (
    <div onMouseEnter={() => setActive(item)} className="relative">
      <motion.p
        transition={{ duration: 0.3 }}
        className="cursor-pointer text-sm font-medium text-foreground/80 hover:text-foreground"
      >
        {item}
      </motion.p>
      {active !== null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={transition}
        >
          {active === item && (
            <div className="absolute left-1/2 top-[calc(100%_+_1.2rem)] -translate-x-1/2 pt-4">
              <motion.div
                transition={transition}
                layoutId="active"
                className="overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-[0_20px_60px_rgba(0,0,0,.18)] backdrop-blur-sm"
              >
                <motion.div layout className="h-full w-max p-4">
                  {children}
                </motion.div>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

export function Menu({
  setActive,
  children,
}: {
  setActive: (item: string | null) => void;
  children: React.ReactNode;
}) {
  return (
    <nav
      onMouseLeave={() => setActive(null)}
      className="relative flex items-center justify-center gap-6 rounded-full border border-border bg-card px-8 py-3 shadow-[0_2px_12px_rgba(0,0,0,.06)]"
    >
      {children}
    </nav>
  );
}

/** Ссылка внутри дропдауна. */
export function HoveredLink({
  children,
  className,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      className={cn(
        "text-sm text-muted-foreground transition-colors hover:text-primary",
        className,
      )}
    >
      {children}
    </a>
  );
}

/** Карточка-пункт с иконкой-плиткой (адаптация ProductItem без внешних картинок). */
export function ProductItem({
  title,
  description,
  href,
  icon,
  gradient = "from-primary/80 to-orange-400/70",
}: {
  title: string;
  description: string;
  href: string;
  icon?: React.ReactNode;
  gradient?: string;
}) {
  return (
    <a href={href} className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50">
      <div
        className={cn(
          "flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md",
          gradient,
        )}
      >
        {icon}
      </div>
      <div className="max-w-[12rem]">
        <h4 className="mb-0.5 text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-xs leading-snug text-muted-foreground">{description}</p>
      </div>
    </a>
  );
}
