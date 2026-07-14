"use client";

/**
 * Shared "Showing X–Y of {total}" + Prev/Next footer for the two /mod/logs
 * tables. Both endpoints are 1-based `page`/`pageSize` paginated
 * (`ModerationControllerGet{Audit,BroadcastLogs}Params`), so the range math
 * is identical for both tabs.
 */
import { Button } from "@/components/ui/button";

interface PaginationFooterProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function PaginationFooter({ page, pageSize, total, onPrev, onNext }: PaginationFooterProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = end < total;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
      <span className="tnum wc-muted text-sm">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          data-testid="mod-logs-prev"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="mod-logs-next"
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
