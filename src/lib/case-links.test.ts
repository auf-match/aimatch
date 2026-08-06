import { describe, it, expect } from "vitest";
import { selectCaseLinks, type LinkCandidate } from "./case-links";

const mk = (href: string, text = "", nav = false): LinkCandidate => ({ href, text, nav });

describe("selectCaseLinks", () => {
  it("отбрасывает служебные страницы (About/Contacts/Home)", () => {
    const base = "https://jane.design/";
    const links = [
      mk("https://jane.design/about", "About me"),
      mk("https://jane.design/contact", "Contact"),
      mk("https://jane.design/work/fintech-app", "Fintech app redesign"),
      mk("https://jane.design/work/saas-dashboard", "SaaS dashboard case"),
    ];
    const out = selectCaseLinks(links, base, 5);
    expect(out).toContain("https://jane.design/work/fintech-app");
    expect(out).toContain("https://jane.design/work/saas-dashboard");
    expect(out).not.toContain("https://jane.design/about");
    expect(out).not.toContain("https://jane.design/contact");
  });

  it("ранжирует реальные кейсы выше навигационных ссылок и режет по лимиту", () => {
    const base = "https://jane.design/";
    const links = [
      mk("https://jane.design/home", "Home", true),
      mk("https://jane.design/blog", "Blog", true),
      mk("https://jane.design/projects/alpha-redesign", "Alpha redesign", false),
      mk("https://jane.design/projects/beta-app", "Beta app", false),
      mk("https://jane.design/projects/gamma-brand", "Gamma brand", false),
    ];
    const out = selectCaseLinks(links, base, 2);
    expect(out).toHaveLength(2);
    // топ-2 — это проекты, а не Home/Blog
    expect(out.every((h) => h.includes("/projects/"))).toBe(true);
  });

  it("поднимает Behance /gallery/ и Dribbble /shots/ как кейсы", () => {
    const base = "https://www.behance.net/janedesign";
    const links = [
      mk("https://www.behance.net/janedesign/resume", "Resume"),
      mk("https://www.behance.net/gallery/123456/Fintech-App", "Fintech App"),
      mk("https://www.behance.net/gallery/789012/Brand-System", "Brand System"),
    ];
    const out = selectCaseLinks(links, base, 5);
    expect(out).toHaveLength(2);
    expect(out).toContain("https://www.behance.net/gallery/123456/Fintech-App");
    expect(out).toContain("https://www.behance.net/gallery/789012/Brand-System");
    expect(out.some((h) => h.includes("/resume"))).toBe(false);
  });

  it("держит Notion-подстраницы с хеш-слагами (без ключевых слов в пути)", () => {
    const base = "https://jane.notion.site/Portfolio-0a1b2c3d4e5f6a7b8c9d";
    const links = [
      mk("https://jane.notion.site/Fintech-Redesign-1a2b3c4d5e6f7a8b9c0d", "Fintech Redesign"),
      mk("https://jane.notion.site/Brand-Case-2b3c4d5e6f7a8b9c0d1e", "Brand Case"),
    ];
    const out = selectCaseLinks(links, base, 5);
    expect(out).toHaveLength(2);
    expect(out).toContain("https://jane.notion.site/Fintech-Redesign-1a2b3c4d5e6f7a8b9c0d");
  });

  it("дедуплицирует по URL (хеш/слэш) и отбрасывает файлы-ассеты", () => {
    const base = "https://jane.design/";
    const links = [
      mk("https://jane.design/work/one", "Case one"),
      mk("https://jane.design/work/one/", "Case one again"), // дубль (слэш)
      mk("https://jane.design/work/one#top", "Case one anchor"), // дубль (хеш)
      mk("https://jane.design/cv.pdf", "Download CV"), // ассет
    ];
    const out = selectCaseLinks(links, base, 5);
    expect(out.filter((h) => h.includes("/work/one")).length).toBe(1);
    expect(out.some((h) => h.endsWith(".pdf"))).toBe(false);
  });

  it("не возвращает ссылку на саму титульную страницу", () => {
    const base = "https://jane.design/portfolio";
    const links = [
      mk("https://jane.design/portfolio", "Portfolio"), // сама себя
      mk("https://jane.design/portfolio/case-a", "Case A"),
    ];
    const out = selectCaseLinks(links, base, 5);
    expect(out).toEqual(["https://jane.design/portfolio/case-a"]);
  });

  it("фолбэк: если явных кейсов нет — возвращает не-ассеты в DOM-порядке (не хуже прежнего)", () => {
    const base = "https://jane.design/";
    const links = [
      mk("https://jane.design/a", "a"),
      mk("https://jane.design/b", "b"),
      mk("https://jane.design/c", "c"),
    ];
    const out = selectCaseLinks(links, base, 2);
    expect(out).toHaveLength(2);
  });

  it("пустой вход → пустой выход", () => {
    expect(selectCaseLinks([], "https://jane.design/", 5)).toEqual([]);
  });
});
