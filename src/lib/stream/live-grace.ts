/**
 * live-path-hardening (#127) — chat & engagement survive a live-signal blip.
 *
 * BUTT↔harbor reconnects are normal; the manifest briefly reports
 * STATION_ROTATION while the encoder is away. Keying the chat on that status
 * remounted the composer (losing the draft), closed the engagement sheet and
 * flashed "Chat is available during a live episode". Instead: once episode E
 * has been LIVE, it stays the chat episode until it has been non-LIVE for
 * {@link LIVE_GRACE_MS}, or a different episode appears, or the station is
 * OFF_AIR. While in that grace window the UI says "Signal interrupted".
 *
 * Pure reducer — the hook (`useLiveGrace`) supplies the clock.
 */
export const LIVE_GRACE_MS = 60_000;

export type LiveStatus = "LIVE" | "STATION_ROTATION" | "OFF_AIR";

export interface LiveObservation {
  /** null = status unknown (status service unavailable). */
  status: LiveStatus | null;
  episodeId: string | null;
}

export interface LiveGraceMemory {
  episodeId: string;
  /** When the episode stopped being LIVE; null while it is LIVE. */
  leftLiveAt: number | null;
}

export interface LiveGraceView {
  episodeId: string | null;
  open: boolean;
  interrupted: boolean;
}

export function reduceLiveGrace(
  memory: LiveGraceMemory | null,
  observation: LiveObservation,
  now: number,
): LiveGraceMemory | null {
  const { status, episodeId } = observation;
  if (status === "LIVE" && episodeId) {
    if (memory && memory.episodeId === episodeId && memory.leftLiveAt === null) return memory;
    return { episodeId, leftLiveAt: null };
  }
  if (!memory || status === "OFF_AIR") return null;
  if (episodeId && episodeId !== memory.episodeId) return null;
  if (memory.leftLiveAt === null) return { episodeId: memory.episodeId, leftLiveAt: now };
  if (now - memory.leftLiveAt >= LIVE_GRACE_MS) return null;
  return memory;
}

export function liveGraceView(memory: LiveGraceMemory | null): LiveGraceView {
  if (!memory) return { episodeId: null, open: false, interrupted: false };
  return { episodeId: memory.episodeId, open: true, interrupted: memory.leftLiveAt !== null };
}
