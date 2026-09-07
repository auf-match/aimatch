import { describe, it, expect } from "vitest";
import { normalizeSubmission, normalizeLink, PUBLIC_SOURCE } from "./public-intake";

const годная = { name: "Дмитрий Евтеев", contact: "@evteev", portfolio: "behance.net/evteev" };

describe("normalizeLink", () => {
  it("дописывает протокол: люди пишут адрес без него", () => {
    expect(normalizeLink("behance.net/evteev")).toBe("https://behance.net/evteev");
  });

  it("не трогает адрес с протоколом", () => {
    expect(normalizeLink("http://supdima.com/")).toBe("http://supdima.com/");
  });

  it("не пускает не-веб схемы", () => {
    // Иначе такое уехало бы в скрейпер
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("mailto:a@b.ru")).toBeNull();
    expect(normalizeLink("data:text/html,<b>")).toBeNull();
  });

  it("требует точку в домене — «портфолио» это не адрес", () => {
    expect(normalizeLink("портфолио")).toBeNull();
    expect(normalizeLink("localhost")).toBeNull();
  });

  it("пустое и мусор отвергает", () => {
    expect(normalizeLink("   ")).toBeNull();
    expect(normalizeLink("https://")).toBeNull();
  });
});

describe("normalizeSubmission", () => {
  it("собирает строку для базы из годной заявки", () => {
    const r = normalizeSubmission(годная);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      name: "Дмитрий Евтеев",
      portfolioLinks: ["https://behance.net/evteev"],
      telegramContact: "@evteev",
      status: "NEW",
      source: PUBLIC_SOURCE,
    });
  });

  it("почту кладёт в email, а не в телеграм", () => {
    const r = normalizeSubmission({ ...годная, contact: "ivan@example.com" });
    expect(r.ok && r.row.email).toBe("ivan@example.com");
    expect(r.ok && r.row.telegramContact).toBeUndefined();
  });

  it("ник с собакой считает телеграмом, хотя в нём есть @", () => {
    const r = normalizeSubmission({ ...годная, contact: "@ivan.designer" });
    expect(r.ok && r.row.telegramContact).toBe("@ivan.designer");
    expect(r.ok && r.row.email).toBeUndefined();
  });

  it("заполненная приманка — тихий отказ, без разбора полей", () => {
    const r = normalizeSubmission({ ...годная, website: "http://spam" });
    expect(r).toEqual({ ok: false, бот: true });
  });

  it("пустую приманку игнорирует", () => {
    expect(normalizeSubmission({ ...годная, website: "" }).ok).toBe(true);
  });

  it("называет поле, в котором ошибка, — форме есть что подсветить", () => {
    expect(normalizeSubmission({ ...годная, name: "  " })).toMatchObject({ поле: "name" });
    expect(normalizeSubmission({ ...годная, contact: "" })).toMatchObject({ поле: "contact" });
    expect(normalizeSubmission({ ...годная, portfolio: "не ссылка" })).toMatchObject({
      поле: "portfolio",
    });
  });

  it("режет переросшие поля", () => {
    expect(normalizeSubmission({ ...годная, name: "я".repeat(121) })).toMatchObject({
      поле: "name",
    });
    expect(
      normalizeSubmission({ ...годная, portfolio: "https://a.ru/" + "x".repeat(500) }),
    ).toMatchObject({ поле: "portfolio" });
  });

  it("пробелы по краям срезает", () => {
    const r = normalizeSubmission({ name: "  Лена  ", contact: " @lena ", portfolio: " a.ru " });
    expect(r.ok && r.row.name).toBe("Лена");
    expect(r.ok && r.row.telegramContact).toBe("@lena");
  });

  it("не строки не роняют разбор", () => {
    expect(normalizeSubmission({ name: 42, contact: null, portfolio: {} }).ok).toBe(false);
  });
});
