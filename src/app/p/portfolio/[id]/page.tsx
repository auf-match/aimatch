import type { Metadata } from "next";
import PublicPortfolio from "@/components/public-portfolio";

/**
 * Разбор конкретной заявки по ссылке.
 *
 * Эту ссылку человек копирует на экране ожидания. Если разбор ещё идёт —
 * покажется то же ожидание и досчитается здесь; если готов — сразу
 * результат.
 *
 * Идентификатор заявки — cuid, подобрать его перебором нельзя. Ссылка и
 * есть ключ: у кого она, тот и смотрит. Своего разбора это касается ровно
 * так же, как любой ссылки «для тех, у кого есть адрес».
 */
export const metadata: Metadata = {
  title: "Разбор портфолио",
  robots: { index: false, follow: false },
};

export default async function PublicPortfolioResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicPortfolio id={id} />;
}
