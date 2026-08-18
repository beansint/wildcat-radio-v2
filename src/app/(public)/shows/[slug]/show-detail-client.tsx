"use client";

/**
 * Public `/shows/[slug]` — show detail + upcoming/recent episodes + lineup.
 * An unknown slug 404s at both `GET /api/shows/:slug` and its `/episodes`
 * route (PUB-C-04) — rendered as the shared not-found state, with the
 * episode sections absent entirely (PUB-E-05).
 *
 * The prototype's inline "Hosted by X & Y" byline above the description
 * duplicates DJ name(s) that also appear in the Lineup grid below — that
 * used to be a reason to drop the byline entirely (it broke the qa-plan's
 * `getByText(displayName)` assertion in PUB-E-03 with a strict-mode
 * violation). That traded a real product surface for test convenience; the
 * byline is the only path from a show straight to its host's profile
 * without scrolling to Lineup, and it's what actually restores a "path to
 * the broadcast." The fix belongs in the locator, not the page — PUB-E-03
 * now scopes its assertion to the Lineup section specifically (see
 * `e2e/public-content.spec.ts`).
 */
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, CalendarDays, Clock, Play, MessageCircle } from "lucide-react";
import { useGetShowEpisodes, useGetShowPublic } from "@/lib/api/endpoints/shows-public/shows-public";
import { classifyQueryError, filterAllowedPhotoUrls } from "@/lib/content/format";
import { formatDateTime } from "@/components/standing/format";
import { coverClassFor, initialsFor, monoClassFor } from "@/lib/content/cover";
import { episodeTitleLabel, formatEpisodeStats, isShowCurrentlyLive } from "@/lib/content/live";
import { PublicEmpty, PublicGenericError, PublicNotFound, PublicRateLimited } from "@/components/public/public-states";
import { Button } from "@/components/ui/button";
import { useStream } from "@/lib/stream/stream-context";

