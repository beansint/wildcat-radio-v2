import { describe, expect, it } from "vitest";
import {
  SnapshotRecovery,
  activePin,
  measuredBarHeights,
} from "./snapshot-recovery";
import {
  createEpisodeIdProvider,
  createEpisodeIdentityProvider,
  listeningJoinPayload,
} from "./episode-browser-id";

describe("request-scoped recovery", () => {
  it("forgets pre-disconnect events and ignores overlapping older responses", () => {
    const r = new SnapshotRecovery();
    r.mark({ id: "old" });
    const old = r.begin();
    r.mark({ id: "during-old" });
    const latest = r.begin();
    r.mark({ id: "new" });
    r.mark({ id: "hidden", removed: true });
    expect(r.finish(old)).toBeNull();
    expect([...r.finish(latest)!.preserveLiveIds!]).toEqual(["new"]);
    expect(r.finish(latest)).toBeNull();
  });
  it("expires pins by wall clock and displays true zero bins", () => {
    expect(
      activePin(
        { text: "expired", expiresAt: "2026-01-01" },
        Date.parse("2026-01-02"),
      ),
    ).toBeNull();
    expect(measuredBarHeights([{ count: 0 }, { count: 0 }])).toEqual([0, 0]);
    expect(measuredBarHeights([{ count: 1 }, { count: 4 }])).toEqual([25, 100]);
  });
});
describe("episode browser IDs", () => {
  it("shares concurrent first play and reconnects, separates episodes and expires", async () => {
    const data = new Map<string, string>();
    let tail = Promise.resolve();
    let time = 0;
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    const exclusive = async <T>(fn: () => T): Promise<T> => {
      const next = tail.then(fn);
      tail = next.then(() => undefined);
      return next;
    };
    const a = createEpisodeIdProvider({ storage, exclusive, now: () => time });
    const b = createEpisodeIdProvider({ storage, exclusive, now: () => time });
    const ids = await Promise.all([a("a"), b("a")]);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).toBe(ids[1]);
    expect(await a("a")).toBe(ids[0]);
    expect(await a("b")).not.toBe(ids[0]);
    time = 86_400_001;
    expect(await a("a")).not.toBe(ids[0]);
  });
  it("uses bounded session-only memory when storage is denied", async () => {
    const p = createEpisodeIdProvider({
      storage: {
        getItem: () => {
          throw Error("denied");
        },
        setItem: () => {
          throw Error("denied");
        },
      },
    });
    expect(await p("a")).toBe(await p("a"));
    expect(await p("b")).not.toBe(await p("a"));
  });
});

it("omits the browser identifier when a durable claim was denied so backend quality records session fallback", async () => {
  const identity = await createEpisodeIdentityProvider({
    storage: {
      getItem: () => {
        throw Error("denied");
      },
      setItem: () => {
        throw Error("denied");
      },
    },
  })("episode");
  expect(identity.persistent).toBe(false);
  expect(listeningJoinPayload("episode", identity)).toEqual({
    episodeId: "episode",
  });
});
it("emits a durable episode identifier only after storage write succeeds", async () => {
  const data = new Map<string, string>();
  const identity = await createEpisodeIdentityProvider({
    storage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    },
  })("episode");
  expect(identity.persistent).toBe(true);
  expect(listeningJoinPayload("episode", identity)).toEqual({
    episodeId: "episode",
    anonId: identity.id,
  });
  const failed = await createEpisodeIdentityProvider({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    },
  })("episode");
  expect(failed.persistent).toBe(false);
});
