"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMySubmissions } from "./api";

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
    queryFn: () => getMySubmissions(historyEpisodeId!),
    enabled: !!historyEpisodeId && !!authKey,
    // Quiet refresh includes private CLOSED outcomes without negative receipts.
    refetchInterval: episodeId ? 10_000 : false,
  });
  useEffect(() => {
    const ended = lastActiveEpisode.current;
    lastActiveEpisode.current = episodeId;
    // Ending silently expires pending items. The remembered episode keeps
    // the same query key, so stopping polling alone would retain Pending.
    if (ended && !episodeId && authKey) {
      void client.invalidateQueries({ queryKey: ["my-submissions", ended] });
    }
  }, [episodeId, authKey, client]);
  return { ...query, historyEpisodeId };
}
