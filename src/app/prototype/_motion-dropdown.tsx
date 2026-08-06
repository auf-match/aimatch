"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Тот же пружинный transition, что в navbar-menu (21st/Aceternity).
const transition = {
  type: "spring" as const,
  mass: 0.5,
  damping: 12,
  stiffness: 130,
};

/**
 * Анимированная панель-дропдаун: раскрывается пружиной (scale/opacity/y),
 * закрывается через AnimatePresence. Позиционируется абсолютно относительно
 * триггера-обёртки (родитель должен быть relative). Само состояние open/close
 * контролирует вызывающий код.
 */
export function MotionDropdown({
  open,
  children,
  align = "left",
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass =
    align === "right"
      ? "right-0 origin-top-right"
      : align === "center"
        ? "left-1/2 -translate-x-1/2 origin-top"
        : "left-0 origin-top-left";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -6 }}
          transition={transition}
          className={cn(
            "absolute z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-popover/95 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.18)] backdrop-blur-sm",
            alignClass,
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
