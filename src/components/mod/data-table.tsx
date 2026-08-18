"use client";

/**
 * Generic `/mod` data-table wrapper over the `wc-table` shadcn primitive
 * (src/components/ui/table.tsx). Header renders from `columns`; each body
 * row gets `data-testid={`${testid}-row`}` so specs can select rows without
 * copy/CSS (plan constraint: every interactive/listed element exposes a
 * stable testid). Wide tables scroll inside their own container — the page
 * body never scrolls horizontally (design-notes.md).
 *
 * FE#51: `toolbar`/`pagination`/`loading` are additive, optional slots —
 * every existing call site that omits them renders byte-for-byte the same
 * body element it did before (see the early-return below). Pass a
 * `TableToolbar`/`TablePagination` (src/components/mod/table-toolbar.tsx,
 * table-pagination.tsx) to opt a table into the shared search/pagination
 * chrome without hand-rolling it per page.
 */
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
  /** Unique key for React list identity + header cell testid suffix. */
  key: string;
  header: ReactNode;
  /** Render the cell for a given row. */
  cell: (row: T) => ReactNode;
  /** Right-align + tabular-nums, matching the prototype's `.num` column style. */
  numeric?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Base testid; each row gets `${testid}-row`, the table gets `${testid}-table`. */
  testid: string;
  /** Stable row key; defaults to array index if omitted. */
  rowKey?: (row: T, index: number) => string;
  /** Rendered instead of the table when `rows` is empty. */
  emptyState?: ReactNode;
  /**
   * Optional chrome rendered above the table body (e.g. a `TableToolbar`).
   * Omit to keep the old, toolbar-less render exactly as-is.
   */
  toolbar?: ReactNode;
  /**
   * Optional chrome rendered below the table body (e.g. a `TablePagination`
   * footer). Omit to keep the old, pagination-less render exactly as-is.
   */
  pagination?: ReactNode;
  /**
   * When true, renders `loadingState` (default a muted "Loading…" row)
   * instead of the table/empty state, while `toolbar`/`pagination` (if any)
   * still render — lets a search box stay interactive while its own query
   * is loading. Defaults to false, i.e. unchanged existing behaviour.
   */
  loading?: boolean;
  loadingState?: ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  testid,
  rowKey,
  emptyState,
  toolbar,
  pagination,
  loading = false,
  loadingState,
}: DataTableProps<T>) {
  let body: ReactNode;
  if (loading) {
    body = loadingState ?? <div className="p-6 text-center wc-muted">Loading…</div>;
  } else if (rows.length === 0 && emptyState) {
    body = <div data-testid={`${testid}-empty`}>{emptyState}</div>;
  } else {
    body = (
      <div className="overflow-x-auto">
        <Table data-testid={`${testid}-table`}>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.numeric ? "num" : undefined}
                  data-testid={`${testid}-col-${col.key}`}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={rowKey ? rowKey(row, index) : index}
                data-testid={`${testid}-row`}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={[col.numeric ? "num" : "", col.className ?? ""]
                      .filter(Boolean)
                      .join(" ") || undefined}
                  >
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!toolbar && !pagination) {
    return body;
  }

  return (
    <>
      {toolbar}
      {body}
      {pagination}
    </>
  );
}
