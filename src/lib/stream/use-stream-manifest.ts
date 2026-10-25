"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetStreamManifest, getGetStreamManifestQueryKey, getStreamManifest } from "@/lib/api/endpoints/stream/stream";
import type { GetStreamManifest200 } from "@/lib/api/model";
import { acquireSocket, type SocketLease } from "@/lib/realtime/socket";
import type { Socket } from "socket.io-client";
import { MANIFEST_POLL_RETRIES, manifestRetryDelay } from "./manifest-health";

/** A partial status event cannot establish playback metadata or freshness. */
function isManifest(value: unknown): value is GetStreamManifest200 {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return ["LIVE", "OFF_AIR", "STATION_ROTATION"].includes(String(data.status))
    && data.type === "hls" && Array.isArray(data.dj) && data.dj.every(dj => typeof dj === "string")
    && ["url", "episodeId", "showId", "showName", "reason", "autoEndsAt"].every(key => data[key] === null || typeof data[key] === "string");
}

export function useStreamManifest() {
  const client = useQueryClient();
  const observation = useSyncExternalStore(
    useCallback(notify => client.getQueryCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "success"
        && JSON.stringify(event.query.queryKey) === JSON.stringify(getGetStreamManifestQueryKey())) notify();
    }), [client]),
    useCallback(() => client.getQueryState(getGetStreamManifestQueryKey())?.dataUpdateCount ?? 0, [client]),
    () => 0,
  );
  const query = useGetStreamManifest({query: {
    queryFn: ({signal}) => getStreamManifest({signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)])}),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    retry: MANIFEST_POLL_RETRIES,
    retryDelay: manifestRetryDelay,
  }});
  useEffect(() => {
    const queryKey = getGetStreamManifestQueryKey();
    let disposed = false;
    let lease: SocketLease<Socket> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let version = 0;
    let attempt = 0;
    let reading = false;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, delay);
    };
    async function refresh() {
      if (disposed || reading) return;
      reading = true;
      const started = version;
      try {
        await client.refetchQueries({queryKey, exact: true}, {cancelRefetch: false});
      } finally {
        reading = false;
        if (!disposed && started === version) {
          // One request sequence at a time, 15 → 30 → 60 s while degraded.
          schedule(Math.min(15_000 * 2 ** Math.min(attempt++, 2), 60_000) * (0.8 + Math.random() * 0.4));
        }
      }
    }
    const onManifest = (data: unknown) => {
      if (disposed || !isManifest(data)) return;
      version++;
      attempt = 0;
      // Cancellation synchronously detaches the old query promise, including
      // transports that finish after abort. A later HTTP result cannot win.
      void client.cancelQueries({queryKey, exact: true});
      client.setQueryData(queryKey, data);
      schedule(30_000 + Math.random() * 3_000);
    };
    const resume = () => { if (!document.hidden) void refresh(); };
    const disconnected = () => { attempt = 0; schedule(1_000 + Math.random() * 1_000); };
    schedule(30_000 + Math.random() * 3_000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    void acquireSocket().then(next => {
      if (disposed) { next.release(); return; }
      lease = next;
      next.socket.on("stream:manifest", onManifest);
      next.socket.on("connect", resume);
      next.socket.on("disconnect", disconnected);
      if (next.socket.connected) resume();
    }).catch(disconnected);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      lease?.socket.off("stream:manifest", onManifest);
      lease?.socket.off("connect", resume);
      lease?.socket.off("disconnect", disconnected);
      lease?.release();
    };
  }, [client]);
  return {...query, observation};
}
