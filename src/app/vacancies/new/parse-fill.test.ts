import { describe, it, expect } from "vitest";
import { buildFieldsUpdate, type ParsedFields } from "./parse-fill";

describe("buildFieldsUpdate", () => {
  it("применяет заполненные high-поля, hints пуст", () => {
    const fields: ParsedFields = {
      title: { value: "Продуктовый дизайнер", confidence: "high" },
      role: { value: "PRODUCT_DESIGNER", confidence: "high" },
      keyTasks: { value: ["дизайн-система"], confidence: "high" },
    };
    const { data, hints } = buildFieldsUpdate(fields);
    expect(data.title).toBe("Продуктовый дизайнер");
    expect(data.role).toBe("PRODUCT_DESIGNER");
    expect(data.keyTasks).toEqual(["дизайн-система"]);
    expect(hints.size).toBe(0);
  });

  it("null / пустая строка / пустой массив → дефолт + hint missing", () => {
    const fields: ParsedFields = {
      title: { value: null, confidence: null },
      location: { value: "  ", confidence: null },
      keyTasks: { value: [], confidence: null },
    };
    const { data, hints } = buildFieldsUpdate(fields);
    expect(data.title).toBe("");
    expect(data.location).toBe("");
    expect(data.keyTasks).toEqual([]);
    expect(hints.get("title")).toBe("missing");
    expect(hints.get("location")).toBe("missing");
    expect(hints.get("keyTasks")).toBe("missing");
  });

  it("непустое значение с confidence low → hint low", () => {
    const fields: ParsedFields = {
      salaryRange: { value: "200-250к", confidence: "low" },
    };
    const { data, hints } = buildFieldsUpdate(fields);
    expect(data.salaryRange).toBe("200-250к");
    expect(hints.get("salaryRange")).toBe("low");
  });

  it("применяет дефолты для полей-энамов и чисел", () => {
    const { data } = buildFieldsUpdate({});
    expect(data.role).toBe("PRODUCT_DESIGNER");
    expect(data.grade).toBe("MIDDLE");
    expect(data.designersNeeded).toBe(1);
    expect(data.employmentType).toBe("FULL_TIME");
    expect(data.workFormat).toBe("REMOTE");
    expect(data.needsInternational).toBe(false);
    expect(data.hiringStages).toBeNull();
  });

  it("неизвестный ключ не роняет и не попадает в data", () => {
    const fields = { totallyUnknown: { value: "x", confidence: "high" } } as unknown as ParsedFields;
    const { data } = buildFieldsUpdate(fields);
    expect("totallyUnknown" in data).toBe(false);
  });
});
