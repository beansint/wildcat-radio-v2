"use client";

/**
 * /admin/staff — "Staff review" (BEA-184), 1:1 with
 * docs/frontend-design-basis-prototype/admin/staff.html. CUSTODIAN-only
 * (guarded by `(staff)/admin/layout.tsx`); this file renders only the
 * main-content column — the layout supplies `wc-shell`/`StaffSidebar`/
 * `wc-main`.
 *
 * Modeled closely on `@/app/(staff)/mod/users/page.tsx` (searchable,
 * paginated staff table: 350ms debounce, PAGE_SIZE = 20, toolbar +
 * pagination-footer markup) — read that file first if extending this one.
 *
 * Two lists, two mutations:
 * - Active moderators: `useAdminControllerListModerators({ q, page, pageSize })`,
 *   searchable + paginated.
 * - Deactivated: `useAdminControllerListDeactivated({ pageSize: 100 })` — no
 *   toolbar/search in the prototype, and in practice a small, slow-growing
 *   list, so one page is fetched and rendered without its own pager.
 * - Promote (`adminControllerPromote`) / Deactivate (`adminControllerDeactivate`)
 *   both invalidate BOTH list query keys on success — a row moves from one
 *   table to the other, and the e2e suite (SR-W-02/W-03) asserts that
 *   happens without a manual page reload.
 *
 * Deliberate collapse (documented per house convention, see
 * `mod/users/page.tsx:11-27`): the prototype shows both a "Demote" and a
 * "Deactivate" button per active row (staff.html:95-96), but both operations
 * land the account on LISTENER — they are the same action. Only ONE
 * role-removing control ("Deactivate") is wired up here; the inert "Demote"
 * button is not reproduced. See README § "Decided semantics" 2 and SR-W-08.
 *
 * "Last action" column divergence between the two tables, matching the
 * prototype's own two examples (staff.html:91 vs. :170): the active table
 * renders `lastActionAt` *relatively* ("2 hours ago", via `formatRelative`)
 * since it's usually recent; the deactivated table renders `deactivatedAt`
 * *absolutely* ("Mar 2026", via `formatJoined`) since a deactivation can be
 * long past and "N weeks ago" stops being a useful scale. Both are read off
 * `StaffMemberDto`, which carries both fields.
 *
 * "Yearly review" info card copy ("last reviewed June 2025", staff.html:183)
 * has no backing data source anywhere in `StaffMemberDto`/`StaffListDto` —
 * per the test suite README, this is deliberately static presentational
 * copy (SR-W-09 asserts only that it renders), not a fabricated dynamic
 * value.
 *
 * "View audit" (staff.html:94/171) is a plain link to `/mod/logs` — that
 * page is reserved (other agents own `(staff)/mod/logs/**`) and has no
 * per-user filter query param today, so this only proves reachability
 * (README § Coverage: "not covered, deliberately" beyond that).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, CalendarCheck } from "lucide-react";
import Link from "next/link";
import {
  useAdminControllerListModerators,
  useAdminControllerListDeactivated,
  adminControllerPromote,
  adminControllerDeactivate,
  getAdminControllerListModeratorsQueryKey,
  getAdminControllerListDeactivatedQueryKey,
} from "@/lib/api/endpoints/admin/admin";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { StaffMemberDto } from "@/lib/api/model";
import { DataTable, type DataTableColumn } from "@/components/mod/data-table";
import { StatusPill } from "@/components/mod/status-pill";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatJoined, formatRelative } from "@/components/mod/admin/format";
import type { PromoteFormValues, DeactivateFormValues } from "@/components/mod/admin/schemas";
import { PromoteModeratorDialog } from "@/components/mod/admin/promote-moderator-dialog";
import { DeactivateModeratorDialog } from "@/components/mod/admin/deactivate-moderator-dialog";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
const DEACTIVATED_PAGE_SIZE = 100;

export default function StaffReviewPage() {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [promoteOpen, setPromoteOpen] = useState(false);
  const promoteOpenerRef = useRef<HTMLButtonElement>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMemberDto | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const moderatorsQuery = useAdminControllerListModerators({
    q: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const deactivatedQuery = useAdminControllerListDeactivated({
    page: 1,
    pageSize: DEACTIVATED_PAGE_SIZE,
  });

  const activeItems = moderatorsQuery.data?.items ?? [];
  const activeTotal = moderatorsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE));

  const deactivatedItems = deactivatedQuery.data?.items ?? [];

  function invalidateStaffLists() {
    queryClient.invalidateQueries({ queryKey: getAdminControllerListModeratorsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminControllerListDeactivatedQueryKey() });
  }

  const promoteMutation = useMutation({
    mutationFn: (values: PromoteFormValues) =>
      adminControllerPromote({
        body: JSON.stringify({ email: values.email, reason: values.reason }),
      }),
    onSuccess: () => {
      invalidateStaffLists();
      setPromoteOpen(false);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (vars: { id: string; values: DeactivateFormValues }) =>
      adminControllerDeactivate(vars.id, {
        body: JSON.stringify({ reason: vars.values.reason }),
      }),
    onSuccess: () => {
      invalidateStaffLists();
      setDeactivateTarget(null);
    },
  });

  const activeColumns: DataTableColumn<StaffMemberDto>[] = [
    { key: "name", header: "Name", cell: (m) => <span className="font-bold whitespace-nowrap">{m.name}</span> },
    { key: "email", header: "Email", cell: (m) => <span className="wc-muted">{m.email}</span> },
    {
      key: "status",
      header: "Status",
      cell: () => <StatusPill variant="ok">Active</StatusPill>,
    },
    {
      key: "joined",
      header: "Joined",
      cell: (m) => <span className="tnum whitespace-nowrap">{formatJoined(m.joinedAt)}</span>,
    },
    {
      key: "lastAction",
      header: "Last action",
      cell: (m) => (
        <span className="tnum whitespace-nowrap">{formatRelative(m.lastActionAt, Date.now())}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (m) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild data-testid="admin-staff-view-audit">
            <Link href="/mod/logs">View audit</Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            data-testid="admin-staff-deactivate"
            onClick={() => setDeactivateTarget(m)}
          >
            Deactivate
          </Button>
        </div>
      ),
    },
  ];

  const deactivatedColumns: DataTableColumn<StaffMemberDto>[] = [
    {
      key: "name",
      header: "Name",
      className: "opacity-60",
      cell: (m) => <span className="font-bold whitespace-nowrap">{m.name}</span>,
    },
    {
      key: "email",
      header: "Email",
      className: "opacity-60",
      cell: (m) => <span>{m.email}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "opacity-60",
      cell: () => <StatusPill variant="neutral">Deactivated</StatusPill>,
    },
    {
      key: "joined",
      header: "Joined",
      className: "opacity-60",
      cell: (m) => <span className="tnum whitespace-nowrap">{formatJoined(m.joinedAt)}</span>,
    },
    {
      key: "lastAction",
      header: "Last action",
      className: "opacity-60",
      cell: (m) => (
        <span className="tnum whitespace-nowrap">
          {m.deactivatedAt ? formatJoined(m.deactivatedAt) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "opacity-60",
      cell: () => (
        <Button variant="outline" size="sm" asChild data-testid="admin-staff-deactivated-view-audit">
          <Link href="/mod/logs">View audit</Link>
        </Button>
      ),
    },
  ];

  const rangeStart = activeTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, activeTotal);

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold">Staff review</h1>
          <p className="wc-muted">
            Promote, audit &amp; deactivate moderators. Custodian-only — every action here is logged.
          </p>
        </div>
        <Button
          ref={promoteOpenerRef}
          data-testid="admin-staff-promote-open"
          onClick={() => setPromoteOpen(true)}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Promote moderator
        </Button>
      </header>

      {/* Active moderators */}
      <section className="mb-6">
        <h2 className="text-sm font-extrabold uppercase tracking-wide wc-muted mb-2">Active moderators</h2>
        <div className="wc-card overflow-hidden">
          <div
            className="flex items-center gap-2.5 flex-wrap p-3 md:px-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="relative flex-1 min-w-[170px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 wc-muted pointer-events-none"
                aria-hidden="true"
              />
              <Input
                style={{ paddingLeft: "2.25rem" }}
                type="search"
                placeholder="Search staff…"
                aria-label="Search staff"
                data-testid="admin-staff-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <span className="ml-auto wc-muted text-sm tnum" data-testid="admin-staff-count">
              {activeTotal} moderator{activeTotal === 1 ? "" : "s"}
            </span>
          </div>

          {moderatorsQuery.isPending ? (
            <div className="p-6 text-center wc-muted">Loading…</div>
          ) : (
            <DataTable
              columns={activeColumns}
              rows={activeItems}
              testid="admin-staff-active"
              rowKey={(m) => m.id}
              emptyState={<div className="p-6 text-center wc-muted">No moderators found</div>}
            />
          )}

          <div
            className="flex items-center justify-between gap-2.5 p-3 md:px-4 border-t text-sm wc-muted"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="tnum">
              Showing {rangeStart}–{rangeEnd} of {activeTotal}
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                data-testid="admin-staff-prev"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="admin-staff-next"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Deactivated */}
      <section className="mb-6">
        <h2 className="text-sm font-extrabold uppercase tracking-wide wc-muted mb-2">Deactivated</h2>
        <div className="wc-card overflow-hidden">
          {deactivatedQuery.isPending ? (
            <div className="p-6 text-center wc-muted">Loading…</div>
          ) : (
            <DataTable
              columns={deactivatedColumns}
              rows={deactivatedItems}
              testid="admin-staff-deactivated"
              rowKey={(m) => m.id}
              emptyState={<div className="p-6 text-center wc-muted">No deactivated moderators</div>}
            />
          )}
        </div>
      </section>

      {/* Yearly review info card — static copy, no data source (see file-header note). */}
      <div
        className="wc-card wc-card-pad flex items-start gap-3"
        style={{ background: "var(--accent)", borderColor: "transparent" }}
      >
        <CalendarCheck className="w-5 h-5 mt-0.5 text-maroon" aria-hidden="true" />
        <div>
          <div className="font-bold">Yearly review</div>
          <p className="wc-muted text-sm">
            Moderator terms run one academic year. Each June, run the election &amp; re-confirm or rotate the
            roster — last reviewed <span className="tnum">June 2025</span>.
          </p>
        </div>
      </div>

      <PromoteModeratorDialog
        open={promoteOpen}
        onOpenChange={(next) => {
          setPromoteOpen(next);
          // WAI-ARIA dialog pattern: closing returns focus to the control that
          // opened it, so a keyboard user is not dumped back at <body>. The
          // table refetches on close and re-renders this header, which loses
          // the automatic restore — so do it after that paint.
          if (!next) requestAnimationFrame(() => promoteOpenerRef.current?.focus());
        }}
        onSubmit={(values) => promoteMutation.mutate(values)}
        pending={promoteMutation.isPending}
        error={promoteMutation.isError ? getApiErrorMessage(promoteMutation.error) : null}
      />

      {deactivateTarget && (
        <DeactivateModeratorDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeactivateTarget(null);
          }}
          targetName={deactivateTarget.name}
          onSubmit={(values) => deactivateMutation.mutate({ id: deactivateTarget.id, values })}
          pending={deactivateMutation.isPending}
          error={deactivateMutation.isError ? getApiErrorMessage(deactivateMutation.error) : null}
        />
      )}
    </div>
  );
}
