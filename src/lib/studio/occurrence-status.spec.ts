/** WEB-U-04 */
import { describe, expect, it } from "vitest";
import { occurrencePill, type StudioOccurrenceStatus } from "./occurrence-status";

describe("occurrencePill", () => {
  it("covers every studio occurrence status with a distinct label", () => {
    const all: StudioOccurrenceStatus[] = ["SCHEDULED", "DELAYED", "CANCELLED", "HIATUS", "PENDING_HANDOVER", "ON_AIR", "DONE"];
    const labels = all.map((s) => occurrencePill(s).label);
    expect(new Set(labels).size).toBe(all.length);
  });

  it("only ON_AIR uses the live badge", () => {
    expect(occurrencePill("ON_AIR").pillClass).toBe("wc-badge-live");
    expect(occurrencePill("PENDING_HANDOVER").pillClass).not.toBe("wc-badge-live");
    expect(occurrencePill("SCHEDULED").pillClass).not.toBe("wc-badge-live");
  });

  it("degrades safely for an unknown status", () => {
    expect(occurrencePill("SOMETHING_NEW")).toEqual({ label: "SOMETHING_NEW", pillClass: "wc-pill-neutral" });
  });
});
