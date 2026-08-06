"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { dropdownMotion } from "@/lib/motion-dropdown";

interface FilterSelectOption {
  value: string;
  label: string;
}

/**
 * Кастомная замена нативному <select> для фильтров: тот же look (кнопка-триггер
 * как поле), но раскрытие — анимированная панель с блюром (единый стиль
 * дропдаунов по приложению). Первая опция — значение "" (плейсхолдер, "Все …").
 */
export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: FilterSelectOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <div className={`relative inline-flex ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-[var(--r-button)] border border-input bg-card px-3 text-sm text-foreground outline-none shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] transition-[border-color] hover:bg-muted/40 focus:border-primary/50"
      >
        <span className={value ? "" : "text-muted-foreground"}>{current}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            {...dropdownMotion}
            className="absolute left-0 top-full z-50 mt-1 max-h-72 w-max min-w-[10rem] origin-top overflow-y-auto rounded-xl border border-border bg-popover/95 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.18)] backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${!value ? "bg-muted/40 text-foreground" : "text-foreground hover:bg-muted/60"}`}
            >
              {placeholder}
              {!value && <span className="ml-auto text-[11px] text-muted-foreground">✓</span>}
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${o.value === value ? "bg-muted/40 text-foreground" : "text-foreground hover:bg-muted/60"}`}
              >
                {o.label}
                {o.value === value && <span className="ml-auto text-[11px] text-muted-foreground">✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
