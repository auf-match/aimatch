import { describe, it, expect } from "vitest";
import { выбратьЗаголовокКейса } from "./case-title";

describe("выбратьЗаголовокКейса", () => {
  it("берёт h1 — его автор пишет про эту работу", () => {
    expect(
      выбратьЗаголовокКейса({
        h1: "Mindbox: от недельного планирования к продуктовому мышлению",
        title: "Lukin Slava",
        linkText: "MindboxFrom one-week planning",
        siteTitle: "Lukin Slava",
      }),
    ).toBe("Mindbox: от недельного планирования к продуктовому мышлению");
  });

  it("без h1 берёт текст ссылки, а не имя сайта", () => {
    // Настоящий случай с Framer: заголовок вкладки один на весь сайт,
    // и все кейсы приезжали под именем автора
    expect(
      выбратьЗаголовокКейса({
        h1: "",
        title: "Lukin Slava",
        linkText: "AutodrawAI-powered feature for Whiteboard",
        siteTitle: "Lukin Slava",
      }),
    ).toBe("AutodrawAI-powered feature for Whiteboard");
  });

  it("заголовок вкладки берёт, когда он отличается от общего", () => {
    expect(
      выбратьЗаголовокКейса({
        title: "Редизайн банковского приложения",
        siteTitle: "Jane Doe — Portfolio",
      }),
    ).toBe("Редизайн банковского приложения");
  });

  it("срезает хвост площадки", () => {
    expect(выбратьЗаголовокКейса({ title: "Fintech app :: Behance" })).toBe("Fintech app");
    expect(выбратьЗаголовокКейса({ title: "Brand system | Dribbble" })).toBe("Brand system");
  });

  it("лучше без подписи, чем имя автора четырежды подряд", () => {
    expect(
      выбратьЗаголовокКейса({ h1: "Lukin Slava", title: "Lukin Slava", siteTitle: "Lukin Slava" }),
    ).toBe("");
  });

  it("огрызки вроде стрелки и номера не берёт", () => {
    expect(выбратьЗаголовокКейса({ h1: "→", linkText: "01", title: "Кейс о банке" })).toBe(
      "Кейс о банке",
    );
  });

  it("длинное режет до восьмидесяти знаков", () => {
    const r = выбратьЗаголовокКейса({ h1: "я".repeat(200) });
    expect(r).toHaveLength(80);
  });

  it("схлопывает пробелы и переносы", () => {
    expect(выбратьЗаголовокКейса({ h1: "  Кейс\n\n  о   банке  " })).toBe("Кейс о банке");
  });

  it("пустой вход не роняет", () => {
    expect(выбратьЗаголовокКейса({})).toBe("");
    expect(выбратьЗаголовокКейса({ h1: null, title: undefined, linkText: "" })).toBe("");
  });
});
