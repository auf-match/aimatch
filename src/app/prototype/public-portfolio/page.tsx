import PublicPortfolio from "@/components/public-portfolio";

/**
 * Прототип публичной страницы — тот же компонент, что и на /p/portfolio,
 * но с переключателем экранов и придуманным разбором на экране результата.
 *
 * Живёт внутри приложения и закрыт паролем: черновики страниц не должны
 * уезжать наружу вместе с рабочими.
 */
export default function PublicPortfolioPrototypePage() {
  return <PublicPortfolio demo />;
}
