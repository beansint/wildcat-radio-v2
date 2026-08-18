"use client";

/**
 * Shared "Showing X–Y of {total}" + Prev/Next footer for the two /mod/logs
 * tables. Both endpoints are 1-based `page`/`pageSize` paginated
 * (`ModerationControllerGet{Audit,BroadcastLogs}Params`), so the range math
 * is identical for both tabs.
 *
 * FE#51: thin wrapper over the shared `TablePagination` (same range math,
 * `src/lib/pagination/range.ts`) — kept as its own file so the
 * `mod-logs-prev`/`mod-logs-next` testids (bound by e2e/mod-logs.spec.ts)
 * don't need every call site to spell out `testidPrefix="mod-logs"`.
 */
import { TablePagination } from "@/components/mod/table-pagination";

interface PaginationFooterProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function PaginationFooter({ page, pageSize, total, onPrev, onNext }: PaginationFooterProps) {
  return (
    <TablePagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPrev={onPrev}
      onNext={onNext}
      testidPrefix="mod-logs"
    />
  );
}
