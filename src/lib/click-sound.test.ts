import { describe, it, expect } from "vitest";
import { resolveClickSound, type ClickTargetInfo } from "./click-sound";

const s = (info: Partial<ClickTargetInfo> & { tag?: string } = {}) =>
  resolveClickSound({ tag: "div", ...info });

describe("resolveClickSound", () => {
  describe("явная пометка", () => {
    it("пустое значение — основной звук из файла", () => {
      // Так React отдаёт data-click-sound="" в DOM
      expect(s({ tag: "button", marker: "" })).toBe("primary");
      expect(s({ tag: "button", marker: "primary" })).toBe("primary");
    });

    it("имя пресета — процедурный звук", () => {
      for (const p of ["press", "click", "tap", "hover", "select", "toggle", "tick"]) {
        expect(s({ tag: "button", marker: p })).toBe(p);
      }
    });

    it("false снимает звук с конкретного элемента", () => {
      expect(s({ tag: "button", marker: "false" })).toBe(null);
    });

    it("незнакомое значение молчит, а не звучит наугад", () => {
      // Опечатка в пресете не должна давать случайный звук
      expect(s({ tag: "button", marker: "clik" })).toBe(null);
    });

    it("перебивает разбор по тегу", () => {
      expect(s({ tag: "input", type: "checkbox", marker: "tick" })).toBe("tick");
    });

    it("не зависит от регистра и пробелов", () => {
      expect(s({ tag: "button", marker: "  TOGGLE " })).toBe("toggle");
    });
  });

  describe("разбор по роли", () => {
    it("переключатели", () => {
      for (const role of ["switch", "checkbox", "radio", "menuitemcheckbox"]) {
        expect(s({ role })).toBe("toggle");
      }
    });

    it("выбор из набора", () => {
      for (const role of ["option", "tab", "menuitem"]) {
        expect(s({ role })).toBe("select");
      }
    });

    it("обычное нажатие", () => {
      expect(s({ role: "button" })).toBe("click");
      expect(s({ role: "link" })).toBe("click");
    });

    it("роль важнее тега", () => {
      expect(s({ tag: "a", role: "switch" })).toBe("toggle");
    });

    it("неинтерактивная роль отключает звук у кликабельного тега", () => {
      expect(s({ tag: "a", role: "presentation" })).toBe(null);
    });
  });

  describe("разбор по тегу", () => {
    it("кнопки, ссылки и label", () => {
      expect(s({ tag: "button" })).toBe("click");
      expect(s({ tag: "a" })).toBe("click");
      expect(s({ tag: "label" })).toBe("click");
      expect(s({ tag: "BUTTON" })).toBe("click");
    });

    it("select и summary", () => {
      expect(s({ tag: "select" })).toBe("select");
      expect(s({ tag: "summary" })).toBe("press");
    });

    it("чекбокс и радио переключают", () => {
      expect(s({ tag: "input", type: "checkbox" })).toBe("toggle");
      expect(s({ tag: "input", type: "radio" })).toBe("toggle");
    });

    it("кнопочные input звучат как кнопки", () => {
      for (const type of ["submit", "button", "reset", "file"]) {
        expect(s({ tag: "input", type })).toBe("click");
      }
    });

    it("поля ввода молчат — клик ставит курсор", () => {
      for (const type of ["text", "email", "password", "search", "number", "date"]) {
        expect(s({ tag: "input", type })).toBe(null);
      }
      expect(s({ tag: "input" })).toBe(null);
      expect(s({ tag: "textarea" })).toBe(null);
    });

    it("обычные контейнеры молчат", () => {
      for (const tag of ["div", "span", "p", "section", "li"]) {
        expect(s({ tag })).toBe(null);
      }
    });
  });

  describe("заблокированные элементы", () => {
    // Звук обещает действие. Если клик ничего не делает, обещать нечего.
    it("молчат даже с явной пометкой", () => {
      expect(s({ tag: "button", marker: "", disabled: true })).toBe(null);
      expect(s({ tag: "button", marker: "tap", ariaDisabled: "true" })).toBe(null);
    });

    it("звучат при aria-disabled=false", () => {
      expect(s({ tag: "button", ariaDisabled: "false" })).toBe("click");
    });
  });
});
