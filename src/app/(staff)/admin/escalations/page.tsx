"use client";

/**
 * /admin/escalations — custodian-only review of moderator decisions escalated
 * for override. Renders inside `(staff)/admin/layout.tsx` (CUSTODIAN-only
 * guard, same wc-shell + StaffSidebar as /mod) — this file is just the
 * main-content column.
 *
 * Data: `useAdminControllerGetEscalations` -> `EscalationsDto { appeals,
 * reinstatements }`. Both lists are unfiltered by the backend (the DTO
 * comment says "Open appeals awaiting custodian oversight" but the type is
 * `AppealDto[]` with a `status` field spanning OPEN/UPHELD/REDUCED/
 * OVERTURNED) — this page derives the three tabs client-side by filtering on
 * `status === 'OPEN'` (pending) vs. `status !== 'OPEN'` (resolved).
 *
 * The enriched DTOs now carry the subject's `handle`/`class`/`role` (all
 * nullable) — rendered as `@handle` (falling back to an id-derived
 * placeholder when null) plus a `wc-chip-ghost` class chip. Still absent, so
 * still omitted per the task's "omit gracefully" instruction rather than
 * fabricated: a moderator recommendation, strike history, and a derivable
 * "eligible" flag.
 */
import { useState } from "react";
import { Scale, RotateCcw } from "lucide-react";
import { useAdminControllerGetEscalations } from "@/lib/api/endpoints/admin/admin";
import { AppealDtoStatus, ReinstatementRequestDtoStatus } from "@/lib/api/model";
import type { AppealDto, ReinstatementRequestDto, EscalationsDto } from "@/lib/api/model";
import { SegTabs } from "@/components/mod/seg-tabs";
import { DataTable, type DataTableColumn } from "@/components/mod/data-table";
import { StatusPill } from "@/components/mod/status-pill";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api/error-message";
import {
  EscalationDecisionDialog,
  subjectHandle,
  shortUserId,
  type DialogTarget,
} from "@/components/mod/escalations/escalation-decision-dialog";

type TabKey = "pending" | "reinstate" | "resolved";

type ResolvedRow =
  | { kind: "appeal"; item: AppealDto }
  | { kind: "reinstatement"; item: ReinstatementRequestDto };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function appealDecisionPill(status: AppealDtoStatus) {
  switch (status) {
    case AppealDtoStatus.OVERTURNED:
      return <StatusPill variant="ok">Overturned</StatusPill>;
    case AppealDtoStatus.UPHELD:
      return <StatusPill variant="bad">Upheld</StatusPill>;
    case AppealDtoStatus.REDUCED:
      return <StatusPill variant="warn">Reduced</StatusPill>;
    default:
      return null;
  }
}

function reinstatementDecisionPill(status: ReinstatementRequestDtoStatus) {
  switch (status) {
    case ReinstatementRequestDtoStatus.APPROVED:
      return <StatusPill variant="ok">Approved</StatusPill>;
    case ReinstatementRequestDtoStatus.DENIED:
      return <StatusPill variant="bad">Denied</StatusPill>;
    default:
      return null;
  }
}

