import { describe, it, expect } from "vitest";
import { dedupKey } from "./candidate-dedup";
import { normalizeIngestRow } from "./ingest";

describe("dedupKey", () => {
  it("сводит формы одного URL к единому ключу", () => {
    const k = dedupKey("https://www.behance.net/john/");
    expect(dedupKey("http://behance.net/john")).toBe(k);
    expect(dedupKey("https://www.BEHANCE.net/john")).toBe(k);
    expect(k).toBe("behance.net/john");
  });
});

describe("normalizeIngestRow", () => {
  const DEF = "Консультант";

  it("собирает валидную строку с дефолтами role/grade/status", () => {
    const row = normalizeIngestRow(
      { name: "Иван Петров", portfolioUrl: "https://behance.net/ivan", email: "i@x.com" },
      DEF,
    );
    expect(row).toMatchObject({
      name: "Иван Петров",
      portfolioLinks: ["https://behance.net/ivan"],
      email: "i@x.com",
      role: "OTHER",
      grade: "MIDDLE",
      status: "NEW",
      source: "Консультант",
    });
  });

  it("принимает массив ссылок и одиночные url, уникализует", () => {
    const row = normalizeIngestRow(
      { name: "A", portfolioLinks: ["https://a.com", "https://a.com"], url: "https://b.com" },
      DEF,
    );
    expect(row?.portfolioLinks).toEqual(["https://a.com", "https://b.com"]);
  });

  it("отбрасывает не-http ссылки", () => {
    const row = normalizeIngestRow(
      { name: "A", portfolioLinks: ["ftp://x", "not a url", "https://ok.com"] },
      DEF,
    );
    expect(row?.portfolioLinks).toEqual(["https://ok.com"]);
  });

  it("null при отсутствии имени или ссылок", () => {
    expect(normalizeIngestRow({ portfolioUrl: "https://x.com" }, DEF)).toBeNull();
    expect(normalizeIngestRow({ name: "Без ссылки" }, DEF)).toBeNull();
    expect(normalizeIngestRow({ name: "", url: "https://x.com" }, DEF)).toBeNull();
  });

  it("per-item source перекрывает дефолт; telegram/linkedin алиасы", () => {
    const row = normalizeIngestRow(
      { name: "A", url: "https://x.com", source: "LinkedIn Recruiter", telegram: "@a", linkedin: "https://li/a" },
      DEF,
    );
    expect(row?.source).toBe("LinkedIn Recruiter");
    expect(row?.telegramContact).toBe("@a");
    expect(row?.linkedinUrl).toBe("https://li/a");
  });
});

describe("normalizeIngestRow — внешний идентификатор", () => {
  const DEF = "Консультант";

  it("принимает externalId и в camelCase, и в snake_case", () => {
    const a = normalizeIngestRow(
      { name: "Иван Петров", portfolioUrl: "https://behance.net/ivan", externalId: "87908546" },
      DEF,
    );
    const b = normalizeIngestRow(
      { name: "Иван Петров", portfolioUrl: "https://behance.net/ivan", external_id: "87908546" },
      DEF,
    );
    expect(a?.externalId).toBe("87908546");
    expect(b?.externalId).toBe("87908546");
  });

  it("без externalId строка собирается как прежде", () => {
    const row = normalizeIngestRow(
      { name: "Иван Петров", portfolioUrl: "https://behance.net/ivan" },
      DEF,
    );
    expect(row).not.toBeNull();
    expect(row?.externalId).toBeUndefined();
  });

  it("externalId не заменяет обязательных полей", () => {
    const row = normalizeIngestRow({ name: "Без ссылки", externalId: "42" }, DEF);
    expect(row).toBeNull();
  });
});
