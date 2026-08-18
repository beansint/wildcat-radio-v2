"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { disconnectSocket, getExistingSocket, getSocket } from "./socket";
import { computePresenceTransition } from "./presence-actions";

interface StreamStatusEvent {
  episodeId: string | null;
  status: "LIVE" | "STATION_ROTATION" | "OFF_AIR";
  listeners: number;
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
  /**
   * The most recent queue item, for the global player's "up next" peek.
   *
   * Deliberately sourced from the socket that presence has ALREADY opened
   * rather than from a fetch: there is no REST endpoint for the queue, so the
   * only alternative would be opening a WebSocket on every route — precisely
   * the regression FE#40 fixed. The consequence is that "up next" appears
   * while you are listening and is simply absent when you are not, which is
   * the honest trade rather than a gap.
   */
  upNext: UpNextPeek | null;
}

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
  const [state, setState] = useState<PresenceState>({
    listeners: null,
    socketStatus: null,
    upNext: null,
  });

  // Track previous episodeId so we can leave the old room
  const prevEpisodeId = useRef<string | null>(null);

  useEffect(() => {
    const transition = computePresenceTransition({
      active,
      episodeId,
      prevEpisodeId: prevEpisodeId.current,
    });

    if (!transition.shouldConnect) {
      // Not listening: leave through the existing connection (if any) and
      // tear it down. Never create a connection just to say goodbye.
      const existing = getExistingSocket();
      if (existing && transition.leave) {
        existing.emit("listening:leave", { episodeId: transition.leave });
      }
      prevEpisodeId.current = transition.nextPrevEpisodeId;
      // Drop the peek with the connection — showing a queue item from a
      // broadcast you are no longer listening to would go stale silently.
      setState((prev) => (prev.upNext ? { ...prev, upNext: null } : prev));
      disconnectSocket();
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;

    function onStreamStatus(event: StreamStatusEvent) {
      setState((prev) => ({
        ...prev,
        listeners: event.listeners,
        socketStatus: event.status,
      }));
    }

    function onQueueUpNext(event: UpNextPeek) {
      setState((prev) => ({ ...prev, upNext: event }));
    }

    // Re-join presence after any (re)connect — the server drops room
    // membership on disconnect, so a reconnect (e.g. triggered by an auth
    // handshake cycle elsewhere) must re-emit `listening:join` or the
    // listener silently falls out of the live count until a full reload.
    function onConnect() {
      if (prevEpisodeId.current) {
        socket?.emit("listening:join", { episodeId: prevEpisodeId.current });
      }
    }

    getSocket().then((s) => {
      if (cancelled) return;
      socket = s;

      s.on("stream:status", onStreamStatus);
      s.on("queue:up-next", onQueueUpNext);
      s.on("connect", onConnect);

      if (transition.leave) {
        s.emit("listening:leave", { episodeId: transition.leave });
      }
      if (transition.join) {
        s.emit("listening:join", { episodeId: transition.join });
      }
      prevEpisodeId.current = transition.nextPrevEpisodeId;
    });

    return () => {
      cancelled = true;
      if (socket) {
        socket.off("stream:status", onStreamStatus);
        socket.off("queue:up-next", onQueueUpNext);
        socket.off("connect", onConnect);
      }
    };
  }, [episodeId, active]);

  // Leave on unmount — say goodbye through the existing connection only;
  // getExistingSocket() never creates one, so an unmount that never
  // connected (e.g. the listener never pressed play) is a no-op.
  useEffect(() => {
    return () => {
      if (prevEpisodeId.current) {
        const socket = getExistingSocket();
        socket?.emit("listening:leave", { episodeId: prevEpisodeId.current });
        prevEpisodeId.current = null;
      }
    };
  }, []);

  return state;
}