export default function EscalationsPage() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [dialogTarget, setDialogTarget] = useState<DialogTarget | null>(null);

  const escalationsQuery = useAdminControllerGetEscalations<EscalationsDto>();
  const data = escalationsQuery.data;
  const appeals = data?.appeals ?? [];
  const reinstatements = data?.reinstatements ?? [];

  const pendingAppeals = appeals.filter((a) => a.status === AppealDtoStatus.OPEN);
  const pendingReinstatements = reinstatements.filter(
    (r) => r.status === ReinstatementRequestDtoStatus.OPEN,
  );
  const resolvedRows: ResolvedRow[] = [
    ...appeals
      .filter((a) => a.status !== AppealDtoStatus.OPEN)
      .map((item): ResolvedRow => ({ kind: "appeal", item })),
    ...reinstatements
      .filter((r) => r.status !== ReinstatementRequestDtoStatus.OPEN)
      .map((item): ResolvedRow => ({ kind: "reinstatement", item })),
  ].sort((a, b) => {
    const aDate = a.kind === "appeal" ? a.item.resolvedAt ?? a.item.createdAt : a.item.createdAt;
    const bDate = b.kind === "appeal" ? b.item.resolvedAt ?? b.item.createdAt : b.item.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  const columns: DataTableColumn<ResolvedRow>[] = [
    {
      key: "user",
      header: "User",
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-bold">{subjectHandle(r.item.handle, r.item.userId)}</span>
          {r.item.class && <span className="wc-chip-ghost">{r.item.class}</span>}
        </span>
      ),
    },
    {
      key: "case",
      header: "Case",
      cell: (r) => (r.kind === "appeal" ? "Appeal" : "Reinstatement"),
    },
    {
      key: "decision",
      header: "Decision",
      cell: (r) =>
        r.kind === "appeal"
          ? appealDecisionPill(r.item.status)
          : reinstatementDecisionPill(r.item.status),
    },
    {
      key: "by",
      header: "By",
      cell: (r) => {
        const byId = r.kind === "appeal" ? r.item.reviewedById : r.item.approvedById;
        return byId ? <span className="wc-muted">{shortUserId(byId)}</span> : <span className="wc-muted">—</span>;
      },
    },
    {
      key: "date",
      header: "Date",
      cell: (r) =>
        formatDate(r.kind === "appeal" ? r.item.resolvedAt ?? r.item.createdAt : r.item.createdAt),
    },
  ];

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold">Escalations</h1>
        <p className="wc-muted">
          Cases moderators sent up the ladder — final custodian decisions on appeals &amp;
          reinstatement. A written response is required on every decision.
        </p>
      </header>

      <SegTabs
        testid="esc-tabs"
        className="mb-5"
        value={tab}
        onValueChange={(key) => setTab(key as TabKey)}
        tabs={[
          { key: "pending", label: "Pending appeals", count: pendingAppeals.length },
          { key: "reinstate", label: "Reinstatement", count: pendingReinstatements.length },
          { key: "resolved", label: "Resolved", count: resolvedRows.length },
        ]}
      />

      {escalationsQuery.isError && (
        <div role="alert" className="mb-4 text-sm font-semibold text-destructive">
          {getApiErrorMessage(escalationsQuery.error)}
        </div>
      )}

      {escalationsQuery.isLoading ? (
        <p className="wc-muted">Loading escalations…</p>
      ) : (
        <>
          {tab === "pending" && (
            <div className="flex flex-col gap-3">
              {pendingAppeals.length === 0 ? (
                <div className="wc-card wc-card-pad text-center wc-muted" data-testid="esc-empty">
                  No open appeals awaiting a decision.
                </div>
              ) : (
                pendingAppeals.map((appeal) => (
                  <article key={appeal.id} className="wc-card wc-card-pad" data-testid="esc-appeal-card">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="wc-chip">
                            <Scale className="w-3.5 h-3.5" aria-hidden="true" />
                            Appeal
                          </span>
                          <span className="font-bold">{subjectHandle(appeal.handle, appeal.userId)}</span>
                          {appeal.class && <span className="wc-chip-ghost">{appeal.class}</span>}
                        </div>
                        <p className="wc-muted text-sm">
                          {appeal.subjectStrikeId
                            ? `Appealing strike ${appeal.subjectStrikeId}`
                            : "Appealing a moderation decision"}
                        </p>
                        <blockquote className="border-l-2 border-border pl-3 mt-2 text-sm italic">
                          {appeal.text}
                        </blockquote>
                      </div>
                      <Button
                        data-testid="esc-review"
                        onClick={() => setDialogTarget({ kind: "appeal", item: appeal })}
                      >
                        Review
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {tab === "reinstate" && (
            <div className="flex flex-col gap-3">
              {pendingReinstatements.length === 0 ? (
                <div className="wc-card wc-card-pad text-center wc-muted" data-testid="esc-empty">
                  No open reinstatement requests.
                </div>
              ) : (
                pendingReinstatements.map((request) => (
                  <article key={request.id} className="wc-card wc-card-pad" data-testid="esc-reinstate-card">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="wc-chip">
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            Reinstatement
                          </span>
                          <span className="font-bold">{subjectHandle(request.handle, request.userId)}</span>
                          {request.class && <span className="wc-chip-ghost">{request.class}</span>}
                        </div>
                        <blockquote className="border-l-2 border-border pl-3 mt-2 text-sm italic">
                          {request.text}
                        </blockquote>
                      </div>
                      <Button
                        data-testid="esc-review"
                        onClick={() => setDialogTarget({ kind: "reinstatement", item: request })}
                      >
                        Review
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {tab === "resolved" && (
            <div className="wc-card overflow-hidden">
              <DataTable
                columns={columns}
                rows={resolvedRows}
                testid="esc-resolved"
                rowKey={(r) => `${r.kind}-${r.item.id}`}
                emptyState={
                  <div className="p-6 text-center wc-muted">No resolved escalations yet.</div>
                }
              />
            </div>
          )}
        </>
      )}

      {dialogTarget && (
        <EscalationDecisionDialog
          open
          target={dialogTarget}
          onOpenChange={(open) => {
            if (!open) setDialogTarget(null);
          }}
          onDecided={() => setDialogTarget(null)}
        />
      )}
    </div>
  );
}
