/**
 * Pure "Showing X–Y of total" range math, shared by every `/mod` table's
 * pagination footer (TablePagination, plus the pre-existing
 * `src/components/mod/logs/pagination-footer.tsx`). No React, no fetching.
 */

export interface PaginationRange {
  /** 1-based index of the first item on the page; 0 when `total` is 0. */
  start: number;
  /** 1-based index of the last item on the page. */
  end: number;
  /** Whether a Prev control should be enabled. */
  hasPrev: boolean;
  /** Whether a Next control should be enabled. */
  hasNext: boolean;
}

/**
 * `page` is 1-based. Clamped defensively — a `page` below 1 or beyond the
 * last page (e.g. stale state after `total` drops) still yields a sane,
 * non-negative range rather than a negative `start`.
 */
export function paginationRange(page: number, pageSize: number, total: number): PaginationRange {
  if (total <= 0 || pageSize <= 0) {
    return { start: 0, end: 0, hasPrev: false, hasNext: false };
  }

  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return {
    start: Math.min(start, total),
    end,
    hasPrev: safePage > 1,
    hasNext: end < total,
  };
}
