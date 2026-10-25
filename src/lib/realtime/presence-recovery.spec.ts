import { afterEach, describe, expect, it, vi } from "vitest";
import { joinPresenceWithSnapshot, type PresenceJoinTransport } from "./presence-recovery";
import { authoritativeUpNext } from "./engagement-state";

function admission() {
  const acknowledgements: Array<(error: Error | null, decision?: { ok: boolean }) => void> = [];
  const transport: PresenceJoinTransport = {
    timeout: () => ({ emit: (_event, _payload, callback) => { acknowledgements.push(callback); } }),
  };
  return { transport, respond: (error: Error | null, decision?: { ok: boolean }) => acknowledgements.shift()?.(error, decision) };
}

describe("player presence admission recovery", () => {
  afterEach(() => vi.useRealTimers());
  it("retries a refused admission on the same connected transport and recovers only after acknowledgement", () => {
    vi.useFakeTimers();
    const room = admission();
    let visible = false;
    joinPresenceWithSnapshot(room.transport, { episodeId: "episode" }, () => true, () => { visible = true; });
    room.respond(null, { ok: false });
    expect(visible).toBe(false);
    vi.advanceTimersByTime(3_000);
    room.respond(null, { ok: true });
    expect(visible).toBe(true);
  });

  it("retries a timed-out episode admission and cancels retries after scope changes", () => {
    vi.useFakeTimers();
    const room = admission();
    let current = true;
    let recovered = 0;
    const cancel = joinPresenceWithSnapshot(room.transport, {episodeId: "episode"}, () => current,
      () => { recovered++; }, "episode:join");
    room.respond(new Error("ack lost"));
    vi.advanceTimersByTime(1_300);
    room.respond(null, {ok: true});
    expect(recovered).toBe(1);
    current = false;
    cancel();
    vi.advanceTimersByTime(120_000);
    room.respond(null, {ok: true});
    expect(recovered).toBe(1);
  });

  it("shows the authoritative head after an item is handled while room admission is pending", () => {
    const room = admission();
    const removed = { id: "removed", createdAt: "2026-10-23T00:00:00Z" };
    const retained = { id: "retained", createdAt: "2026-10-23T00:01:00Z" };
    let snapshot = [removed, retained];
    let visibleId: string | null = null;
    joinPresenceWithSnapshot(room.transport, { episodeId: "episode" }, () => true, () => {
      visibleId = authoritativeUpNext(snapshot)[0]?.id ?? null;
    });
    // The completion event occurs before this client has joined the room.
    snapshot = [retained];
    room.respond(null, { ok: true });
    expect(visibleId).toBe("retained");
  });

  it("does not expose queue data before admission succeeds", () => {
    const room = admission();
    let visible = false;
    joinPresenceWithSnapshot(room.transport, { episodeId: "episode" }, () => true, () => { visible = true; });
    expect(visible).toBe(false);
    room.respond(null, { ok: false });
    expect(visible).toBe(false);
  });

  it("ignores a successful acknowledgement from a disconnected or superseded join", () => {
    const room = admission();
    let current = true;
    let visibleId: string | null = null;
    joinPresenceWithSnapshot(room.transport, { episodeId: "old-episode" }, () => current, () => { visibleId = "old-head"; });
    current = false;
    room.respond(null, { ok: true });
    expect(visibleId).toBeNull();
    const reconnected = admission();
    joinPresenceWithSnapshot(reconnected.transport, { episodeId: "new-episode" }, () => true, () => { visibleId = "new-head"; });
    reconnected.respond(null, { ok: true });
    expect(visibleId).toBe("new-head");
  });

  it("does not recover from a timed-out or malformed acknowledgement", () => {
    for (const error of [new Error("Timed out"), null]) {
      const room = admission();
      let visible = false;
      joinPresenceWithSnapshot(room.transport, { episodeId: "episode" }, () => true, () => { visible = true; });
      room.respond(error);
      expect(visible).toBe(false);
    }
  });
});
