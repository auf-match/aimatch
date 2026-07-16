import { describe, it, expect } from "vitest";
import {
  extractBehanceProfiles,
  mapProfileToCandidate,
  isDeadBehancePage,
} from "./behance-import";

const profile = {
  id: 396401679,
  first_name: "Sabina",
  last_name: "Alieva",
  display_name: "Sabina Alieva",
  city: "Москва",
  country: "Russian Federation",
  location: "Москва, Russian Federation",
  company: "",
  occupation: " UX/UI & Graphic Designer",
  url: "https://www.behance.net/mopssia",
  website: "https://t.me/mopssia",
  fields: ["Graphic Design", "Web Design"],
  stats: { followers: 510, views: 51037 },
};

describe("extractBehanceProfiles", () => {
  it("finds profiles at any nesting depth", () => {
    const json = { a: { b: { c: [profile, profile] } } };
    expect(extractBehanceProfiles(json)).toHaveLength(2);
  });

  it("returns empty for unrelated json", () => {
    expect(extractBehanceProfiles({ foo: "bar", arr: [1, 2, 3] })).toEqual([]);
  });

  it("ignores objects without behance url", () => {
    const json = [{ display_name: "X", url: "https://dribbble.com/x" }];
    expect(extractBehanceProfiles(json)).toEqual([]);
  });

  it("ignores objects without a name", () => {
    const json = [{ url: "https://www.behance.net/nobody" }];
    expect(extractBehanceProfiles(json)).toEqual([]);
  });

  it("accepts first_name/last_name when display_name missing", () => {
    const { display_name, ...noDisplay } = profile;
    expect(extractBehanceProfiles([noDisplay])).toHaveLength(1);
  });

  it("does not throw when display_name is a non-string, and falls back to first/last name", () => {
    const json = [
      { ...profile, display_name: 0 },
      { ...profile, display_name: {} },
    ];
    expect(() => extractBehanceProfiles(json)).not.toThrow();
    const result = extractBehanceProfiles(json);
    expect(result).toHaveLength(2);
  });
});

describe("mapProfileToCandidate", () => {
  it("maps core fields with stub role/grade", () => {
    const r = mapProfileToCandidate(profile)!;
    expect(r).toMatchObject({
      name: "Sabina Alieva",
      portfolioLinks: ["https://www.behance.net/mopssia"],
      location: "Москва, Russian Federation",
      telegramContact: "https://t.me/mopssia",
      role: "OTHER",
      grade: "MIDDLE",
      status: "NEW",
      source: "behance",
    });
  });

  it("does not put t.me into portfolioLinks", () => {
    const r = mapProfileToCandidate(profile)!;
    expect(r.portfolioLinks).not.toContain("https://t.me/mopssia");
  });

  it("adds non-telegram website as a second portfolio link", () => {
    const r = mapProfileToCandidate({ ...profile, website: "https://kskv-dmtr.super.site" })!;
    expect(r.portfolioLinks).toEqual([
      "https://www.behance.net/mopssia",
      "https://kskv-dmtr.super.site",
    ]);
    expect(r.telegramContact).toBeUndefined();
  });

  it("extracts email from company when it looks like an email", () => {
    const r = mapProfileToCandidate({ ...profile, company: "elenadmelena@gmail.com " })!;
    expect(r.email).toBe("elenadmelena@gmail.com");
  });

  it("ignores company when it is not an email", () => {
    const r = mapProfileToCandidate({ ...profile, company: "Yandex" })!;
    expect(r.email).toBeUndefined();
  });

  it("builds name from first/last when display_name missing", () => {
    const { display_name, ...noDisplay } = profile;
    expect(mapProfileToCandidate(noDisplay)!.name).toBe("Sabina Alieva");
  });

  it("falls back to city+country when location missing", () => {
    const { location, ...noLoc } = profile;
    expect(mapProfileToCandidate(noLoc)!.location).toBe("Москва, Russian Federation");
  });

  it("returns null without a name", () => {
    expect(mapProfileToCandidate({ url: "https://www.behance.net/x" })).toBeNull();
  });

  it("returns null without a behance url", () => {
    expect(mapProfileToCandidate({ display_name: "X" })).toBeNull();
  });

  it("does not throw when display_name is a non-string and falls back to first/last name", () => {
    const p = { ...profile, display_name: 0 as unknown as string };
    expect(() => mapProfileToCandidate(p)).not.toThrow();
    expect(mapProfileToCandidate(p)!.name).toBe("Sabina Alieva");
  });

  it("returns null when display_name is a non-string and there is no first/last name fallback", () => {
    const p = { url: "https://www.behance.net/x", display_name: {} as unknown as string };
    expect(() => mapProfileToCandidate(p)).not.toThrow();
    expect(mapProfileToCandidate(p)).toBeNull();
  });
});

describe("isDeadBehancePage", () => {
  it("detects the russian 404 title", () => {
    expect(isDeadBehancePage("Не удалось найти эту страницу. :: Behance")).toBe(true);
  });
  it("detects the english 404 title", () => {
    expect(isDeadBehancePage("Page Not Found :: Behance")).toBe(true);
  });
  it("passes a live profile title", () => {
    expect(
      isDeadBehancePage("Sabina Alieva - UX/UI & Graphic Designer in Москва :: Behance"),
    ).toBe(false);
  });
  it("handles empty title", () => {
    expect(isDeadBehancePage("")).toBe(false);
  });
});
