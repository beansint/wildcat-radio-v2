"use client";

/**
 * Generic `/mod` data-table wrapper over the `wc-table` shadcn primitive
 * (src/components/ui/table.tsx). Header renders from `columns`; each body
 * row gets `data-testid={`${testid}-row`}` so specs can select rows without
 * copy/CSS (plan constraint: every interactive/listed element exposes a
 * stable testid). Wide tables scroll inside their own container — the page
 * body never scrolls horizontally (design-notes.md).
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
}

export function DataTable<T>({
  columns,
  rows,
  testid,
  rowKey,
  emptyState,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <div data-testid={`${testid}-empty`}>{emptyState}</div>;
  }

  return (
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
