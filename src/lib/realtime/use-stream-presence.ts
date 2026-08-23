"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { GetStreamManifest200Reason } from "@/lib/api/model";
import { acquireSocket, type SocketLease } from "./socket";
import { computePresenceTransition } from "./presence-actions";

interface StreamStatusEvent {
  episodeId: string | null;
  status: "LIVE" | "STATION_ROTATION" | "OFF_AIR";
  reason: GetStreamManifest200Reason;
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
  socketEpisodeId: string | null | undefined;
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
    socketEpisodeId: undefined,
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
      prevEpisodeId.current = transition.nextPrevEpisodeId;
      setState({ listeners: null, socketStatus: null, socketEpisodeId: undefined, upNext: null });
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    let lease: SocketLease<Socket> | null = null;

    // Never render presence-derived state from a previous episode while the
    // new room is joining.
    setState({ listeners: null, socketStatus: null, socketEpisodeId: undefined, upNext: null });

    function onStreamStatus(event: StreamStatusEvent) {
      if (episodeId && event.episodeId && event.episodeId !== episodeId) return;
      setState((prev) => ({
        ...prev,
        listeners: event.listeners,
        socketStatus: event.status,
        socketEpisodeId: event.episodeId,
      }));
    }

    function onQueueUpNext(event: UpNextPeek) {
      setState((prev) => ({ ...prev, upNext: event }));
    }

    function onDisconnect() {
      setState({
        listeners: null,
        socketStatus: null,
        socketEpisodeId: undefined,
        upNext: null,
      });
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
        s.on("connect", onConnect);
        s.on("disconnect", onDisconnect);

        prevEpisodeId.current = transition.nextPrevEpisodeId;
        if (s.connected) {
          if (transition.leave) {
            s.emit("listening:leave", { episodeId: transition.leave });
          }
          if (transition.join) {
            s.emit("listening:join", { episodeId: transition.join });
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
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
      }
      prevEpisodeId.current = null;
      lease?.release();
    };
  }, [episodeId, active]);

  return state;
}
