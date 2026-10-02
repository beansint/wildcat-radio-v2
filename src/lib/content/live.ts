/**
 * "Is THIS show on air?" (#106 / FE#84).
 *
 * True only with broadcast evidence for this exact show: the stream is
 * `LIVE` **and** the manifest's `showId` (the active episode's show) is this
 * show. Replaces the old DJ-name overlap guess, which over-reported whenever
 * two shows shared a DJ and ignored whether the schedule said anything.
 */
export function isShowOnAir(
  streamStatus: string,
  liveShowId: string | null | undefined,
  showId: string | null | undefined,
): boolean {
  return streamStatus === "LIVE" && !!liveShowId && !!showId && liveShowId === showId;
}

/**
 * Recent-episode stat line (FE#44) — `peakListeners`/`requestCount` are only
 * ever populated for ENDED episodes; render nothing for the fields that are
 * still null rather than showing "0".
 */
export function formatEpisodeStats(
  peakListeners: number | null,
  requestCount: number | null,
): string | null {
  const parts: string[] = [];
  if (peakListeners != null) {
    parts.push(`${peakListeners} peak listener${peakListeners === 1 ? "" : "s"}`);
  }
  if (requestCount != null) {
    parts.push(`${requestCount} request${requestCount === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Episode card title (FE#44) — falls back to a formatted date when `title` is null. */
export function episodeTitleLabel(
  title: string | null,
  fallbackDateLabel: string,
): string {
  return title ?? fallbackDateLabel;
}
