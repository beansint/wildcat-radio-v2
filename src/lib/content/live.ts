/**
 * Public show-detail "Live now" derivation (FE#44).
 *
 * The stream manifest (`GET /api/stream/manifest`, consumed via
 * `useStream()`) reports overall station status plus the *display names* of
 * DJs currently timed in (`dj[]` — "online DJ display names" per the
 * backend's `StreamController.getManifest` doc comment). It does **not**
 * report which show — or even which episode's show — is airing; `episodeId`
 * identifies the open `Episode` row, but that row's `showId` is nullable
 * (unscheduled episodes have none) and isn't exposed on the manifest at all.
 *
 * So a show detail page can't ask "is *my* show live" directly. The closest
 * real signal available is: the station is `LIVE`, and at least one of the
 * currently timed-in DJ names matches a name on this show's roster. That's
 * an approximation — it would over-report if two shows share a DJ and that
 * DJ is timed in for the *other* show — but it's the only correlation the
 * manifest contract currently supports, and it degrades safely to "not
 * live" whenever the station is off air or nobody's timed in.
 */
export function isShowCurrentlyLive(
  streamStatus: string,
  liveDjNames: readonly string[],
  showRosterNames: readonly string[],
): boolean {
  if (streamStatus !== "LIVE") return false;
  if (liveDjNames.length === 0 || showRosterNames.length === 0) return false;
  const live = new Set(liveDjNames);
  return showRosterNames.some((name) => live.has(name));
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
