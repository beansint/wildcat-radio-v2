"use client";

/**
 * FE#51 — shared `/mod` table toolbar: a search input (leading icon +
 * `aria-label`), optional extra controls (e.g. a filter button), and an
 * optional right-aligned summary/count slot.
 *
 * Renders on the `.wc-toolbar` / `.wc-search` classes ported into
 * `globals.css` from the prototype (flex row, gap, padding, border-bottom;
 * the search box gets the leading-icon padding). This is purely markup +
 * wiring — see `src/lib/pagination/range.ts` for the pure logic this module
 * pairs with (`TablePagination`, in the sibling file).
 */
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface TableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  /** e.g. "mod-users-search" — omit to leave the input untestid'd. */
  searchTestId?: string;
  /** Extra controls between the search box and the summary slot (e.g. a filter button). */
  children?: ReactNode;
  /** Right-aligned count/summary content, e.g. "42 users". */
  summary?: ReactNode;
  className?: string;
}

export function TableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchAriaLabel = "Search",
  searchTestId,
  children,
  summary,
  className,
}: TableToolbarProps) {
  return (
    <div className={["wc-toolbar", className].filter(Boolean).join(" ")}>
      <div className="wc-search">
        <Search aria-hidden="true" />
        <Input
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
          data-testid={searchTestId}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {children}
      {summary !== undefined && (
        <span className="ml-auto wc-muted text-sm tnum">{summary}</span>
      )}
    </div>
  );
}
