import localFont from "next/font/local";

/**
 * Шрифт Igra Sans — только для прототипа (/prototype/*).
 * Применяется через className на корне PrototypeShell, глобально ничего не меняет.
 */
export const igraSans = localFont({
  src: "./fonts/IgraSans.otf",
  variable: "--font-igra",
  display: "swap",
});
