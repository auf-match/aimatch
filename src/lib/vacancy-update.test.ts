import { describe, it, expect } from "vitest";
import {
  applyDiffSelection,
  diffTouchesScoringFields,
  isStaleScore,
  SCORING_FIELDS,
  type DiffItem,
} from "./vacancy-update";

describe("isStaleScore", () => {
  it("returns false if criteriaUpdatedAt is null", () => {
    expect(isStaleScore(new Date("2026-01-01"), null)).toBe(false);
  });
  it("returns true if score is older than criteriaUpdatedAt", () => {
    expect(isStaleScore(new Date("2026-01-01"), new Date("2026-02-01"))).toBe(true);
  });
  it("returns false if score is newer than criteriaUpdatedAt", () => {
    expect(isStaleScore(new Date("2026-02-02"), new Date("2026-02-01"))).toBe(false);
  });
  it("treats equal timestamps as not stale", () => {
    const t = new Date("2026-02-01");
    expect(isStaleScore(t, t)).toBe(false);
  });
});

describe("diffTouchesScoringFields", () => {
  it("returns true if any applied item touches a scoring field", () => {
    const applied: DiffItem[] = [
      { field: "productDescription", op: "set", proposedValue: "x", reason: "" },
      { field: "keyTasks", op: "add", proposedValue: "Новая задача", reason: "" },
    ];
    expect(diffTouchesScoringFields(applied)).toBe(true);
  });
  it("returns false if no applied item touches a scoring field", () => {
    const applied: DiffItem[] = [
      { field: "productDescription", op: "set", proposedValue: "x", reason: "" },
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
    ];
    expect(diffTouchesScoringFields(applied)).toBe(false);
  });
  it("returns false for empty list", () => {
    expect(diffTouchesScoringFields([])).toBe(false);
  });
});

describe("applyDiffSelection", () => {
  const baseVacancy = {
    keyTasks: ["A", "B", "C"],
    salaryRange: "150-200k",
    scoringCriteria: [
      { criterion: "Опыт B2C", weight: 30, type: "required" },
      { criterion: "Метрики", weight: 20, type: "nice_to_have" },
    ],
  };

  it("set: replaces scalar value", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200-250k", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ salaryRange: "200-250k" });
  });

  it("add: appends item to array field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "add", proposedValue: "D", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "B", "C", "D"] });
  });

  it("remove: removes matching item from array field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "remove", proposedValue: "B", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "C"] });
  });

  it("modify: replaces item in array field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "modify", proposedValue: { from: "B", to: "B2" }, reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "B2", "C"] });
  });

  it("scoringCriteria add: appends full criterion object", () => {
    const proposed: DiffItem[] = [
      {
        field: "scoringCriteria",
        op: "add",
        proposedValue: { criterion: "Аргументация", weight: 15, type: "required" },
        reason: "",
      },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect((result.payload.scoringCriteria as any[]).length).toBe(3);
    expect((result.payload.scoringCriteria as any[])[2]).toEqual({
      criterion: "Аргументация",
      weight: 15,
      type: "required",
    });
  });

  it("scoringCriteria remove: matches by criterion name", () => {
    const proposed: DiffItem[] = [
      { field: "scoringCriteria", op: "remove", proposedValue: "Метрики", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect((result.payload.scoringCriteria as any[]).length).toBe(1);
    expect((result.payload.scoringCriteria as any[])[0].criterion).toBe("Опыт B2C");
  });

  it("scoringCriteria modify: replaces object matched by 'from' name", () => {
    const proposed: DiffItem[] = [
      {
        field: "scoringCriteria",
        op: "modify",
        proposedValue: {
          from: "Опыт B2C",
          to: { criterion: "Опыт B2C", weight: 40, type: "required" },
        },
        reason: "",
      },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 0 }]);
    expect((result.payload.scoringCriteria as any[])[0].weight).toBe(40);
  });

  it("respects user edits via edits parameter", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [
      { index: 0, editedValue: "220k" },
    ]);
    expect(result.payload).toEqual({ salaryRange: "220k" });
  });

  it("accumulates multiple selections on the same field", () => {
    const proposed: DiffItem[] = [
      { field: "keyTasks", op: "add", proposedValue: "D", reason: "" },
      { field: "keyTasks", op: "add", proposedValue: "E", reason: "" },
      { field: "keyTasks", op: "remove", proposedValue: "A", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [
      { index: 0 },
      { index: 1 },
      { index: 2 },
    ]);
    expect(result.payload).toEqual({ keyTasks: ["B", "C", "D", "E"] });
  });

  it("ignores unselected items", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
      { field: "keyTasks", op: "add", proposedValue: "D", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [{ index: 1 }]);
    expect(result.payload).toEqual({ keyTasks: ["A", "B", "C", "D"] });
  });

  it("returns appliedDiff for audit", () => {
    const proposed: DiffItem[] = [
      { field: "salaryRange", op: "set", proposedValue: "200k", reason: "" },
    ];
    const result = applyDiffSelection(baseVacancy, proposed, [
      { index: 0, editedValue: "220k" },
    ]);
    expect(result.appliedDiff).toEqual([
      { field: "salaryRange", op: "set", proposedValue: "220k", reason: "" },
    ]);
  });
});

describe("SCORING_FIELDS", () => {
  it("contains the expected matching-relevant fields", () => {
    expect(SCORING_FIELDS).toContain("scoringCriteria");
    expect(SCORING_FIELDS).toContain("keyTasks");
    expect(SCORING_FIELDS).toContain("requiredSkills");
    expect(SCORING_FIELDS).not.toContain("productDescription");
    expect(SCORING_FIELDS).not.toContain("salaryRange");
  });
});
