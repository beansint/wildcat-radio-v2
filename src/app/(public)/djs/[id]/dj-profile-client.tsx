"use client";

/**
 * Public `/djs/[id]` — a DJ's public profile. An inactive DJ id 404s
 * directly at `GET /api/djs/:id` (no distinct "hidden" state) — rendered as
 * the shared not-found state, with no name leak (PUB-E-04).
 *
 * FE#45 adds the prototype's sticky "All DJs" switcher rail (`dj-profile.html`
 * lines 57-71) — reuses `useListDjsPublic`, the same hook `djs-client.tsx`
 * lists from, so the sibling roster is a single shared query-cache entry
 * rather than a second fetch pattern.
 */
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, CalendarDays } from "lucide-react";
import { useGetDjPublic, useListDjsPublic } from "@/lib/api/endpoints/djs-public/djs-public";
import { classifyQueryError, filterAllowedPhotoUrls } from "@/lib/content/format";
import { initialsFor, monoClassFor } from "@/lib/content/cover";
import { PublicEmpty, PublicGenericError, PublicNotFound, PublicRateLimited } from "@/components/public/public-states";

export function DjProfileClient() {
  const { id } = useParams<{ id: string }>();
  const query = useGetDjPublic(id, { query: { retry: false } });
  const siblingsQuery = useListDjsPublic({ query: { retry: false } });
  const siblings = siblingsQuery.data ?? [];

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
  const sinceYear = dj.since ? new Date(dj.since).getFullYear() : null;

  return (
    // `wc-container` and `max-w-*` must NOT share an element: both set
    // max-width at equal specificity and `.wc-container` (1180px, defined
    // later in the unlayered globals.css) wins over a Tailwind utility in
    // `@layer utilities`, so the reading measure is silently ignored. Same
    // collision documented on the announcement detail page. The profile
    // column below relies on this too — `max-w-prose` sits on the `<p>`
    // elements themselves, never on a `wc-container` ancestor.
    <main className="wc-container grid md:grid-cols-[240px_1fr] gap-5 md:gap-8 py-5 pb-16">
      {/* The prototype has no separate `/djs` index — this page *is* the
          index+detail. Our app splits them into distinct routes, so the
          "All DJs" rail already gives desktop viewers a way back/across;
          the chevron link only earns its keep on mobile, where the rail
          collapses to a horizontal strip that may be scrolled off top. */}
      <Link
        href="/djs"
        className="md:hidden inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground col-span-full"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All DJs
      </Link>

      <nav aria-label="All DJs" className="md:sticky md:top-[72px] self-start min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide wc-muted px-1 mb-2 hidden md:block">
          All DJs · {siblings.length}
        </div>
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible hide-scrollbar pb-1 min-w-0">
          {siblings.map((sibling) => (
            <Link
              key={sibling.id}
              href={`/djs/${sibling.id}`}
              className={`wc-djchip${sibling.id === dj.id ? " active" : ""}`}
              aria-current={sibling.id === dj.id ? "page" : undefined}
            >
              <span className={`wc-mono ${monoClassFor(sibling.id)} h-10 w-10 flex-none text-sm`}>
                {initialsFor(sibling.displayName).slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="font-bold block truncate">{sibling.displayName}</span>
                {sibling.currentShow ? (
                  <span className="text-xs wc-muted block truncate">{sibling.currentShow.name}</span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="min-w-0">
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
            {sinceYear ? (
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="wc-chip-ghost">
                  <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                  Since {sinceYear}
                </span>
              </div>
            ) : null}
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
    </main>
  );
}