export function ShowDetailClient() {
  const { slug } = useParams<{ slug: string }>();
  const showQuery = useGetShowPublic(slug, { query: { retry: false } });
  const episodesQuery = useGetShowEpisodes(slug, {
    query: { retry: false, enabled: Boolean(showQuery.data) },
  });
  const stream = useStream();

  if (showQuery.isLoading) {
    return <p className="wc-container py-10 wc-muted">Loading show…</p>;
  }

  if (showQuery.isError) {
    const err = classifyQueryError(showQuery.error);
    if (err.notFound) {
      return (
        <PublicNotFound
          heading="Show not found"
          message="This show doesn't exist, or isn't listed anymore."
        />
      );
    }
    if (err.rateLimited) {
      return (
        <div className="wc-container py-10">
          <PublicRateLimited onRetry={() => showQuery.refetch()} />
        </div>
      );
    }
    return (
      <div className="wc-container py-10">
        <PublicGenericError message={err.message} />
      </div>
    );
  }

  const show = showQuery.data!;
  const photos = filterAllowedPhotoUrls(show.coverImage ? [show.coverImage] : []);
  const isLive = isShowCurrentlyLive(
    stream.status,
    stream.djs,
    show.roster.map((entry) => entry.displayName),
  );
  const episodes = episodesQuery.data;
  const episodesErr = episodesQuery.isError ? classifyQueryError(episodesQuery.error) : null;
  // The episodes query is gated on the show query resolving first, so for a
  // whole extra round trip `episodes` is undefined. Rendering the empty state
  // then asserts "no episodes" before we know — a claim that flips to a full
  // list a moment later. Wait for the answer instead of guessing it.
  const episodesPending = !episodesErr && !episodes;

  return (
    <main className="pb-16">
      <div className="wc-container pt-4">
        <Link
          href="/shows"
          className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          All shows
        </Link>
      </div>

      <section className="wc-container py-4">
        <div className="grid md:grid-cols-[260px_1fr] gap-5 items-start">
          {photos[0] ? (
            <Image
              src={photos[0]}
              alt=""
              width={260}
              height={260}
              className="rounded-2xl w-full max-w-[260px] aspect-square object-cover"
            />
          ) : (
            <div className={`wc-cover ${coverClassFor(show.id)} aspect-square rounded-2xl w-full max-w-[260px]`}>
              <span className="init">{initialsFor(show.name)}</span>
            </div>
          )}
          <div>
            {isLive ? (
              <span className="wc-badge-live mb-2">
                <span className="dot" />
                Live now
              </span>
            ) : null}
            <h1 className="text-3xl font-extrabold mb-1">{show.name}</h1>
            {show.roster.length > 0 ? (
              <p className="wc-muted mb-2">
                Hosted by{" "}
                {show.roster.map((entry, i) => (
                  <span key={entry.id}>
                    {i > 0 ? (i === show.roster.length - 1 ? " & " : ", ") : null}
                    <Link href={`/djs/${entry.id}`} className="text-maroon font-semibold">
                      {entry.displayName}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
            {show.cadenceLabel || show.airtimeLabel ? (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {show.cadenceLabel ? (
                  <span className="wc-chip-ghost">
                    <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                    {show.cadenceLabel}
                  </span>
                ) : null}
                {show.airtimeLabel ? (
                  <span className="wc-chip-ghost tnum">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    {show.airtimeLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
            {show.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {show.tags.map((tag) => (
                  <span key={tag} className="wc-chip-ghost">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {show.description ? <p className="max-w-prose">{show.description}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/listen">
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Listen live
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/listen">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Join the chat
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="wc-container py-4">
        <h2 className="text-lg font-extrabold mb-3">Upcoming</h2>
        {episodesErr ? (
          <PublicGenericError message={episodesErr.message} />
        ) : episodesPending ? (
          <p className="wc-muted">Loading episodes…</p>
        ) : episodes!.upcoming.length === 0 ? (
          <PublicEmpty message="No upcoming episodes scheduled." />
        ) : (
          <div className="grid sm:grid-cols-3 gap-3" data-testid="public-show-episodes-upcoming">
            {episodes!.upcoming.map((episode) => (
              <div key={episode.id} className="wc-card wc-card-pad">
                <div className="font-bold">
                  {episode.scheduledFor ? formatDateTime(episode.scheduledFor) : "TBA"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="wc-container py-4">
        <h2 className="text-lg font-extrabold mb-3">Recent episodes</h2>
        {episodesPending ? (
          <p className="wc-muted">Loading episodes…</p>
        ) : !episodesErr && episodes && episodes.recent.length > 0 ? (
          <div className="wc-card divide-y" data-testid="public-show-episodes-recent">
            {episodes.recent.map((episode) => {
              const dateLabel = episode.startedAt ? formatDateTime(episode.startedAt) : "—";
              const stats = formatEpisodeStats(episode.peakListeners, episode.requestCount);
              return (
                <div key={episode.id} className="wc-card-pad flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{episodeTitleLabel(episode.title, dateLabel)}</div>
                    {episode.title ? <div className="text-sm wc-muted">{dateLabel}</div> : null}
                  </div>
                  {stats ? (
                    <div className="text-sm wc-muted text-right flex-none">{stats}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : !episodesErr ? (
          <PublicEmpty message="No past episodes yet." />
        ) : null}
      </section>

      <section className="wc-container py-4 pb-10">
        <h2 className="text-lg font-extrabold mb-3">Lineup</h2>
        {show.roster.length === 0 ? (
          <PublicEmpty message="No DJs assigned to this show yet." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="public-show-lineup">
            {show.roster.map((entry) => {
              const rosterPhotos = filterAllowedPhotoUrls(entry.photoUrl ? [entry.photoUrl] : []);
              return (
                <Link
                  key={entry.id}
                  href={`/djs/${entry.id}`}
                  className="wc-card wc-card-i wc-card-pad flex flex-col items-center text-center gap-2 hover:shadow-lg transition-shadow"
                >
                  {rosterPhotos[0] ? (
                    <Image
                      src={rosterPhotos[0]}
                      alt=""
                      width={64}
                      height={64}
                      className="rounded-full h-16 w-16 object-cover"
                    />
                  ) : (
                    <div className={`wc-mono ${monoClassFor(entry.id)} h-16 w-16 text-lg`}>
                      {initialsFor(entry.displayName).slice(0, 1)}
                    </div>
                  )}
                  <div className="font-bold">{entry.displayName}</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
