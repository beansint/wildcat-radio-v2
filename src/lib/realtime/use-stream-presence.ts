"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "./socket";

interface StreamStatusEvent {
  episodeId: string | null;
  status: "LIVE" | "STATION_ROTATION" | "OFF_AIR";
  listeners: number;
}

interface PresenceState {
  listeners: number | null;
  socketStatus: "LIVE" | "STATION_ROTATION" | "OFF_AIR" | null;
}

/**
 * Joins the Socket.IO presence room while `active && episodeId` is truthy.
 * Listens for `stream:status` events to surface live listener counts.
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
  });

  // Track previous episodeId so we can leave the old room
  const prevEpisodeId = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    // Handler for live status broadcasts
    function onStreamStatus(event: StreamStatusEvent) {
      setState({
        listeners: event.listeners,
        socketStatus: event.status,
      });
    }

    socket.on("stream:status", onStreamStatus);

    // Re-join presence after any (re)connect — the server drops room
    // membership on disconnect, so a reconnect (e.g. triggered by an auth
    // handshake cycle elsewhere) must re-emit `listening:join` or the
    // listener silently falls out of the live count until a full reload.
    function onConnect() {
      if (active && prevEpisodeId.current) {
        socket.emit("listening:join", { episodeId: prevEpisodeId.current });
      }
    }
    socket.on("connect", onConnect);

    // Join / leave presence
    if (active && episodeId) {
      if (prevEpisodeId.current && prevEpisodeId.current !== episodeId) {
        socket.emit("listening:leave", { episodeId: prevEpisodeId.current });
      }
      socket.emit("listening:join", { episodeId });
      prevEpisodeId.current = episodeId;
    } else if (!active && prevEpisodeId.current) {
      socket.emit("listening:leave", { episodeId: prevEpisodeId.current });
      prevEpisodeId.current = null;
    }

    return () => {
      socket.off("stream:status", onStreamStatus);
      socket.off("connect", onConnect);
    };
  }, [episodeId, active]);

  // Leave on unmount
  useEffect(() => {
    return () => {
      if (prevEpisodeId.current) {
        const socket = getSocket();
        socket.emit("listening:leave", { episodeId: prevEpisodeId.current });
        prevEpisodeId.current = null;
      }
    };
  }, []);

  return state;
}
