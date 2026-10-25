export interface PresenceJoinTransport {
  timeout(milliseconds: number): {
    emit(
      event: "listening:join" | "episode:join",
      payload: { episodeId: string; anonId?: string },
      acknowledge: (error: Error | null, decision?: { ok: boolean }) => void,
    ): unknown;
  };
}

export function joinPresenceWithSnapshot(
  transport: PresenceJoinTransport,
  payload: { episodeId: string; anonId?: string },
  isCurrent: () => boolean,
  recover: () => void,
  event: "listening:join" | "episode:join" = "listening:join",
) {
  // A snapshot read before admission can miss a completion event committed
  // in the gap. Subscribe successfully, then read the authoritative queue.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let attempt = 0;
  const current = () => !cancelled && isCurrent();
  const join = () => {
    if (!current()) return;
    transport.timeout(5_000).emit(event, payload, (error, decision) => {
      if (!current()) return;
      if (!error && decision?.ok) { recover(); return; }
      // Keep retrying while this room/transport is current, with one bounded
      // timer and jitter so a recovered campus connection does not stampede.
      const delay = Math.min(1_000 * 2 ** Math.min(attempt++, 5), 30_000);
      timer = setTimeout(join, delay * (0.8 + Math.random() * 0.4));
    });
  };
  join();
  return () => { cancelled = true; clearTimeout(timer); };
}
