"use client";

/**
 * Public `/djs` — active roster only (PUB-C-05: inactive DJs are filtered
 * server-side and disappear from the next read as soon as they're
 * deactivated).
 */
import Link from "next/link";
import Image from "next/image";
import { Mic2 } from "lucide-react";
import { useListDjsPublic } from "@/lib/api/endpoints/djs-public/djs-public";
import { classifyQueryError, filterAllowedPhotoUrls } from "@/lib/content/format";
import { initialsFor, monoClassFor } from "@/lib/content/cover";
import { PublicEmpty, PublicGenericError, PublicRateLimited } from "@/components/public/public-states";

export function DjsClient() {
  const query = useListDjsPublic({ query: { retry: false } });
  const djs = query.data ?? [];
  const err = query.isError ? classifyQueryError(query.error) : null;

  return (
    <div className="pb-16">
      <section className="wc-container py-6 md:py-8">
        <div className="mb-1 flex items-center gap-2">
          <Mic2 className="h-5 w-5 text-maroon" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">Our DJs</h1>
        </div>
        <p className="wc-muted">The voices behind Wildcat Radio. Pick a DJ to see their shows.</p>
      </section>

      <section className="wc-container pb-10">
        {query.isLoading ? (
          <p className="wc-muted">Loading DJs…</p>
        ) : err?.rateLimited ? (
          <PublicRateLimited onRetry={() => query.refetch()} />
        ) : err ? (
          <PublicGenericError message={err.message} />
        ) : djs.length === 0 ? (
          <PublicEmpty message="No DJs listed yet." />
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            data-testid="public-djs-list"
          >
            {djs.map((dj) => {
              const photos = filterAllowedPhotoUrls(dj.photoUrl ? [dj.photoUrl] : []);
              return (
                <Link
                  key={dj.id}
                  href={`/djs/${dj.id}`}
                  className="wc-card wc-card-i wc-card-pad flex flex-col items-center text-center gap-2 hover:shadow-lg transition-shadow"
                  data-testid="public-dj-card"
                >
                  {photos[0] ? (
                    <Image
                      src={photos[0]}
                      alt=""
                      width={72}
                      height={72}
                      className="rounded-full h-16 w-16 object-cover"
                    />
                  ) : (
                    <div className={`wc-mono ${monoClassFor(dj.id)} h-16 w-16 text-lg`}>
                      {initialsFor(dj.displayName).slice(0, 1)}
                    </div>
                  )}
                  <div className="font-bold">{dj.displayName}</div>
                  {dj.currentShow ? (
                    <div className="text-xs wc-muted">{dj.currentShow.name}</div>
                  ) : null}
                  {dj.bio ? <p className="text-xs wc-muted line-clamp-2">{dj.bio}</p> : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
