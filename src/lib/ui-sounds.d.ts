/**
 * Типы для ui-sounds.js — процедурного набора звуков из
 * https://github.com/mishanaer/sound
 *
 * Сам модуль скопирован без изменений, поэтому типы живут отдельным файлом.
 */
export type UISoundPreset =
  | "press"
  | "click"
  | "tap"
  | "hover"
  | "select"
  | "toggle"
  | "tick";

export function playUISound(name: UISoundPreset, intensity?: number): void;
