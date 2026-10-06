/** live-path-hardening W-U8 — the kiosk shows what listeners hear, not just "an episode is open". */
import { describe, expect, it } from "vitest";
import { formatCountdown, kioskBroadcastBanner } from "./broadcast-banner";

const NOW = Date.parse("2026-10-06T10:00:00.000Z");

describe("kioskBroadcastBanner", () => {
  it("W-U8: SOURCE_STALE with autoEndsAt → encoder offline with an m:ss countdown", () => {
    const banner = kioskBroadcastBanner(
      {
        status: "STATION_ROTATION",
        reason: "SOURCE_STALE",
        autoEndsAt: "2026-10-06T10:04:05.000Z",
        episodeOpen: true,
        showName: "Morning Show",
      },
      NOW,
    );
    expect(banner).toEqual({
      kind: "encoder-offline",
      label: "Encoder offline — listeners hear rotation; show auto-ends in 4:05",
    });
  });

  it("SEGMENT_STALE is the same encoder-offline state", () => {
    expect(
      kioskBroadcastBanner(
        { status: "STATION_ROTATION", reason: "SEGMENT_STALE", autoEndsAt: null, episodeOpen: true, showName: null },
        NOW,
      ),
    ).toEqual({ kind: "encoder-offline", label: "Encoder offline — listeners hear rotation" });
  });

  it("LIVE shows on air with the show name", () => {
    expect(
      kioskBroadcastBanner(
        { status: "LIVE", reason: null, autoEndsAt: null, episodeOpen: true, showName: "Morning Show" },
        NOW,
      ),
    ).toEqual({ kind: "live", label: "On air · Morning Show" });
  });

  it("an open episode with rotation for another reason never claims On air", () => {
    const banner = kioskBroadcastBanner(
      { status: "STATION_ROTATION", reason: "NO_ATTENDANCE", autoEndsAt: null, episodeOpen: true, showName: "X" },
      NOW,
    );
    expect(banner?.kind).toBe("rotation");
    expect(banner?.label).not.toMatch(/On air/);
  });

  it("unknown status with an open episode says so instead of On air", () => {
    expect(
      kioskBroadcastBanner({ status: null, reason: null, autoEndsAt: null, episodeOpen: true, showName: "X" }, NOW)?.kind,
    ).toBe("unknown");
  });

  it("nothing open and not live → no banner", () => {
    expect(
      kioskBroadcastBanner(
        { status: "STATION_ROTATION", reason: "NO_ATTENDANCE", autoEndsAt: null, episodeOpen: false, showName: null },
        NOW,
      ),
    ).toBeNull();
  });

  it("countdown clamps at 0:00 once the deadline passed", () => {
    expect(formatCountdown(-5_000)).toBe("0:00");
    expect(formatCountdown(59_400)).toBe("1:00");
    expect(formatCountdown(61_000)).toBe("1:01");
  });
});
