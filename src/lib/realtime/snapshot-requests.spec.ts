import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotRequests, requestEngagementSnapshot } from "./snapshot-requests";
import { getEpisodeEngagementSnapshot } from "@/lib/api/endpoints/episodes/episodes";

vi.mock("@/lib/api/endpoints/episodes/episodes", () => ({ getEpisodeEngagementSnapshot: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("shared public snapshot requests", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces both queue events across listener/player into one fresh read", async () => {
    const load = vi.fn().mockResolvedValue({ upNext: ["oldest"] });
    const requests = new SnapshotRequests(load);
    const readers = Array.from({ length: 4 }, () => requests.read("episode"));
    await vi.advanceTimersByTimeAsync(50);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await Promise.all(readers)).toEqual(Array(4).fill({ upNext: ["oldest"] }));
  });

  it("does a follow-up read when handling commits during an in-flight read", async () => {
    const old = deferred<{ upNext: string[] }>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue({ upNext: ["retained"] });
    const requests = new SnapshotRequests(load);
    const first = requests.read("episode");
    await vi.advanceTimersByTimeAsync(50);
    const changed = requests.read("episode");
    old.resolve({ upNext: ["handled", "retained"] });
    await vi.advanceTimersByTimeAsync(50);
    expect(load).toHaveBeenCalledTimes(2);
    expect(await first).toEqual({ upNext: ["retained"] });
    expect(await changed).toEqual({ upNext: ["retained"] });
  });

  it("retries a throttled read after the production window without another socket event", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("429 Too Many Requests")).mockResolvedValue({ upNext: [] });
    const requests = new SnapshotRequests(load);
    const first = requests.read("episode");
    await vi.advanceTimersByTimeAsync(50);
    const otherReader = requests.read("episode");
    await vi.advanceTimersByTimeAsync(60_999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toEqual({ upNext: [] });
    expect(await otherReader).toEqual({ upNext: [] });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bounds persistent throttling and releases the failed request for later recovery", async () => {
    const load = vi.fn().mockRejectedValue(new Error("429 Too Many Requests"));
    const requests = new SnapshotRequests(load);
    const result = requests.read("episode").catch(error => error);
    await vi.advanceTimersByTimeAsync(122_050);
    expect(await result).toMatchObject({ message: "429 Too Many Requests" });
    expect(load).toHaveBeenCalledTimes(3);
    load.mockResolvedValue({ upNext: ["recovered"] });
    const recovered = requests.read("episode");
    await vi.advanceTimersByTimeAsync(50);
    expect(await recovered).toEqual({ upNext: ["recovered"] });
  });

  it("does not retry an ended episode and never serves a cached completed snapshot", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("400 Bad Request")).mockResolvedValue({ upNext: ["new"] });
    const requests = new SnapshotRequests(load);
    const failure = requests.read("episode").catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    expect(await failure).toMatchObject({ message: "400 Bad Request" });
    expect(load).toHaveBeenCalledTimes(1);
    const fresh = requests.read("episode");
    await vi.advanceTimersByTimeAsync(50);
    expect(await fresh).toEqual({ upNext: ["new"] });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps different episodes independent", async () => {
    const load = vi.fn(async (id: string) => ({ episodeId: id }));
    const requests = new SnapshotRequests(load);
    const first = requests.read("a");
    const second = requests.read("b");
    await vi.advanceTimersByTimeAsync(50);
    expect(await first).toEqual({ episodeId: "a" });
    expect(await second).toEqual({ episodeId: "b" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares the production loader across separate player and listener calls", async () => {
    const load = vi.mocked(getEpisodeEngagementSnapshot);
    load.mockResolvedValue({
      episodeId: "shared", capturedAt: "2026-10-23T00:00:00Z",
      recentChat: [], polls: [], pinnedTopic: null, reactions: [], upNext: [],
      hype: { episodeId: "shared", capturedAt: "2026-10-23T00:00:00Z", windowSeconds: 60, count: 0, trend: "flat", buckets: [] },
    });
    const listener = requestEngagementSnapshot("shared");
    const player = requestEngagementSnapshot("shared");
    const duplicateEvent = requestEngagementSnapshot("shared");
    await vi.advanceTimersByTimeAsync(50);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await listener).toEqual(await player);
    expect(await duplicateEvent).toMatchObject({ episodeId: "shared" });
  });

  it("keeps eleven campus listeners and three acceptances within the 120-read IP window", async () => {
    const load = vi.fn().mockResolvedValue({ upNext: [] });
    const browsers = Array.from({ length: 11 }, () => new SnapshotRequests(load));
    for (let action = 0; action < 3; action++) {
      const readers = browsers.flatMap(browser => Array.from({ length: 4 }, () => browser.read("episode")));
      await vi.advanceTimersByTimeAsync(50);
      await Promise.all(readers);
    }
    expect(load).toHaveBeenCalledTimes(33);
    expect(load.mock.calls.length).toBeLessThanOrEqual(120);
  });

  it("fetches the next committed change even immediately after a successful read", async () => {
    const load = vi.fn().mockResolvedValueOnce({ upNext: ["handled"] }).mockResolvedValue({ upNext: ["retained"] });
    const requests = new SnapshotRequests(load);
    const initial = requests.read("episode");
    await vi.advanceTimersByTimeAsync(50);
    expect(await initial).toEqual({ upNext: ["handled"] });
    const changed = requests.read("episode");
    await vi.advanceTimersByTimeAsync(50);
    expect(await changed).toEqual({ upNext: ["retained"] });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
