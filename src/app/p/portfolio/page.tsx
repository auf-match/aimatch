import type { Metadata } from "next";
import PublicPortfolio from "@/components/public-portfolio";

/**
 * Публичная страница разбора портфолио. Открыта интернету без пароля —
 * префикс /p/ выведен из-под Basic Auth в middleware.
 *
 * Адрес после /p/ можно менять свободно: достаточно переименовать эту
 * папку. Менять сам префикс — нельзя, не тронув список открытых адресов
 * в @/lib/public-routes: страница окажется либо под паролем, либо, что
 * хуже, вместе с ней наружу уедет что-то ещё.
 */
export const metadata: Metadata = {
  title: "Взгляд со стороны — разбор портфолио",
  description:
    "Дизайн-лид агентства АУФ смотрит портфолио минуту и делает выводы, " +
    "которые тебе никто не озвучит. Здесь их можно прочитать.",
  // Черновая страница: в поиске ей пока делать нечего
  robots: { index: false, follow: false },
};

export default function PublicPortfolioPage() {
  return <PublicPortfolio />;
}
