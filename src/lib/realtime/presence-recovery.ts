export interface PresenceJoinTransport {
  timeout(milliseconds: number): {
    emit(
      event: "listening:join",
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
) {
  // A snapshot read before admission can miss a completion event committed
  // in the gap. Subscribe successfully, then read the authoritative queue.
  transport.timeout(5_000).emit("listening:join", payload, (error, decision) => {
    if (error || !decision?.ok || !isCurrent()) return;
    recover();
  });
}
