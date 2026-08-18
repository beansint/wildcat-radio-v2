"use client";

/**
 * Public `/announcements/[ref]` — a single PUBLISHED announcement, addressed as
 * `<slug>-<publicId>` (AC-11). The API resolves the trailing id and ignores the
 * slug, so an old bare-cuid link or a slug left stale by a title edit both still
 * land here; this page then quietly rewrites the address to the canonical one
 * rather than 404ing or leaving a wrong-looking URL in the bar. A DRAFT,
 * PENDING_REVIEW, REJECTED or ARCHIVED id (or an unknown one) all 404
 * identically at the API (PUB-C-03) — rendered here as the shared
 * `public-not-found` state, with no title leak.
 *
 * INV-1: the prototype's "Posted by Station Admin" byline and view counter
 * are dropped — neither exists on `AnnouncementPublicDto`, and the byline
 * would leak moderator identity onto a public page. See feature report for
 * the full deviation note.
 */
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Pin } from "lucide-react";
import { useAnnouncementsPublicControllerGetOne } from "@/lib/api/endpoints/announcements-public/announcements-public";
import { classifyQueryError, filterAllowedPhotoUrls, formatPublishedAt, toParagraphs } from "@/lib/content/format";
import { coverClassFor, initialsFor } from "@/lib/content/cover";
import { PublicGenericError, PublicNotFound, PublicRateLimited } from "@/components/public/public-states";
import { announcementPath, isCanonicalRef } from "@/lib/announcements/public-url";

export function AnnouncementDetailClient() {
  const { ref } = useParams<{ ref: string }>();
  const router = useRouter();
  const query = useAnnouncementsPublicControllerGetOne(ref, { query: { retry: false } });

  // Self-heal the address once the canonical slug is known. `replace`, not
  // `push`, so the stale URL doesn't become a back-button trap.
  const canonical = query.data;
  useEffect(() => {
    if (canonical && !isCanonicalRef(ref, canonical)) {
      router.replace(announcementPath(canonical));
    }
  }, [canonical, ref, router]);

  if (query.isLoading) {
    return <p className="wc-container py-10 wc-muted">Loading announcement…</p>;
  }

  if (query.isError) {
    const err = classifyQueryError(query.error);
    if (err.notFound) {
      return (
        <PublicNotFound
          heading="Announcement not found"
          message="This announcement doesn't exist, or isn't published."
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

  const announcement = query.data!;
  const paragraphs = toParagraphs(announcement.content);
  const photos = filterAllowedPhotoUrls(announcement.photos);
  const publishedLabel = formatPublishedAt(announcement.publishedAt);

  // `wc-container` and `max-w-3xl` must NOT share an element: both set
  // max-width at equal specificity, and `.wc-container` (defined later in
  // globals.css) wins — the reading measure silently became 1180px instead of
  // the prototype's 768px. So the container handles width and gutters, and the
  // inner article carries the reading measure. (The related shrink-to-fit bug
  // this page exposed is fixed at source on `.wc-container` in globals.css.)
  return (
    <div className="wc-container py-6 pb-16">
      <article className="mx-auto w-full max-w-3xl">
      <Link
        href="/announcements"
        className="inline-flex items-center gap-1 text-sm font-semibold wc-muted hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All announcements
      </Link>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {announcement.isPinned ? (
          <span className="wc-chip-ghost">
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned
          </span>
        ) : null}
        {publishedLabel ? (
          <span className="text-sm wc-muted tnum">Published {publishedLabel}</span>
        ) : null}
      </div>

      <h1 className="text-3xl font-extrabold mb-4">{announcement.title}</h1>

      {photos[0] ? (
        <Image
          src={photos[0]}
          alt=""
          width={900}
          height={500}
          className="wc-card w-full mb-5 object-cover"
        />
      ) : (
        <div className={`wc-cover ${coverClassFor(announcement.id)} w-full h-48 md:h-64 rounded-2xl mb-5`}>
          <span className="init">{initialsFor(announcement.title)}</span>
        </div>
      )}

      <div className="space-y-4 text-[1.02rem] leading-relaxed" data-testid="public-announcement-body">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      </article>
    </div>
  );
}
