"use client";

/**
 * /mod/users — 1:1 with
 * docs/frontend-design-basis-prototype/mod/users.html
 *
 * Search/paginate `GET /api/users` (moderator-only) and act on a row:
 * View (read-only detail), Strike (shared StrikeDialog, "manage" mode),
 * Mute/Ban (shared ConfirmDialog → `moderationControllerAction`),
 * Force-rename (own small dialog → `usersControllerForceRename`).
 *
 * NOTE on the prototype's `.wc-toolbar` / `.wc-search` / `.wc-pagination`
 * classes: they're defined in the prototype's own theme.css but were never
 * ported into this app's globals.css (verified — no occurrences repo-wide).
 * Editing globals.css is outside this page's file-ownership, so the
 * toolbar/search-input/pagination-footer rows below are built with
 * Tailwind utilities that reproduce the same visual layout instead of
 * relying on those class names. Flagged for a follow-up globals.css pass.
 *
 * NOTE on strike history: `UserSummaryDto` (this page's only per-user data
 * source) exposes `activeStrikeCount` but not the underlying `StrikeDto[]`
 * list — there's no "get another user's strikes" endpoint in
 * users.ts/moderation.ts (only `MeStandingDto.strikes` for the *current*
 * user). The shared `StrikeDialog` accepts an optional `existingStrikes`
 * prop for exactly this reason; it's omitted here (falls back to its own
 * "No strikes on record." state) rather than faked. See the task report for
 * the full list of deviations.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ListFilter } from "lucide-react";
import {
  useUsersControllerSearchUsers,
  getUsersControllerSearchUsersQueryKey,
} from "@/lib/api/endpoints/users/users";
import { moderationControllerStrike, moderationControllerAction } from "@/lib/api/endpoints/moderation/moderation";
import { getApiErrorMessage } from "@/lib/api/error-message";
import {
  UsersControllerSearchUsersClass,
  ModerationActionResultDtoType,
  type UserSearchResultDto,
  type UserSummaryDto,
} from "@/lib/api/model";
import type { StrikeDialogValues } from "@/components/mod/strike-dialog";
import { DataTable, type DataTableColumn } from "@/components/mod/data-table";
import { StatusPill } from "@/components/mod/status-pill";
import { StrikeDialog } from "@/components/mod/strike-dialog";
import { ConfirmDialog } from "@/components/mod/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RenameDialog } from "@/components/mod/users/rename-dialog";
import { ViewDialog } from "@/components/mod/users/view-dialog";
import { userStatus } from "@/components/mod/users/status";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
/** Default duration for a direct "Mute" row action (no duration picker in
 *  the prototype's ConfirmDialog step) — matches the strike ladder's 1st-strike mute window. */
const DEFAULT_MUTE_MS = 24 * 60 * 60 * 1000;

type ClassFilter = "ALL" | UsersControllerSearchUsersClass;

const CLASS_FILTER_CYCLE: ClassFilter[] = ["ALL", UsersControllerSearchUsersClass.CAMPUS, UsersControllerSearchUsersClass.GUEST];

function classFilterLabel(filter: ClassFilter): string {
  return filter === "ALL" ? "All" : filter === "CAMPUS" ? "Campus" : "Guest";
}

type ConfirmAction = { user: UserSummaryDto; kind: "MUTE" | "BAN" };

