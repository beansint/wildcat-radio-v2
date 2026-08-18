/**
 * Pure decision logic for `useStreamPresence`'s connect/join/leave dance.
 * Extracted so the socket-gating rules (FE#40) can be unit tested without a
 * DOM, a real socket, or React — this function has no I/O.
 */
export interface PresenceTransitionInput {
  /** Whether the listener currently wants to be connected (e.g. actually playing audio). */
  active: boolean;
  /** Current episode ID from the stream manifest/socket, or null for station rotation / off-air. */
  episodeId: string | null;
  /** The episode room we were previously joined to, or null. */
  prevEpisodeId: string | null;
}

export interface PresenceTransition {
  /** Whether a socket connection should exist after this transition. */
  shouldConnect: boolean;
  /** Episode room to emit `listening:leave` for, if any. Requires an existing connection. */
  leave: string | null;
  /** Episode room to emit `listening:join` for, if any. Requires a connection. */
  join: string | null;
  /** New value the caller should store as `prevEpisodeId`. */
  nextPrevEpisodeId: string | null;
}

export function computePresenceTransition({
  active,
  episodeId,
  prevEpisodeId,
}: PresenceTransitionInput): PresenceTransition {
  if (!active) {
    // Not listening: leave any room we were in (if we have a connection to
    // leave through) and tear the connection down — no socket while idle.
    return {
      shouldConnect: false,
      leave: prevEpisodeId,
      join: null,
      nextPrevEpisodeId: null,
    };
  }

  if (!episodeId) {
    // Listening, but no episode room to join yet (e.g. station rotation).
    // Still connect (for future stream:status broadcasts) and leave any
    // stale room membership.
    return {
      shouldConnect: true,
      leave: prevEpisodeId,
      join: null,
      nextPrevEpisodeId: null,
    };
  }

  return {
    shouldConnect: true,
    leave: prevEpisodeId && prevEpisodeId !== episodeId ? prevEpisodeId : null,
    join: episodeId,
    nextPrevEpisodeId: episodeId,
  };
}
