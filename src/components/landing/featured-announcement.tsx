"use client";

/**
 * Landing "Featured" section — wired to live data (was a static mock).
 * Hero selection reuses `selectHero()` (src/lib/announcements/list-view.ts)
 * so the landing page picks the exact same item `/announcements` would show
 * as its hero — never re-sorted, never re-derived.
 *
 * The prototype's "📣 Public"/"Listeners only" chip is dead: decision L35
 * removed the audience concept. A "Pinned" chip driven by `isPinned`
 * replaces it (only shown when true).
 */
import Image from "next/image";
import Link from "next/link";
import { Pin } from "lucide-react";
import { useAnnouncementsPublicControllerList } from "@/lib/api/endpoints/announcements-public/announcements-public";
import { selectHero } from "@/lib/announcements/list-view";
import { announcementPath } from "@/lib/announcements/public-url";
import { filterAllowedPhotoUrls, toParagraphs } from "@/lib/content/format";
import { coverClassFor, initialsFor } from "@/lib/content/cover";

export function FeaturedAnnouncement() {
  const query = useAnnouncementsPublicControllerList(
    { pageSize: 20 },
    { query: { retry: false } },
  );
  const hero = selectHero(query.data?.items ?? []);

  if (!hero) return null;

  const photos = filterAllowedPhotoUrls(hero.photos);

  return (
    <section className="wc-container py-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">Featured</h2>
        <Link href="/announcements" className="text-sm font-semibold text-maroon">
          All news →
        </Link>
      </div>
      <Link
        href={announcementPath(hero)}
        className="wc-card block md:flex hover:shadow-lg transition-shadow"
      >
        {photos[0] ? (
          <Image
            src={photos[0]}
            alt=""
            width={400}
            height={300}
            className="md:w-72 w-full h-48 md:h-auto md:self-stretch object-cover"
          />
        ) : (
          /* The prototype's media is an <img> whose intrinsic ratio gives the
             card its height at `md:h-auto`. A <div> has no intrinsic size, so
             without an explicit ratio the card collapses to the height of its
             text (measured: 119px vs the prototype's 326px). */
          <div
            className={`wc-cover ${coverClassFor(hero.id)} md:w-72 w-full h-48 md:h-auto md:aspect-square md:self-stretch`}
          >
            <span className="init">{initialsFor(hero.title)}</span>
          </div>
        )}
        <div className="wc-card-pad flex flex-col justify-center">
          {hero.isPinned ? (
            <span className="wc-chip-ghost self-start mb-2">
              <Pin className="h-3 w-3" aria-hidden="true" />
              Pinned
            </span>
          ) : null}
          <h3 className="text-xl font-extrabold mb-1">{hero.title}</h3>
          <p className="wc-muted line-clamp-3">{toParagraphs(hero.content)[0]}</p>
          <span className="text-sm font-semibold text-maroon mt-3">Read more →</span>
        </div>
      </Link>
    </section>
  );
}
