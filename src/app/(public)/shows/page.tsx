"use client";

/**
 * Public `/shows` — every show, ordered by name (server order, PUB-C-05).
 * `ShowPublicListItemDto` has no roster ref, so the prototype's "DJ Mara ·
 * DJ Cha" subline is dropped here (see feature report) — the full roster
 * only exists on the per-show detail DTO.
 */
import Link from "next/link";
import Image from "next/image";
import { Mic2 } from "lucide-react";
import { useListShowsPublic } from "@/lib/api/endpoints/shows-public/shows-public";
import { classifyQueryError, filterAllowedPhotoUrls } from "@/lib/content/format";
import { coverClassFor, initialsFor } from "@/lib/content/cover";
import { PublicEmpty, PublicGenericError, PublicRateLimited } from "@/components/public/public-states";

export default function ShowsPage() {
  const query = useListShowsPublic({ query: { retry: false } });
  const shows = query.data ?? [];
  const err = query.isError ? classifyQueryError(query.error) : null;

  return (
    <div className="pb-16">
      <section className="wc-container py-6 md:py-8">
        <div className="mb-1 flex items-center gap-2">
          <Mic2 className="h-5 w-5 text-maroon" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">Shows</h1>
        </div>
        <p className="wc-muted">
          Every Wildcat Radio program, hosted by your favorite campus DJs. Browse the{" "}
          <Link href="/djs" className="text-maroon font-semibold">
            DJs
          </Link>
          .
        </p>
      </section>

      <section className="wc-container pb-10">
        {query.isLoading ? (
          <p className="wc-muted">Loading shows…</p>
        ) : err?.rateLimited ? (
          <PublicRateLimited onRetry={() => query.refetch()} />
        ) : err ? (
          <PublicGenericError message={err.message} />
        ) : shows.length === 0 ? (
          <PublicEmpty message="No shows listed yet — check back soon." />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="public-shows-list">
            {shows.map((show) => {
              const photos = filterAllowedPhotoUrls(show.coverImage ? [show.coverImage] : []);
              return (
                <Link
                  key={show.id}
                  href={`/shows/${show.slug}`}
                  className="wc-card wc-card-i hover:shadow-lg transition-shadow"
                  data-testid="public-show-card"
                >
                  {photos[0] ? (
                    <Image
                      src={photos[0]}
                      alt=""
                      width={300}
                      height={300}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className={`wc-cover ${coverClassFor(show.id)} aspect-square`}>
                      <span className="init">{initialsFor(show.name)}</span>
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-bold truncate">{show.name}</div>
                    {show.description ? (
                      <p className="text-xs wc-muted mt-1 line-clamp-2">{show.description}</p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
