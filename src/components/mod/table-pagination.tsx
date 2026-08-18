"use client";

/**
 * FE#51 — shared `/mod` table pagination footer: "Showing X–Y of total" +
 * Prev/Next, correctly disabled at the first/last page. Renders on the
 * `.wc-pagination` class ported into `globals.css` from the prototype
 * (flex row, space-between, padding, border-top).
 *
 * The range math itself lives in `src/lib/pagination/range.ts` (pure,
 * unit-tested) — this component is just the wiring + markup around it.
 */
import { Button } from "@/components/ui/button";
import { paginationRange } from "@/lib/pagination/range";

export interface TablePaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  /** Base testid; buttons get `${testidPrefix}-prev` / `${testidPrefix}-next`. */
  testidPrefix: string;
  className?: string;
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
  testidPrefix,
  className,
}: TablePaginationProps) {
  const { start, end, hasPrev, hasNext } = paginationRange(page, pageSize, total);

  return (
    <div className={["wc-pagination", className].filter(Boolean).join(" ")}>
      <span className="tnum">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          data-testid={`${testidPrefix}-prev`}
          disabled={!hasPrev}
          onClick={onPrev}
        >
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid={`${testidPrefix}-next`}
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
