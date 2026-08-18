"use client";

/**
 * Music attribution — the CC-BY credits the station's licensing position
 * obliges it to publish.
 *
 * The station plays clean-source music only (v2.7 L26): Creative Commons,
 * public domain, royalty-free, or original student work. Of those, only CC
 * licences oblige a visible credit, so only those appear here — the API filters
 * to them, and the internal clearance evidence never leaves the moderator side.
 *
 * No design basis; follows the public-page conventions.
 */
import { useGetMusicAttribution } from "@/lib/api/endpoints/music-sources/music-sources";
import type { MusicAttributionDto } from "@/lib/api/model";
import { PublicEmpty, PublicGenericError } from "@/components/public/public-states";

export function AttributionClient() {
  const query = useGetMusicAttribution<MusicAttributionDto[]>({ query: { retry: false } });

  return (
    <div className="pb-16">
      <section className="wc-container py-6 md:py-8">
        <h1 className="text-2xl font-extrabold">Music credits</h1>
        {/* Deliberately "registered", not "plays". The registry is not linked
            to playout — nothing joins a track to an episode — so this list is
            complete only insofar as staff have recorded each track. Claiming
            the stronger thing would be asserting a control the system does not
            have, on the page whose job is to be accurate about licensing. */}
        <p className="wc-muted">
          Wildcat Radio&apos;s policy is to play clean-source music only. Tracks the station has
          registered under a Creative Commons licence are credited here, as those licences require.
        </p>
      </section>

      <section className="wc-container pb-10">
        {query.isLoading ? (
          <p className="wc-muted">Loading credits…</p>
        ) : query.isError ? (
          <PublicGenericError message="Couldn't load the credits." />
        ) : (query.data ?? []).length === 0 ? (
          <PublicEmpty message="No Creative Commons tracks have been registered yet." />
        ) : (
          <ul className="wc-card divide-y" data-testid="attribution-list">
            {(query.data ?? []).map((credit, i) => (
              <li key={`${credit.title}-${i}`} className="wc-card-pad">
                <p className="font-bold">{credit.title}</p>
                {credit.artist && <p className="wc-muted text-sm">{credit.artist}</p>}
                <p className="wc-help mt-1">{credit.attribution}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
