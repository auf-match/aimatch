/**
 * Общая спецификация анимации раскрытия дропдаунов (перенесена из прототипа).
 * Пружинное появление: opacity + scale + лёгкий сдвиг вверх.
 *
 * Применяется как `<motion.div {...dropdownMotion} className="origin-top ...">`.
 * Для анимации закрытия — обернуть в <AnimatePresence> (тогда сработает exit).
 * Без AnimatePresence анимируется только раскрытие (закрытие мгновенное).
 */
export const dropdownTransition = {
  type: "spring" as const,
  mass: 0.5,
  damping: 13,
  stiffness: 170,
};

export const dropdownMotion = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -6 },
  transition: dropdownTransition,
};
