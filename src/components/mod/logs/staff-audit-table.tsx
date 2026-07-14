"use client";

/**
 * Staff audit panel body — table + pagination + helper copy. Same
 * outer-testid convention as `BroadcastActivityTable` (see that file's
 * header comment): outer `data-testid="mod-logs-audit-table"`, inner
 * `DataTable` shares the `mod-logs-row`/`mod-logs-empty` testids with the
 * broadcast table since only one panel is mounted at a time.
 */
import { DataTable, type DataTableColumn } from "@/components/mod/data-table";
import { PaginationFooter } from "@/components/mod/logs/pagination-footer";
import { auditActionMeta } from "@/components/mod/logs/log-meta";
import { formatLogTimestamp } from "@/components/mod/logs/logs-time";
import { StatusPill } from "@/components/mod/status-pill";
import type { StaffAuditEntryDto } from "@/lib/api/model";

function auditDetails(entry: StaffAuditEntryDto): string {
  const meta = entry.metadata;
  if (meta && typeof meta === "object") {
    const candidate =
      (meta as Record<string, unknown>).detail ??
      (meta as Record<string, unknown>).summary ??
      (meta as Record<string, unknown>).note;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (entry.entity) return `${entry.entity}${entry.entityId ? ` · ${entry.entityId}` : ""}`;
  return "—";
}

function auditReason(entry: StaffAuditEntryDto): string {
  const meta = entry.metadata;
  if (meta && typeof meta === "object") {
    const reason = (meta as Record<string, unknown>).reason;
    if (typeof reason === "string" && reason.trim()) return reason;
  }
  return "—";
}

interface StaffAuditTableProps {
  rows: StaffAuditEntryDto[];
  total: number;
  page: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
  isLoading: boolean;
}

export function StaffAuditTable({ rows, total, page, pageSize, onPrev, onNext, isLoading }: StaffAuditTableProps) {
  const columns: DataTableColumn<StaffAuditEntryDto>[] = [
    {
      key: "timestamp",
      header: "Timestamp",
      cell: (r) => <span className="tnum whitespace-nowrap">{formatLogTimestamp(r.createdAt)}</span>,
    },
    {
      key: "action",
      header: "Action",
      cell: (r) => {
        const meta = auditActionMeta(r.action);
        return <StatusPill variant={meta.variant}>{meta.label}</StatusPill>;
      },
    },
    { key: "details", header: "Details", cell: (r) => <span className="wc-muted">{auditDetails(r)}</span> },
    { key: "mod", header: "Mod", cell: (r) => <span>{r.actorId}</span> },
    { key: "reason", header: "Reason", cell: (r) => <span className="wc-muted">{auditReason(r)}</span> },
  ];

  return (
    <div data-testid="mod-logs-audit-table">
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
        Staff audit captures every mod action with a required reason. Append-only &amp; peer-visible — no edits, no deletes.
      </p>
    </div>
  );
}
