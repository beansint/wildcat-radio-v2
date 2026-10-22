"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { GetStreamManifest200Reason } from "@/lib/api/model";
import { acquireSocket, type SocketLease } from "./socket";
import { getEpisodeBrowserIdentity, listeningJoinPayload } from "./episode-browser-id";
import { computePresenceTransition } from "./presence-actions";
import { getEpisodeEngagementSnapshot } from "@/lib/api/endpoints/episodes/episodes";
import { authoritativeUpNext } from "./engagement-state";
import { joinPresenceWithSnapshot } from "./presence-recovery";

export interface StreamStatusEvent {
  episodeId: string | null;
  status: "LIVE" | "STATION_ROTATION" | "OFF_AIR";
  reason: GetStreamManifest200Reason;
  listeners: number;
  /** #127 — server auto-end deadline while a LIVE episode's encoder is stale (may be absent). */
  autoEndsAt?: string | null;
}

/** Minimal shape of a `queue:up-next` payload — the bar only shows the text. */
export interface UpNextPeek {
  id: string;
  type: string;
  text: string;
}

interface PresenceState {
  listeners: number | null;
  socketStatus: "LIVE" | "STATION_ROTATION" | "OFF_AIR" | null;
  socketReason: GetStreamManifest200Reason | null;
  /** undefined = the event did not carry the field (older server). */
  socketAutoEndsAt: string | null | undefined;
  socketEpisodeId: string | null | undefined;
  /** Oldest publicly queued submission, recovered while listening. */
  upNext: UpNextPeek | null;
}

const EMPTY: PresenceState = {
  listeners: null,
  socketStatus: null,
  socketReason: null,
  socketAutoEndsAt: undefined,
  socketEpisodeId: undefined,
  upNext: null,
};

/**
 * Joins the Socket.IO presence room while `active && episodeId` is truthy.
 * Listens for `stream:status` events to surface live listener counts.
 *
 * FE#40: the socket connection itself is gated on `active` (real listen
 * intent), not just the room-join emits — no `active`, no WebSocket. The
 * connection is opened lazily (dynamic import, see `./socket`) and torn
 * down again as soon as the listener goes idle, so anonymous/marketing
 * routes never open a socket before the user presses play.
 *
 * @param episodeId  Current episode ID from the stream manifest (or null for station rotation / off-air)
 * @param active     Whether the listener is currently joined (e.g. player is playing)
 */
export function useStreamPresence(
  episodeId: string | null,
  active: boolean
): PresenceState {
  const [state, setState] = useState<PresenceState>(EMPTY);

  // Track previous episodeId so we can leave the old room
  const prevEpisodeId = useRef<string | null>(null);

  useEffect(() => {
    const transition = computePresenceTransition({
      active,
      episodeId,
      prevEpisodeId: prevEpisodeId.current,
    });

    if (!transition.shouldConnect) {
      prevEpisodeId.current = transition.nextPrevEpisodeId;
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    let lease: SocketLease<Socket> | null = null;
    let queueVersion = 0;
    let joinVersion = 0;

    async function refreshQueue() {
      if (!episodeId) return;
      const version = ++queueVersion;
      try {
        const snapshot = await getEpisodeEngagementSnapshot(episodeId);
        if (!cancelled && version === queueVersion && snapshot.episodeId === episodeId) {
          setState(prev => ({ ...prev, upNext: authoritativeUpNext(snapshot.upNext)[0] ?? null }));
        }
      } catch { /* A reconnect or later invalidation retries without fabricating a queue. */ }
    }

    // Never render presence-derived state from a previous episode while the
    // new room is joining.
    setState(EMPTY);

    function onStreamStatus(event: StreamStatusEvent) {
      if (episodeId && event.episodeId && event.episodeId !== episodeId) return;
      setState((prev) => ({
        ...prev,
        listeners: event.listeners,
        socketStatus: event.status,
        socketReason: event.reason ?? null,
        socketAutoEndsAt: event.autoEndsAt,
        socketEpisodeId: event.episodeId,
      }));
    }

    function onQueueUpNext() {
      void refreshQueue();
    }
    function onQueueChanged(event: { episodeId: string }) {
      if (event.episodeId === episodeId) void refreshQueue();
    }

    function onDisconnect() {
      queueVersion++;
      joinVersion++;
      setState(EMPTY);
    }

    // Re-join presence after any (re)connect — the server drops room
    // membership on disconnect, so a reconnect (e.g. triggered by an auth
    // handshake cycle elsewhere) must re-emit `listening:join` or the
    // listener silently falls out of the live count until a full reload.
    async function joinPresence(target: string) {
      const version = ++joinVersion;
      const identity = await getEpisodeBrowserIdentity(target);
      const isCurrent = () => !cancelled && version === joinVersion && !!socket?.connected && prevEpisodeId.current === target;
      if (socket && isCurrent()) {
        joinPresenceWithSnapshot(socket, listeningJoinPayload(target, identity), isCurrent, () => { void refreshQueue(); });
      }
    }

    function onConnect() {
      if (prevEpisodeId.current) {
        void joinPresence(prevEpisodeId.current);
      }
    }

    acquireSocket()
      .then((nextLease) => {
        if (cancelled) {
          nextLease.release();
          return;
        }
        lease = nextLease;
        socket = nextLease.socket;
        const s = nextLease.socket;

        s.on("stream:status", onStreamStatus);
        s.on("queue:up-next", onQueueUpNext);
        s.on("queue:changed", onQueueChanged);
        s.on("connect", onConnect);
        s.on("disconnect", onDisconnect);

        prevEpisodeId.current = transition.nextPrevEpisodeId;
        if (s.connected) {
          if (transition.leave) {
            s.emit("listening:leave", { episodeId: transition.leave });
          }
          if (transition.join) {
            void joinPresence(transition.join);
          }
        }
      })
      .catch(() => {
        if (!cancelled) onDisconnect();
      });

    return () => {
      cancelled = true;
      if (socket) {
        if (prevEpisodeId.current) {
          socket.emit("listening:leave", { episodeId: prevEpisodeId.current });
        }
        socket.off("stream:status", onStreamStatus);
        socket.off("queue:up-next", onQueueUpNext);
        socket.off("queue:changed", onQueueChanged);
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
      }
      prevEpisodeId.current = null;
      lease?.release();
    };
  }, [episodeId, active]);

  return state;
}
