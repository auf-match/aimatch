/**
 * Правила: какой звук играть при клике.
 *
 * Два источника звука:
 *   "primary" — файл /click.mp3, только на основном действии
 *   остальные  — процедурные пресеты из ui-sounds.js (без файлов, синтез)
 *
 * Элемент выбирает звук атрибутом data-click-sound. Компонент Button
 * проставляет его сам по варианту, поэтому размечать руками ничего не нужно.
 * Для элементов без пометки работает запасной разбор по тегу и роли — так
 * обычные <button> по всему приложению звучат без правок в каждом файле.
 *
 * Логика вынесена из DOM намеренно: обход дерева остаётся тонкой обёрткой
 * в провайдере, а решение принимает чистая функция, проверяемая тестами
 * без браузерного окружения.
 */
import type { UISoundPreset } from "./ui-sounds";

/** "primary" — mp3, остальное — пресеты процедурного набора. */
export type ClickSound = "primary" | UISoundPreset;

const PRESETS = new Set<string>([
  "press", "click", "tap", "hover", "select", "toggle", "tick",
]);

export interface ClickTargetInfo {
  /** tagName, регистр не важен */
  tag: string;
  /** значение data-click-sound */
  marker?: string | null;
  role?: string | null;
  /** значение type у input */
  type?: string | null;
  disabled?: boolean;
  ariaDisabled?: string | null;
}

/** Роли, которые пользователь воспринимает как переключатель. */
const TOGGLE_ROLES = new Set([
  "switch", "checkbox", "radio", "menuitemcheckbox", "menuitemradio",
]);
/** Роли выбора из набора. */
const SELECT_ROLES = new Set(["option", "tab", "menuitem"]);
/** Роли обычного нажатия. */
const PRESS_ROLES = new Set(["button", "link"]);

/** Типы input, по которым кликают, а не печатают. */
const TOGGLE_INPUTS = new Set(["checkbox", "radio"]);
const CLICK_INPUTS = new Set(["submit", "button", "reset", "file", "color", "image"]);

export function resolveClickSound(info: ClickTargetInfo): ClickSound | null {
  // Заблокированный элемент ничего не делает — и звучать не должен,
  // иначе звук обещает действие, которого не произойдёт.
  if (info.disabled) return null;
  if (info.ariaDisabled === "true") return null;

  // 1. Явная пометка перебивает всё.
  const marker = info.marker?.trim().toLowerCase();
  if (marker != null) {
    if (marker === "false") return null;
    if (marker === "" || marker === "primary" || marker === "true") return "primary";
    if (PRESETS.has(marker)) return marker as UISoundPreset;
    // Незнакомое значение — молчим, чтобы опечатка не звучала случайным звуком.
    return null;
  }

  // 2. Разбор по роли: она важнее тега (div role="switch").
  const role = info.role?.trim().toLowerCase();
  if (role) {
    if (TOGGLE_ROLES.has(role)) return "toggle";
    if (SELECT_ROLES.has(role)) return "select";
    if (PRESS_ROLES.has(role)) return "click";
    // Явная неинтерактивная роль: <a role="presentation">.
    return null;
  }

  // 3. Разбор по тегу.
  const tag = info.tag.toLowerCase();
  if (tag === "input") {
    const type = (info.type ?? "text").toLowerCase();
    if (TOGGLE_INPUTS.has(type)) return "toggle";
    if (CLICK_INPUTS.has(type)) return "click";
    // Текстовые поля молчат: клик ставит курсор, а не нажимает.
    return null;
  }
  if (tag === "textarea") return null;
  if (tag === "select") return "select";
  if (tag === "summary") return "press";
  if (tag === "button" || tag === "a" || tag === "label") return "click";

  return null;
}

/** Селектор для поиска ближайшего кандидата вверх по дереву. */
export const CLICK_TARGET_SELECTOR = [
  "[data-click-sound]",
  "button", "a", "summary", "select", "label", "input", "textarea", "[role]",
].join(",");
