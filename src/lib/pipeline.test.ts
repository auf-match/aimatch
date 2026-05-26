import { describe, it, expect } from "vitest";
import {
  daysInStage,
  groupPipelineByStage,
  mapShortlistStatusToStage,
  PIPELINE_STAGE_ORDER,
} from "./pipeline";

describe("daysInStage", () => {
  it("returns 0 for same day", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    expect(daysInStage(new Date("2026-05-26T08:00:00Z"), now)).toBe(0);
  });
  it("returns whole days, rounded down", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    expect(daysInStage(new Date("2026-05-24T20:00:00Z"), now)).toBe(1);
    expect(daysInStage(new Date("2026-05-23T11:00:00Z"), now)).toBe(3);
  });
});

describe("groupPipelineByStage", () => {
  it("groups entries by stage and keeps all stages present and ordered", () => {
    const entries = [
      { stage: "DL_APPROVED", id: "a" },
      { stage: "OFFER", id: "b" },
      { stage: "DL_APPROVED", id: "c" },
    ];
    const grouped = groupPipelineByStage(entries as any);
    expect(Object.keys(grouped)).toEqual(PIPELINE_STAGE_ORDER);
    expect(grouped.DL_APPROVED.map((e) => e.id)).toEqual(["a", "c"]);
    expect(grouped.OFFER.map((e) => e.id)).toEqual(["b"]);
    expect(grouped.HIRED).toEqual([]);
  });
});

describe("mapShortlistStatusToStage", () => {
  it("maps all 8 ShortlistStatus values", () => {
    expect(mapShortlistStatusToStage("PENDING" as any)).toBe("DL_APPROVED");
    expect(mapShortlistStatusToStage("CONTACTED" as any)).toBe("DL_APPROVED");
    expect(mapShortlistStatusToStage("INTERESTED" as any)).toBe("DL_APPROVED");
    expect(mapShortlistStatusToStage("NOT_INTERESTED" as any)).toBe("REJECTED");
    expect(mapShortlistStatusToStage("INTERVIEWING" as any)).toBe("CLIENT_INTERVIEW");
    expect(mapShortlistStatusToStage("OFFERED" as any)).toBe("OFFER");
    expect(mapShortlistStatusToStage("HIRED" as any)).toBe("HIRED");
    expect(mapShortlistStatusToStage("REJECTED" as any)).toBe("REJECTED");
  });
});
