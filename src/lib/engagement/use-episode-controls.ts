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
    queryFn: () => getEngagementControls(episodeId!),
    enabled: !!episodeId,
    refetchInterval: 15_000,
  });
  useEffect(() => {
    if (!episodeId) return;
    let disposed = false;
    let lease: SocketLease<Socket> | undefined;
    const refresh = () => { void client.invalidateQueries({ queryKey: controlsQueryKey(episodeId) }); };
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
      next.socket.on("connect", refresh);
    }).catch(() => { /* HTTP polling recovers an unavailable socket. */ });
    return () => {
      disposed = true;
      lease?.socket.off("engagement:controls", onControls);
      lease?.socket.off("connect", refresh);
      lease?.release();
    };
  }, [episodeId, client]);
  return query;
}
