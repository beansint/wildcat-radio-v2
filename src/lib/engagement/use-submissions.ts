"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMySubmissions } from "./api";
import { acquireSocket, hasPrivateAdmission, type SocketLease } from "@/lib/realtime/socket";
import type { Socket } from "socket.io-client";

export function useSubmissions(episodeId: string | null, userId: string | undefined, authKey: string | null) {
  const client = useQueryClient();
  const lastActiveEpisode = useRef(episodeId);
  const [remembered, setRemembered] = useState<{ userId: string; episodeId: string } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    const key = `wc:last-submissions-episode:${userId}`;
    let saved = episodeId;
    try {
      if (episodeId) localStorage.setItem(key, episodeId);
      else saved = localStorage.getItem(key);
    } catch { /* History still works in this visit when storage is unavailable. */ }
    if (saved) {
      const target = saved;
      void Promise.resolve().then(() => { if (!disposed) setRemembered({ userId, episodeId: target }); });
    }
    return () => { disposed = true; };
  }, [episodeId, userId]);
  const historyEpisodeId = episodeId ?? (remembered && remembered.userId === userId ? remembered.episodeId : null);
  const query = useQuery({
    queryKey: ["my-submissions", historyEpisodeId, authKey],
    queryFn: ({signal}) => getMySubmissions(historyEpisodeId!, {signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)])}),
    enabled: !!historyEpisodeId && !!authKey && !!userId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!historyEpisodeId || !authKey || !userId) return;
    const queryKey = ["my-submissions", historyEpisodeId, authKey];
    let disposed = false;
    let lease: SocketLease<Socket> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let admitted = false;
    const liveHistory = episodeId === historyEpisodeId;
    const failed = () => client.getQueryState(queryKey)?.status === "error";
    const recover = () => {
      clearTimeout(timer);
      if (disposed || !liveHistory) return;
      timer = setTimeout(async () => {
        if (disposed || (lease?.socket.connected && admitted && !failed())) return;
        await client.refetchQueries({queryKey, exact:true});
        if (!disposed && (!lease?.socket.connected || !admitted || failed())) recover();
      }, Math.min(15_000 * 2 ** Math.min(attempt++, 2), 60_000) * (0.8 + Math.random() * 0.4));
    };
    const refresh = () => {
      if (disposed) return;
      void client.invalidateQueries({queryKey, exact:true}).then(() => {
        if (!disposed && (!admitted || failed())) recover();
      });
    };
    const connected = () => {
      admitted = !!lease && hasPrivateAdmission(lease.socket);
      clearTimeout(timer); attempt = 0; refresh();
    };
    const disconnected = () => { admitted = false; recover(); };
    const resume = () => { if (!document.hidden) refresh(); };
    const changed = (event: {episodeId: string | null}) => {
      if (disposed || (event?.episodeId !== null && typeof event?.episodeId !== "string")) return;
      // The backend sends this only after user-room admission/revalidation.
      // A connected transport alone never proves private event delivery.
      admitted = true;
      clearTimeout(timer);
      attempt = 0;
      if (event.episodeId !== null && event.episodeId !== historyEpisodeId) { if (failed()) recover(); return; }
      // Quiet, complete persisted history includes CLOSED and opt-out actions;
      // it never manufactures a receipt or toast from an invalidation.
      void client.cancelQueries({queryKey, exact:true}).then(() => { if (!disposed) refresh(); });
    };
    window.addEventListener("focus", resume);
    void acquireSocket().then(next => {
      if (disposed) {next.release(); return;}
      lease = next;
      next.socket.on("queue:mine-changed", changed);
      next.socket.on("connect", connected);
      next.socket.on("disconnect", disconnected);
      if (next.socket.connected) connected(); else recover();
    }).catch(recover);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      lease?.socket.off("queue:mine-changed", changed);
      lease?.socket.off("connect", connected);
      lease?.socket.off("disconnect", disconnected);
      lease?.release();
      void client.cancelQueries({queryKey, exact:true});
    };
  }, [episodeId, historyEpisodeId, authKey, userId, client]);
  useEffect(() => {
    const ended = lastActiveEpisode.current;
    lastActiveEpisode.current = episodeId;
    // Ending silently expires pending items. The remembered episode keeps
    // the same query key, so recover the terminal persisted state explicitly.
    if (ended && !episodeId && authKey) {
      void client.invalidateQueries({ queryKey: ["my-submissions", ended] });
    }
  }, [episodeId, authKey, client]);
  return { ...query, historyEpisodeId };
}
