"use client";

/**
 * Public `/djs/[id]` — a DJ's public profile. An inactive DJ id 404s
 * directly at `GET /api/djs/:id` (no distinct "hidden" state) — rendered as
 * the shared not-found state, with no name leak (PUB-E-04).
 */
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { useGetDjPublic } from "@/lib/api/endpoints/djs-public/djs-public";
import { classifyQueryError, filterAllowedPhotoUrls } from "@/lib/content/format";
import { initialsFor, monoClassFor } from "@/lib/content/cover";
import { PublicEmpty, PublicGenericError, PublicNotFound, PublicRateLimited } from "@/components/public/public-states";

export default function DjProfilePage() {
  const { id } = useParams<{ id: string }>();
  const query = useGetDjPublic(id, { query: { retry: false } });

  if (query.isLoading) {
    return <p className="wc-container py-10 wc-muted">Loading DJ profile…</p>;
  }

  if (query.isError) {
    const err = classifyQueryError(query.error);
    if (err.notFound) {
      return (
        <PublicNotFound
          heading="DJ not found"
          message="This DJ profile doesn't exist, or isn't active anymore."
        />
      );
    }
    if (err.rateLimited) {
      return (
        <div className="wc-container py-10">
          <PublicRateLimited onRetry={() => query.refetch()} />
        </div>
      );
    }
    return (
      <div className="wc-container py-10">
        <PublicGenericError message={err.message} />
      </div>
    );
  }

  const dj = query.data!;
  const photos = filterAllowedPhotoUrls(dj.photoUrl ? [dj.photoUrl] : []);

  return (
    // `wc-container` and `max-w-*` must NOT share an element: both set
    // max-width at equal specificity and `.wc-container` (1180px, defined
    // later in the unlayered globals.css) wins over a Tailwind utility in
    // `@layer utilities`, so the reading measure is silently ignored. Same
    // collision documented on the announcement detail page.
    <div className="wc-container py-5 pb-16">
      <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/djs"
        className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All DJs
      </Link>

      <div className="flex items-start gap-4 mb-6">
        {photos[0] ? (
          <Image
            src={photos[0]}
            alt=""
            width={96}
            height={96}
            className="rounded-full h-20 w-20 sm:h-24 sm:w-24 object-cover flex-none"
          />
        ) : (
          <div className={`wc-mono ${monoClassFor(dj.id)} w-20 h-20 sm:w-24 sm:h-24 flex-none text-3xl`}>
            {initialsFor(dj.displayName).slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">{dj.displayName}</h1>
          {dj.bio ? <p className="max-w-prose">{dj.bio}</p> : null}
        </div>
      </div>

      <h2 className="text-lg font-extrabold mb-3">Shows</h2>
      {dj.activeShows.length === 0 ? (
        <PublicEmpty message="Not currently hosting a show." />
      ) : (
        <div className="wc-card divide-y" data-testid="public-dj-shows">
          {dj.activeShows.map((show) => (
            <Link
              key={show.id}
              href={`/shows/${show.slug}`}
              className="wc-card-pad flex items-center justify-between gap-3 hover:bg-muted transition-colors"
            >
              <div className="font-bold truncate">{show.name}</div>
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
