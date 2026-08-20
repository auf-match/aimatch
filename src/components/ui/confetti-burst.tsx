"use client";

/**
 * Вспышка конфетти из-под элемента.
 *
 * Идея из 21st.dev/@ruixen.ui/confetti-button: частицы вылетают из низа
 * кнопки и разлетаются с гравитацией. Палитра наша — оранжевый акцент
 * с парой поддерживающих оттенков, а не радуга: радуга выглядела бы
 * чужой в интерфейсе, где цвет один.
 *
 * Летит по нажатию, как в оригинале: отклик должен быть мгновенным.
 * Если запрос упадёт, кнопка останется на месте и её можно нажать снова.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

const COLORS = ["#F97029", "#FFB27A", "#7FB894", "#E8DCC8", "#D79A5B"];

interface Piece {
  id: number;
  x: number;      // горизонтальный разлёт, px
  y: number;      // высота подъёма, px (отрицательная — вверх)
  rotate: number;
  scale: number;
  color: string;
  square: boolean;
  delay: number;
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, id) => {
    // Разлёт веером вверх: угол от -150° до -30°, чтобы вниз не сыпалось
    const angle = (-150 + Math.random() * 120) * (Math.PI / 180);
    const power = 46 + Math.random() * 54;
    return {
      id,
      x: Math.cos(angle) * power,
      y: Math.sin(angle) * power,
      rotate: -180 + Math.random() * 360,
      scale: 0.6 + Math.random() * 0.7,
      color: COLORS[id % COLORS.length],
      square: Math.random() > 0.45,
      delay: Math.random() * 0.06,
    };
  });
}

export function ConfettiBurst({
  fire,
  count = 18,
}: {
  /** Меняется на новое значение в момент нажатия; null — ничего не показывать */
  fire: number | null;
  count?: number;
}) {
  const reduce = useReducedMotion();
  // Пересобираем частицы на каждую вспышку, чтобы разлёт не повторялся
  const pieces = useMemo(() => makePieces(count), [count, fire]);

  if (reduce) return null;

  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
      <AnimatePresence>
        {fire !== null && (
          <span key={fire} className="relative">
            {pieces.map((p) => (
              <motion.span
                key={p.id}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  // Подъём и падение: две точки по вертикали дают дугу
                  x: [0, p.x * 0.7, p.x],
                  y: [0, p.y, p.y + 34],
                  scale: [0.4, p.scale, p.scale * 0.85],
                  rotate: [0, p.rotate, p.rotate * 1.6],
                }}
                transition={{
                  duration: 1.05,
                  delay: p.delay,
                  ease: [0.16, 0.8, 0.4, 1],
                  times: [0, 0.25, 0.6, 1],
                }}
                style={{
                  position: "absolute",
                  width: p.square ? 6 : 5,
                  height: p.square ? 6 : 5,
                  borderRadius: p.square ? 1 : "50%",
                  background: p.color,
                }}
              />
            ))}
          </span>
        )}
      </AnimatePresence>
    </span>
  );
}
