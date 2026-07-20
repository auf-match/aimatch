import { describe, it, expect } from "vitest";
import { classifyUrls, extractUrls } from "./huntflow-import";

describe("classifyUrls — allowlist", () => {
  it("keeps known portfolio platforms", () => {
    const r = classifyUrls([
      "https://www.behance.net/ivanov",
      "https://dribbble.com/ivanov",
      "https://ivanov.notion.site/Portfolio-123",
      "https://readymag.website/u123/456",
    ]);
    expect(r.portfolioLinks).toHaveLength(4);
  });

  it("drops noise: job boards, clouds, socials", () => {
    const r = classifyUrls([
      "https://spb.hh.ru/resume/abc",
      "https://hh.ru/resume/abc",
      "https://drive.google.com/file/d/xyz",
      "https://disk.yandex.ru/d/xyz",
      "https://www.instagram.com/ivanov",
      "https://vk.com/ivanov",
      "https://api.hh.ru/areas/1",
    ]);
    expect(r.portfolioLinks).toEqual([]);
  });

  it("matches by host, not substring", () => {
    // подстрочное совпадение по behance.net поймало бы CDN-хост
    const r = classifyUrls(["https://mir-s3-cdn-cf.behance.net/projects/img.jpg"]);
    expect(r.portfolioLinks).toEqual([]);
  });
});

describe("classifyUrls — telegram & linkedin", () => {
  it("routes t.me to telegram, not portfolio", () => {
    const r = classifyUrls(["https://t.me/ivanov"]);
    expect(r.telegram).toBe("https://t.me/ivanov");
    expect(r.portfolioLinks).toEqual([]);
  });

  it("routes linkedin to linkedin, not portfolio", () => {
    const r = classifyUrls(["https://www.linkedin.com/in/ivanov/"]);
    expect(r.linkedin).toBe("https://linkedin.com/in/ivanov");
    expect(r.portfolioLinks).toEqual([]);
  });

  it("keeps the first of each when several", () => {
    const r = classifyUrls(["https://t.me/one", "https://t.me/two"]);
    expect(r.telegram).toBe("https://t.me/one");
  });
});

describe("classifyUrls — normalization", () => {
  it("strips trailing slash and canonicalizes to https without www", () => {
    const r = classifyUrls(["http://www.behance.net/ivanov/"]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
  });

  it("strips trailing punctuation glued from resume text", () => {
    const r = classifyUrls(["https://behance.net/ivanov."]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
  });

  it("truncates behance profile tabs to the profile root", () => {
    for (const tab of ["projects", "resume", "moodboards", "info", "appreciated"]) {
      const r = classifyUrls([`https://www.behance.net/ivanov/${tab}`]);
      expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
    }
  });

  it("leaves behance gallery links alone (profile root not derivable)", () => {
    const r = classifyUrls(["https://www.behance.net/gallery/123/My-Project"]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/gallery/123/My-Project"]);
  });

  it("drops empty path for exact hosts (platform homepage, not a portfolio)", () => {
    const r = classifyUrls(["https://www.behance.net", "https://dribbble.com/"]);
    expect(r.portfolioLinks).toEqual([]);
  });

  // РЕГРЕССИЯ: правило «отбрасывать пустой путь везде» теряло 355 человек (16%).
  // У конструкторов сайтов портфолио — это сам поддомен, путь пустой.
  it("KEEPS empty path for subdomain platforms", () => {
    const r = classifyUrls([
      "https://ivanov.tilda.ws",
      "https://ivanov.framer.website/",
      "http://ivanov.webflow.io",
      "https://ivanov.super.site/",
      "https://ivanov.myportfolio.com",
    ]);
    expect(r.portfolioLinks).toHaveLength(5);
    expect(r.portfolioLinks).toContain("https://ivanov.tilda.ws");
    expect(r.portfolioLinks).toContain("https://ivanov.framer.website");
  });

  it("dedups after normalization", () => {
    const r = classifyUrls([
      "https://www.behance.net/ivanov",
      "http://behance.net/ivanov/",
      "https://behance.net/ivanov/projects",
    ]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
  });

  it("ignores malformed urls without throwing", () => {
    const r = classifyUrls(["not-a-url", "http://", "https://behance.net/ok"]);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ok"]);
  });

  // РЕГРЕССИЯ: в тексте резюме часто нет пробела между ссылкой и следующим
  // словом. Старый URL_RE ([^\s"',)<>\]]+) не исключал кириллицу и заглатывал
  // "Портфолио" в путь, из-за чего new URL() не падал, а тихо портил юзернейм
  // (percent-encoding кириллицы в pathname) — ссылка вела на несуществующую
  // страницу без единого сигнала об ошибке.
  it("stops the URL at glued-on non-ASCII text (no separator after link)", () => {
    const text = "https://behance.net/ivanovПортфолио дизайнера";
    const urls = extractUrls(text);
    expect(urls).toEqual(["https://behance.net/ivanov"]);

    const r = classifyUrls(urls);
    expect(r.portfolioLinks).toEqual(["https://behance.net/ivanov"]);
  });
});

describe("classifyUrls — ranking", () => {
  it("orders behance > dribbble > other platforms > figma", () => {
    const r = classifyUrls([
      "https://figma.com/file/abc",
      "https://ivanov.tilda.ws",
      "https://dribbble.com/ivanov",
      "https://behance.net/ivanov",
    ]);
    expect(r.portfolioLinks).toEqual([
      "https://behance.net/ivanov",
      "https://dribbble.com/ivanov",
      "https://ivanov.tilda.ws",
      "https://figma.com/file/abc",
    ]);
  });

  it("is stable within a tier (resume order preserved)", () => {
    const r = classifyUrls([
      "https://readymag.com/u1/a",
      "https://ivanov.notion.site/b",
      "https://designer.ru/user/1",
    ]);
    expect(r.portfolioLinks).toEqual([
      "https://readymag.com/u1/a",
      "https://ivanov.notion.site/b",
      "https://designer.ru/user/1",
    ]);
  });
});
