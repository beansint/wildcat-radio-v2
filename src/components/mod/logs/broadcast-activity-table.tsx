"use client";

/**
 * Broadcast activity panel body — table + pagination + helper copy. Wrapped
 * in an outer `data-testid="mod-logs-broadcast-table"` div (the stable
 * testid the qa-plan asks for) around the generic `DataTable`, which itself
 * emits `mod-logs-row` / `mod-logs-empty` (shared with the audit table,
 * since only one panel is mounted at a time — see `DataTable`'s
 * `${testid}-row`/`${testid}-empty` convention in data-table.tsx).
 */
import { DataTable, type DataTableColumn } from "@/components/mod/data-table";
import { PaginationFooter } from "@/components/mod/logs/pagination-footer";
import { broadcastEventMeta } from "@/components/mod/logs/log-meta";
import { formatLogTimestamp } from "@/components/mod/logs/logs-time";
import type { BroadcastActivityEntryDto } from "@/lib/api/model";

function broadcastDetails(entry: BroadcastActivityEntryDto): string {
  const meta = entry.metadata;
  if (meta && typeof meta === "object") {
    const candidate = (meta as Record<string, unknown>).detail ?? (meta as Record<string, unknown>).note ?? (meta as Record<string, unknown>).reason;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (entry.episodeId) return `Episode ${entry.episodeId}`;
  if (entry.rosterId) return `Roster ${entry.rosterId}`;
  return "—";
}

function triggeredBy(entry: BroadcastActivityEntryDto): string {
  return entry.rosterId ? `Roster ${entry.rosterId}` : "System";
}

interface BroadcastActivityTableProps {
  rows: BroadcastActivityEntryDto[];
  total: number;
  page: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
  isLoading: boolean;
}

export function BroadcastActivityTable({
  rows,
  total,
  page,
  pageSize,
  onPrev,
  onNext,
  isLoading,
}: BroadcastActivityTableProps) {
  const columns: DataTableColumn<BroadcastActivityEntryDto>[] = [
    {
      key: "timestamp",
      header: "Timestamp",
      cell: (r) => <span className="tnum whitespace-nowrap">{formatLogTimestamp(r.createdAt)}</span>,
    },
    {
      key: "event",
      header: "Event",
      cell: (r) => {
        const meta = broadcastEventMeta(r.action);
        const Icon = meta.icon;
        return (
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Icon className={`w-4 h-4 ${meta.colorClass ?? "wc-muted"}`} aria-hidden="true" />
            {meta.label}
          </span>
        );
      },
    },
    { key: "details", header: "Details", cell: (r) => <span className="wc-muted">{broadcastDetails(r)}</span> },
    { key: "triggeredBy", header: "Triggered by", cell: (r) => <span>{triggeredBy(r)}</span> },
  ];

  return (
    <div data-testid="mod-logs-broadcast-table">
      <div className="wc-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center wc-muted">Loading…</div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              testid="mod-logs"
              rowKey={(r) => r.id}
              emptyState={<div className="p-6 text-center wc-muted">No entries for this range.</div>}
            />
            {rows.length > 0 && (
              <PaginationFooter page={page} pageSize={pageSize} total={total} onPrev={onPrev} onNext={onNext} />
            )}
          </>
        )}
      </div>
      <p className="wc-help mt-2">
        Broadcast events are recorded automatically by the system or the Broadcast PC. Append-only &amp; peer-visible.
      </p>
    </div>
  );
}
