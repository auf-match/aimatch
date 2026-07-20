import { describe, it, expect } from "vitest";
import {
  classifyUrls,
  extractUrls,
  isHuntflowExport,
  extractHuntflowApplicants,
  mapApplicantToCandidate,
} from "./huntflow-import";

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

const applicant = {
  id: 30378852,
  account_source: 422647,
  first_name: "Иван",
  last_name: "Иванов",
  middle_name: "Петрович",
  position: "Product Designer",
  email: "ivan@example.com",
  phone: "+79991234567",
  externals: [
    {
      data: {
        body: [
          "Портфолио: https://www.behance.net/ivanov/projects",
          "Телеграм https://t.me/ivanov",
          "Резюме на https://spb.hh.ru/resume/abc",
          "LinkedIn https://www.linkedin.com/in/ivanov",
        ].join("\n"),
        area: { name: "Санкт-Петербург" },
      },
    },
  ],
};

describe("isHuntflowExport", () => {
  it("detects a huntflow export by marker fields", () => {
    expect(isHuntflowExport({ items: [applicant] })).toBe(true);
  });

  it("rejects a behance-shaped export", () => {
    expect(
      isHuntflowExport([{ display_name: "X", url: "https://behance.net/x" }]),
    ).toBe(false);
  });

  it("rejects an items array without huntflow markers", () => {
    expect(isHuntflowExport({ items: [{ foo: "bar" }] })).toBe(false);
  });

  // Пустой файл уходит в Huntflow-ветку намеренно: там пользователь получит
  // осмысленное сообщение, а не «не найдено профилей Behance».
  it("accepts an empty items array", () => {
    expect(isHuntflowExport({ items: [] })).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isHuntflowExport(null)).toBe(false);
    expect(isHuntflowExport({})).toBe(false);
    expect(isHuntflowExport({ items: "nope" })).toBe(false);
  });
});

describe("extractHuntflowApplicants", () => {
  it("returns items array", () => {
    expect(extractHuntflowApplicants({ items: [applicant, applicant] })).toHaveLength(2);
  });

  it("returns empty for non-huntflow input", () => {
    expect(extractHuntflowApplicants({ foo: 1 })).toEqual([]);
    expect(extractHuntflowApplicants(null)).toEqual([]);
  });

  it("filters out non-object entries so one bad record doesn't crash the batch", () => {
    const result = extractHuntflowApplicants({ items: [applicant, null, "garbage", 42] });
    expect(result).toEqual([applicant]);
  });
});

describe("mapApplicantToCandidate", () => {
  it("maps a full applicant", () => {
    const r = mapApplicantToCandidate(applicant)!;
    expect(r).toMatchObject({
      name: "Иван Иванов",
      portfolioLinks: ["https://behance.net/ivanov"],
      telegramContact: "https://t.me/ivanov",
      linkedinUrl: "https://linkedin.com/in/ivanov",
      email: "ivan@example.com",
      location: "Санкт-Петербург",
      role: "OTHER",
      grade: "MIDDLE",
      status: "NEW",
      source: "huntflow",
    });
  });

  it("returns null without a portfolio link", () => {
    const noPf = {
      ...applicant,
      externals: [{ data: { body: "Резюме https://hh.ru/resume/abc" } }],
    };
    expect(mapApplicantToCandidate(noPf)).toBeNull();
  });

  it("returns null without a name", () => {
    const noName = { ...applicant, first_name: "", last_name: "" };
    expect(mapApplicantToCandidate(noName)).toBeNull();
  });

  it("collects links across several externals", () => {
    const multi = {
      ...applicant,
      externals: [
        { data: { body: "https://behance.net/ivanov" } },
        { data: { body: "https://dribbble.com/ivanov" } },
      ],
    };
    expect(mapApplicantToCandidate(multi)!.portfolioLinks).toEqual([
      "https://behance.net/ivanov",
      "https://dribbble.com/ivanov",
    ]);
  });

  it("drops the huntflow placeholder email", () => {
    const r = mapApplicantToCandidate({ ...applicant, email: "office@huntflow.ru" })!;
    expect(r.email).toBeUndefined();
  });

  it("falls back from area.name to city for location", () => {
    const cityOnly = {
      ...applicant,
      externals: [{ data: { body: "https://behance.net/ivanov", city: "Тюмень" } }],
    };
    expect(mapApplicantToCandidate(cityOnly)!.location).toBe("Тюмень");
  });

  it("leaves location undefined when absent", () => {
    const noLoc = {
      ...applicant,
      externals: [{ data: { body: "https://behance.net/ivanov" } }],
    };
    expect(mapApplicantToCandidate(noLoc)!.location).toBeUndefined();
  });

  it("survives missing or malformed externals", () => {
    expect(mapApplicantToCandidate({ ...applicant, externals: [] })).toBeNull();
    expect(mapApplicantToCandidate({ ...applicant, externals: undefined })).toBeNull();
    expect(
      mapApplicantToCandidate({ ...applicant, externals: [null, { data: null }] }),
    ).toBeNull();
  });
});
