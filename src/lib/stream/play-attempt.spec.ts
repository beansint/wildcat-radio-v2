import { describe, expect, it } from "vitest";
import { PlayAttemptTracker } from "./play-attempt";

describe("PlayAttemptTracker", () => {
  it("invalidates an attempt when playback is cancelled", () => {
    const tracker = new PlayAttemptTracker();
    const attempt = tracker.start();
    expect(attempt.isCurrent()).toBe(true);
    tracker.cancel();
    expect(attempt.isCurrent()).toBe(false);
  });

  it("invalidates an older attempt when a newer one starts", () => {
    const tracker = new PlayAttemptTracker();
    const first = tracker.start();
    const second = tracker.start();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("keeps cancellation idempotent", () => {
    const tracker = new PlayAttemptTracker();
    const attempt = tracker.start();
    tracker.cancel();
    tracker.cancel();
    expect(attempt.isCurrent()).toBe(false);
    expect(tracker.start().isCurrent()).toBe(true);
  });
});
