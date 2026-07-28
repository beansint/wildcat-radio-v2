/**
 * Public announcements list view model. The server already orders `items`
 * pinned-first then `publishedAt` desc — this never re-sorts, it only picks
 * the hero (first pinned, else the first item) and excludes it from the
 * rest exactly once.
 */
export interface AnnouncementListItem {
  id: string;
  isPinned: boolean;
  publishedAt: string | null;
}

export function selectHero<T extends AnnouncementListItem>(items: readonly T[]): T | null {
  return items.find((item) => item.isPinned) ?? items[0] ?? null;
}

export function restItems<T extends AnnouncementListItem>(items: readonly T[]): T[] {
  const hero = selectHero(items);
  if (!hero) return [];

  let heroSkipped = false;
  return items.filter((item) => {
    if (!heroSkipped && item.id === hero.id) {
      heroSkipped = true;
      return false;
    }
    return true;
  });
}