export default function UsersPage() {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<ClassFilter>("ALL");
  const [page, setPage] = useState(1);

  const [viewTarget, setViewTarget] = useState<UserSummaryDto | null>(null);
  const [strikeTarget, setStrikeTarget] = useState<UserSummaryDto | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [renameTarget, setRenameTarget] = useState<UserSummaryDto | null>(null);

  // Debounce the free-text search — mirrors the attendance page's filter
  // state shape (local input state feeding the query hook), but adds a
  // timer since `q` hits the DB on every keystroke otherwise.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const usersQuery = useUsersControllerSearchUsers<UserSearchResultDto>({
    q: search || undefined,
    class: classFilter === "ALL" ? undefined : classFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: getUsersControllerSearchUsersQueryKey() });
  }

  function cycleClassFilter() {
    const next = CLASS_FILTER_CYCLE[(CLASS_FILTER_CYCLE.indexOf(classFilter) + 1) % CLASS_FILTER_CYCLE.length];
    setClassFilter(next);
    setPage(1);
  }

  // Single mutation object for the shared StrikeDialog's submit — branches
  // on the form's severityOverride switch: a plain strike goes through the
  // ladder (`moderationControllerStrike`), an override skips straight to a
  // direct SEVERITY_OVERRIDE action (per the dialog's own copy: "skips the
  // ladder straight to a ban and notifies the custodian").
  const strikeMutation = useMutation({
    mutationFn: async (vars: { userId: string; values: StrikeDialogValues }) => {
      if (vars.values.severityOverride) {
        return moderationControllerAction(vars.userId, {
          body: JSON.stringify({
            type: ModerationActionResultDtoType.SEVERITY_OVERRIDE,
            reason: vars.values.overrideReason,
          }),
        });
      }
      return moderationControllerStrike(vars.userId, {
        body: JSON.stringify({ reason: vars.values.reason }),
      });
    },
    onSuccess: () => {
      invalidateUsers();
      setStrikeTarget(null);
    },
  });

  // Mute/Ban row actions — the shared ConfirmDialog has no free-text reason
  // field (title/description/confirm only), so these send a fixed,
  // descriptive default reason. A duration picker would be needed for a
  // real "how long" mute UI; DEFAULT_MUTE_MS covers the ConfirmDialog-only
  // constraint given in the task spec. See file-header note + task report.
  const standingMutation = useMutation({
    mutationFn: (vars: ConfirmAction) =>
      moderationControllerAction(vars.user.id, {
        body: JSON.stringify({
          type: vars.kind,
          reason:
            vars.kind === "MUTE"
              ? "Muted via /mod/users moderation panel."
              : "Banned via /mod/users moderation panel.",
          ...(vars.kind === "MUTE" ? { expiresAt: new Date(Date.now() + DEFAULT_MUTE_MS).toISOString() } : {}),
        }),
      }),
    onSuccess: () => {
      invalidateUsers();
      setConfirmAction(null);
    },
  });

  const columns: DataTableColumn<UserSummaryDto>[] = [
    {
      key: "name",
      header: "Display name",
      cell: (u) => (
        <div className="font-bold">
          @{u.handle}{" "}
          <span className="wc-chip-ghost text-[.6rem] ml-1">
            {u.role !== "LISTENER" ? u.role : u.class}
          </span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (u) => <span className="wc-muted">{u.email || "guest · no email"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => {
        const status = userStatus(u);
        return <StatusPill variant={status.variant}>{status.label}</StatusPill>;
      },
    },
    {
      key: "strikes",
      header: "Strikes",
      numeric: true,
      cell: (u) => <span className="tnum">{u.activeStrikeCount} of 3</span>,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (u) => (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            data-testid="mod-users-view"
            onClick={() => setViewTarget(u)}
          >
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="mod-users-strike"
            onClick={() => setStrikeTarget(u)}
          >
            Strike
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="mod-users-mute"
            onClick={() => setConfirmAction({ user: u, kind: "MUTE" })}
          >
            Mute
          </Button>
          <Button
            variant="destructive"
            size="sm"
            data-testid="mod-users-ban"
            onClick={() => setConfirmAction({ user: u, kind: "BAN" })}
          >
            Ban
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="mod-users-rename"
            onClick={() => setRenameTarget(u)}
          >
            Force-rename
          </Button>
        </div>
      ),
    },
  ];

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold">Users</h1>
        <p className="wc-muted">
          Look up listeners, review strikes, and apply mutes or bans. Every action is audit-logged.
        </p>
      </header>

      <div className="wc-card overflow-hidden">
        {/* toolbar — see file-header note: .wc-toolbar/.wc-search aren't in globals.css yet */}
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
              placeholder="Search users…"
              aria-label="Search"
              data-testid="mod-users-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            data-testid="mod-users-filter"
            aria-label={`Class filter: ${classFilterLabel(classFilter)}`}
            onClick={cycleClassFilter}
          >
            <ListFilter className="w-4 h-4" aria-hidden="true" />
            {classFilterLabel(classFilter)}
          </Button>
          <span className="ml-auto wc-muted text-sm tnum" data-testid="mod-users-count">
            {total} users
          </span>
        </div>

        {usersQuery.isPending ? (
          <div className="p-6 text-center wc-muted">Loading…</div>
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            testid="mod-users"
            rowKey={(u) => u.id}
            emptyState={<div className="p-6 text-center wc-muted">No users found</div>}
          />
        )}

        {/* pagination footer — see file-header note on .wc-pagination */}
        <div
          className="flex items-center justify-between gap-2.5 p-3 md:px-4 border-t text-sm wc-muted"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="tnum">
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              data-testid="mod-users-prev"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="mod-users-next"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {viewTarget && (
        <ViewDialog
          open
          onOpenChange={(open) => {
            if (!open) setViewTarget(null);
          }}
          user={viewTarget}
        />
      )}

      {strikeTarget && (
        <StrikeDialog
          open
          onOpenChange={(open) => {
            if (!open) setStrikeTarget(null);
          }}
          userHandle={strikeTarget.handle}
          mode="manage"
          onSubmit={(values) => strikeMutation.mutate({ userId: strikeTarget.id, values })}
          pending={strikeMutation.isPending}
          error={strikeMutation.isError ? getApiErrorMessage(strikeMutation.error) : null}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmAction.kind === "MUTE" ? `Mute @${confirmAction.user.handle}?` : `Ban @${confirmAction.user.handle}?`}
          description={
            confirmAction.kind === "MUTE"
              ? "Mutes this user for 24 hours. This action is audit-logged."
              : "Bans this user immediately. This action is audit-logged and can be appealed."
          }
          confirmLabel={confirmAction.kind === "MUTE" ? "Mute" : "Ban"}
          destructive={confirmAction.kind === "BAN"}
          pending={standingMutation.isPending}
          onConfirm={() => standingMutation.mutate(confirmAction)}
          testid={confirmAction.kind === "MUTE" ? "mod-users-mute-confirm" : "mod-users-ban-confirm"}
        />
      )}

      {renameTarget && (
        <RenameDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null);
          }}
          user={renameTarget}
          onRenamed={() => {
            invalidateUsers();
            setRenameTarget(null);
          }}
        />
      )}
    </div>
  );
}
