"use client";

/**
 * Слайдер с высоким треком и делениями.
 *
 * Анатомия из beui.dev/components/motion/range-slider: трек 40px вместо
 * тонкой линии, точки-деления по шагам, вертикальный ползунок, который
 * растягивается по вертикали при перетаскивании. Позиция догоняет курсор
 * пружиной — движение мягкое, а не рывками.
 *
 * Акцент оранжевый, как во всём приложении.
 */
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";

export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
  label,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const reduce = useReducedMotion();

  const pct = ((value - min) / (max - min)) * 100;
  const target = useMotionValue(pct);
  const smooth = useSpring(target, { stiffness: 420, damping: 34, mass: 0.6 });
  const pos = reduce ? target : smooth;
  const left = useMotionTemplate`${pos}%`;

  useEffect(() => {
    target.set(pct);
  }, [pct, target]);

  const setFromX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const raw = (clientX - r.left) / r.width;
    const steps = Math.round((raw * (max - min)) / step);
    onChange(Math.min(max, Math.max(min, min + steps * step)));
  };

  // Делений не должно быть слишком много: на шкале 0–100 с шагом 5 это 21
  // точка, они сливаются. Показываем не чаще, чем каждые ~5% ширины.
  const rawTicks = Math.round((max - min) / step) + 1;
  const ticks = rawTicks > 14 ? Math.ceil(rawTicks / 2) : rawTicks;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        setFromX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging) setFromX(e.clientX);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const d =
          e.key === "ArrowRight" || e.key === "ArrowUp"
            ? step
            : e.key === "ArrowLeft" || e.key === "ArrowDown"
              ? -step
              : 0;
        if (d) {
          e.preventDefault();
          onChange(Math.min(max, Math.max(min, value + d)));
        }
        if (e.key === "Home") {
          e.preventDefault();
          onChange(min);
        }
        if (e.key === "End") {
          e.preventDefault();
          onChange(max);
        }
      }}
      className={`relative h-10 w-full touch-none select-none overflow-hidden rounded-lg bg-secondary outline-none ring-[#F97029]/40 focus-visible:ring-2 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      } ${className}`}
    >
      <motion.div
        className="absolute inset-y-0 left-0 bg-[#F97029]/18"
        style={{ width: left }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-3">
        {Array.from({ length: ticks }).map((_, i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-foreground/25" />
        ))}
      </div>

      <motion.div
        className="pointer-events-none absolute top-1/2 h-5 w-1.5 rounded-full bg-[#F97029]"
        style={{ left, x: "-50%", y: "-50%" }}
        animate={{ scaleY: dragging ? 1.35 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      />
    </div>
  );
}
