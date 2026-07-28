"use client";

/**
 * Landing "Shows" grid — wired to live data (was a static mock).
 * `ShowPublicListItemDto` has no roster ref, so the prototype's "DJ Mara ·
 * DJ Cha" subline is dropped here too (see feature report / shows/page.tsx).
 */
import Image from "next/image";
import Link from "next/link";
import { useListShowsPublic } from "@/lib/api/endpoints/shows-public/shows-public";
import { filterAllowedPhotoUrls } from "@/lib/content/format";
import { coverClassFor, initialsFor } from "@/lib/content/cover";

export function ShowsGrid() {
  const query = useListShowsPublic({ query: { retry: false } });
  // Not sliced to a "preview" handful: PUB-I-02 asserts a specific fixture
  // show's name is visible here, and the roster is small enough station-wide
  // that showing everything is both correct and not a layout problem.
  const shows = query.data ?? [];

  if (shows.length === 0) return null;

  return (
    <section className="wc-container py-2 pb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">Shows</h2>
        <Link href="/shows" className="text-sm font-semibold text-maroon">
          All shows →
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {shows.map((show) => {
          const photos = filterAllowedPhotoUrls(show.coverImage ? [show.coverImage] : []);
          return (
            <Link
              key={show.id}
              href={`/shows/${show.slug}`}
              className="wc-card wc-card-i hover:shadow-lg transition-shadow"
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
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
