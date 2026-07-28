/**
 * Public announcement addresses (FE#9 AC-11, backend AC-C9/AC-C10).
 *
 * The address is `/announcements/<slug>-<publicId>`: the slug is decorative
 * and the trailing `publicId` is what the API actually resolves. That split is
 * the whole point — a moderator can fix a typo in a published title, the slug
 * regenerates, and every link already shared keeps working because the id never
 * changes. The page corrects the address afterwards via `isCanonicalRef`.
 */

export interface AnnouncementRef {
  slug: string;
  publicId: string;
}

/** Canonical public path for an announcement. */
export function announcementPath(announcement: AnnouncementRef): string {
  return `/announcements/${announcementRef(announcement)}`;
}

/** The `<slug>-<publicId>` reference segment on its own. */
export function announcementRef({ slug, publicId }: AnnouncementRef): string {
  // A slug can be empty in theory (the API falls back, but don't assume it):
  // emitting `-<id>` would be an ugly address and a confusing canonical target.
  return slug ? `${slug}-${publicId}` : publicId;
}

/**
 * True when the reference in the URL already matches the canonical one, so the
 * page only rewrites the address when it genuinely differs. Old bare-cuid links
 * and stale slugs both resolve server-side and land here as non-canonical.
 */
export function isCanonicalRef(ref: string, announcement: AnnouncementRef): boolean {
  return ref === announcementRef(announcement);
}
