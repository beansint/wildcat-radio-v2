export const STATION_HANDOFF_KEY = "station_handoff";

import { customFetch } from "@/lib/api/fetcher";

export interface StationHandoffResponse {
  ok: boolean;
  expiresAt: number;
}

type HandoffRequest = <T>(url: string, options?: RequestInit) => Promise<T>;

/** Read the opaque handoff from a URL fragment; query strings are deliberately ignored. */
export function readStationHandoff(hash: string): string | null {
  if (!hash.startsWith("#")) return null;
  const value = new URLSearchParams(hash.slice(1)).get(STATION_HANDOFF_KEY)?.trim();
  return value || null;
}

/** Remove the handoff before any render, referrer, or history navigation can retain it. */
export function clearStationHandoff(
  location: Pick<Location, "pathname" | "search" | "hash">,
  replaceState: History["replaceState"],
): void {
  replaceState(null, "", `${location.pathname}${location.search}`);
}

/** Exchange the opaque browser handoff for the httpOnly station cookie. */
export function consumeStationHandoff(
  handoff: string,
  request: HandoffRequest = customFetch,
): Promise<StationHandoffResponse> {
  const value = handoff.trim();
  if (!value) return Promise.reject(new Error("Station handoff is empty."));
  return request<StationHandoffResponse>("/api/studio/handoff/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoff: value }),
  });
}
