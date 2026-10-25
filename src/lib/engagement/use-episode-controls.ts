"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { acquireSocket, type SocketLease } from "@/lib/realtime/socket";
import type { Socket } from "socket.io-client";
import { getEngagementControls, type EngagementControls } from "./api";

export const controlsQueryKey = (episodeId: string | null) => ["engagement-controls", episodeId] as const;

export function useEpisodeControls(episodeId: string | null) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: controlsQueryKey(episodeId),
    queryFn: ({signal}) => getEngagementControls(episodeId!, {signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)])}),
    enabled: !!episodeId,
  });
  useEffect(() => {
    if (!episodeId) return;
    let disposed = false;
    let lease: SocketLease<Socket> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const refresh = () => {
      if (disposed) return;
      void client.invalidateQueries({ queryKey: controlsQueryKey(episodeId) }).then(() => {
        if (!disposed && client.getQueryState(controlsQueryKey(episodeId))?.status === "error") fallback();
      });
    };
    const fallback = () => {
      clearTimeout(timer);
      if (disposed) return;
      timer = setTimeout(async () => {
        if (disposed || (lease?.socket.connected && client.getQueryState(controlsQueryKey(episodeId))?.status === "success")) return;
        await client.refetchQueries({queryKey: controlsQueryKey(episodeId)});
        if (!disposed && (!lease?.socket.connected || client.getQueryState(controlsQueryKey(episodeId))?.status === "error")) fallback();
      }, Math.min(15_000 * 2 ** Math.min(attempt++, 2), 60_000) * (0.8 + Math.random() * 0.4));
    };
    const connected = () => { clearTimeout(timer); attempt = 0; refresh(); };
    const onControls = (event: EngagementControls) => {
      if (event.episodeId !== episodeId) return;
      // Events may arrive out of commit order across episode end/resume.
      // Cancel older reads and recover persisted flags instead of trusting
      // an unversioned event as the final authority.
      void client.cancelQueries({ queryKey: controlsQueryKey(episodeId) }).then(() => {
        if (!disposed) refresh();
      });
    };
    void acquireSocket().then(next => {
      if (disposed) { next.release(); return; }
      lease = next;
      next.socket.on("engagement:controls", onControls);
      next.socket.on("connect", connected);
      next.socket.on("disconnect", fallback);
      if (next.socket.connected) connected(); else fallback();
    }).catch(fallback);
    return () => {
      disposed = true;
      clearTimeout(timer);
      lease?.socket.off("engagement:controls", onControls);
      lease?.socket.off("connect", connected);
      lease?.socket.off("disconnect", fallback);
      lease?.release();
    };
  }, [episodeId, client]);
  return query;
}
