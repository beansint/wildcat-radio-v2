"use client";

/**
 * Public `/announcements` — pinned-first list of PUBLISHED announcements.
 * Hero = `selectHero()`, rest = `restItems()` from
 * `src/lib/announcements/list-view.ts` (already unit-tested — reused
 * verbatim, never re-sorted here). Server order is the contract (AC-2).
 */
import Link from "next/link";
import Image from "next/image";
import { Megaphone, Pin } from "lucide-react";
import { useAnnouncementsPublicControllerList } from "@/lib/api/endpoints/announcements-public/announcements-public";
import type { AnnouncementPublicDto } from "@/lib/api/model";
import { restItems, selectHero } from "@/lib/announcements/list-view";
import { announcementPath } from "@/lib/announcements/public-url";
import { classifyQueryError, filterAllowedPhotoUrls, formatPublishedAt, toParagraphs } from "@/lib/content/format";
import { coverClassFor, initialsFor } from "@/lib/content/cover";
import { PublicEmpty, PublicGenericError, PublicRateLimited } from "@/components/public/public-states";

function CoverTile({ announcement, className }: { announcement: AnnouncementPublicDto; className: string }) {
  const photos = filterAllowedPhotoUrls(announcement.photos);
  if (photos[0]) {
    return (
      <Image
        src={photos[0]}
        alt=""
        width={400}
        height={300}
        className={`${className} object-cover`}
      />
    );
  }
  // The prototype's hero media is an <img>, which carries an intrinsic aspect
  // ratio — that is what gives the card its height at `md:h-auto`. A <div>
  // placeholder has no intrinsic size, so it collapses and the card ends up as
  // short as its text (measured: 119px tall against the prototype's 326px).
  // The square ratio restores the prototype's proportions at `md:w-72`.
  return (
    <div className={`wc-cover ${coverClassFor(announcement.id)} ${className}`}>
      <span className="init">{initialsFor(announcement.title)}</span>
    </div>
  );
}

export function AnnouncementsClient() {
  const query = useAnnouncementsPublicControllerList(
    { pageSize: 100 },
    { query: { retry: false } },
  );

  const items = query.data?.items ?? [];
  const hero = selectHero(items);
  const rest = restItems(items);
  const err = query.isError ? classifyQueryError(query.error) : null;

  return (
    <div className="pb-16">
      <section className="wc-container py-6 md:py-8">
        <div className="mb-1 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-maroon" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">News &amp; announcements</h1>
        </div>
        <p className="wc-muted">Station updates and shoutouts from Wildcat Radio.</p>
      </section>

      {query.isLoading ? (
        <p className="wc-container wc-muted">Loading announcements…</p>
      ) : err?.rateLimited ? (
        <section className="wc-container pb-10">
          <PublicRateLimited onRetry={() => query.refetch()} />
        </section>
      ) : err ? (
        <section className="wc-container pb-10">
          <PublicGenericError message={err.message} />
        </section>
      ) : items.length === 0 ? (
        <section className="wc-container pb-10">
          <PublicEmpty message="No announcements yet — check back soon." />
        </section>
      ) : (
        <>
          {hero ? (
            <section className="wc-container pb-2">
              <Link
                href={announcementPath(hero)}
                className="wc-card block md:flex hover:shadow-lg transition-shadow"
                data-testid="public-announcement-card"
              >
                <CoverTile announcement={hero} className="md:w-72 w-full h-48 md:h-auto md:aspect-square md:self-stretch" />
                <div className="wc-card-pad flex flex-col justify-center">
                  {hero.isPinned && (
                    <span className="wc-chip-ghost self-start mb-2">
                      <Pin className="h-3 w-3" aria-hidden="true" />
                      Pinned
                    </span>
                  )}
                  <h3 className="text-xl font-extrabold mb-1">{hero.title}</h3>
                  <p className="wc-muted line-clamp-3">{toParagraphs(hero.content)[0]}</p>
                  <span className="text-sm font-semibold text-maroon mt-3">Read more →</span>
                </div>
              </Link>
            </section>
          ) : null}

          <section className="wc-container py-6 pb-10">
            <h2 className="text-lg font-extrabold mb-3">More announcements</h2>
            <div className="wc-card divide-y" data-testid="public-announcements-list">
              {rest.length === 0 ? (
                <p className="wc-card-pad wc-muted">No other announcements right now.</p>
              ) : (
                rest.map((item) => {
                  const publishedLabel = formatPublishedAt(item.publishedAt);
                  return (
                    <Link
                      key={item.id}
                      href={announcementPath(item)}
                      className="wc-card-pad flex items-center gap-3 hover:bg-muted transition-colors"
                      data-testid="public-announcement-card"
                    >
                      <CoverTile announcement={item} className="rounded-lg w-16 h-16 flex-none" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">{item.title}</div>
                        {publishedLabel ? (
                          <div className="text-sm wc-muted tnum">{publishedLabel}</div>
                        ) : null}
                      </div>
                      {item.isPinned ? (
                        <span className="wc-chip flex-none">
                          <Pin className="h-3 w-3" aria-hidden="true" />
                          Pinned
                        </span>
                      ) : null}
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
