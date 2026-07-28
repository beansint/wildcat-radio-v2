/**
 * /mod/announcements tab <-> status mapping and per-tab counts.
 *
 * `GET /announcements/admin` now takes a `status` filter and returns
 * whole-table `countsByStatus`, so the tab badges are read off the server
 * rather than tallied from the returned page. Counting client-side was wrong
 * as soon as the table outgrew one page: with four figures of rows, badges
 * under-reported and a pinned row past page 1 was invisible to the pin-cap
 * check. Home per `.agent/test-suites/.../mod-announcements/unit.md`.
 */
import type { AnnouncementStatus } from "@/lib/announcements/lifecycle";

export type AnnouncementTabKey =
  | "draft"
  | "pending"
  | "scheduled"
  | "published"
  | "rejected"
  | "archived"
  | "all";

/** Order matches the binding testid list: mod-ann-tabs-{draft,pending,scheduled,published,rejected,archived,all}. */
export const ANNOUNCEMENT_TAB_KEYS: readonly AnnouncementTabKey[] = [
  "draft",
  "pending",
  "scheduled",
  "published",
  "rejected",
  "archived",
  "all",
];

const TAB_LABEL: Record<AnnouncementTabKey, string> = {
  draft: "Draft",
  pending: "Pending review",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
  archived: "Archived",
  all: "All",
};

export function tabLabel(tab: AnnouncementTabKey): string {
  return TAB_LABEL[tab];
}

export const TAB_STATUS: Record<Exclude<AnnouncementTabKey, "all">, AnnouncementStatus> = {
  draft: "DRAFT",
  pending: "PENDING_REVIEW",
  scheduled: "SCHEDULED",
  published: "PUBLISHED",
  rejected: "REJECTED",
  archived: "ARCHIVED",
};

export interface AnnouncementLike {
  status: AnnouncementStatus;
}

/** "all" never re-sorts or otherwise touches server order — it's a passthrough copy. */
export function filterByTab<T extends AnnouncementLike>(
  items: readonly T[],
  tab: AnnouncementTabKey,
): T[] {
  if (tab === "all") return [...items];
  const status = TAB_STATUS[tab];
  return items.filter((item) => item.status === status);
}

/** The `status` value to send to the API for a tab; `undefined` means "all". */
export function tabStatusParam(tab: AnnouncementTabKey): AnnouncementStatus | undefined {
  return tab === "all" ? undefined : TAB_STATUS[tab];
}

/** Exhaustive over every status — a row never falls into two tabs or zero tabs. */
export function countsByTab<T extends AnnouncementLike>(
  items: readonly T[],
): Record<AnnouncementTabKey, number> {
  const counts: Record<AnnouncementTabKey, number> = {
    draft: 0,
    pending: 0,
    scheduled: 0,
    published: 0,
    rejected: 0,
    archived: 0,
    all: items.length,
  };

  for (const item of items) {
    for (const tab of ANNOUNCEMENT_TAB_KEYS) {
      if (tab === "all") continue;
      if (TAB_STATUS[tab] === item.status) {
        counts[tab] += 1;
        break;
      }
    }
  }

  return counts;
}

/**
 * Tab badges from the server's whole-table `countsByStatus`, so they describe
 * the station rather than the page currently in hand. An absent status key
 * means zero rows, not a missing count.
 */
export function countsFromServer(
  countsByStatus: Readonly<Record<string, number>> | undefined,
): Record<AnnouncementTabKey, number> {
  const counts: Record<AnnouncementTabKey, number> = {
    draft: 0,
    pending: 0,
    scheduled: 0,
    published: 0,
    rejected: 0,
    archived: 0,
    all: 0,
  };
  if (!countsByStatus) return counts;

  let all = 0;
  for (const tab of ANNOUNCEMENT_TAB_KEYS) {
    if (tab === "all") continue;
    const n = countsByStatus[TAB_STATUS[tab]] ?? 0;
    counts[tab] = n;
    all += n;
  }
  counts.all = all;
  return counts;
}
