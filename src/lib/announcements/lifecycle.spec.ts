/**
 * Spec-first: status/action mapping is derived from backend feature.md AC-1
 * (013-content-announcements), not from any component that renders it.
 */
import { describe, it, expect } from "vitest";
import {
  ANNOUNCEMENT_STATUSES,
  statusLabel,
  statusVariant,
  availableActions,
  scheduleState,
  type AnnouncementStatus,
} from "./lifecycle";

describe("ANN-U-01: status -> pill mapping is total", () => {
  it("returns a distinct label + variant for every status in the union", () => {
    const seen = new Set<string>();
    for (const status of ANNOUNCEMENT_STATUSES) {
      const label = statusLabel(status);
      const variant = statusVariant(status);
      expect(label).toBeTruthy();
      expect(["ok", "warn", "bad", "neutral"]).toContain(variant);
      const combo = `${label}|${variant}`;
      expect(seen.has(combo)).toBe(false);
      seen.add(combo);
    }
    expect(ANNOUNCEMENT_STATUSES.length).toBe(6);
  });

  it("covers exactly the six API statuses", () => {
    const expected: AnnouncementStatus[] = [
      "DRAFT",
      "PENDING_REVIEW",
      "PUBLISHED",
      "SCHEDULED",
      "ARCHIVED",
      "REJECTED",
    ];
    expect([...ANNOUNCEMENT_STATUSES].sort()).toEqual([...expected].sort());
  });
});

describe("ANN-U-02: available actions per status", () => {
  it("DRAFT offers edit + submit, never archive", () => {
    const actions = availableActions("DRAFT");
    expect(actions).toEqual(expect.arrayContaining(["edit", "submit"]));
    expect(actions).not.toContain("archive");
  });

  it("PENDING_REVIEW offers review + edit", () => {
    const actions = availableActions("PENDING_REVIEW");
    expect(actions).toEqual(expect.arrayContaining(["review", "edit"]));
  });

  it("PUBLISHED offers edit, archive, pin/unpin, feature/unfeature", () => {
    const actions = availableActions("PUBLISHED");
    expect(actions).toEqual(
      expect.arrayContaining(["edit", "archive", "pin", "unpin", "feature", "unfeature"]),
    );
  });

  it("SCHEDULED offers edit + archive, never a publish-now action", () => {
    const actions = availableActions("SCHEDULED");
    expect(actions).toEqual(expect.arrayContaining(["edit", "archive"]));
    expect(actions).not.toContain("publish");
    expect(actions).not.toContain("publishNow");
  });

  it("REJECTED offers edit + submit again", () => {
    const actions = availableActions("REJECTED");
    expect(actions).toEqual(expect.arrayContaining(["edit", "submit"]));
  });

  it("ARCHIVED is read-only, never offers restore", () => {
    const actions = availableActions("ARCHIVED");
    expect(actions).toEqual([]);
    expect(actions).not.toContain("restore");
  });
});

describe("ANN-U-03: no second-approver concept exists (L34)", () => {
  it("feature is offered on PUBLISHED with no awaiting-second-mod notion, regardless of author", () => {
    const actions = availableActions("PUBLISHED");
    expect(actions).toContain("feature");
  });

  it("no status's action set ever mentions a second approver or an awaiting-approval action", () => {
    for (const status of ANNOUNCEMENT_STATUSES) {
      for (const action of availableActions(status)) {
        expect(action).not.toMatch(/second|awaiting|approve/i);
      }
    }
  });
});

describe("ANN-U-06 (schedule state) / INV-4: schedule state via real Date comparison", () => {
  it("scheduleState('none') when scheduledFor is null", () => {
    expect(scheduleState(null)).toBe("none");
  });

  it("scheduleState is 'pending' for a future instant", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(scheduleState(future)).toBe("pending");
  });

  it("scheduleState is 'elapsed' for a past instant, derived from a real comparison", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(scheduleState(past)).toBe("elapsed");
  });
});
