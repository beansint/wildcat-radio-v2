"use client";

/**
 * /mod/logs — 1:1 with docs/frontend-design-basis-prototype/mod/logs.html.
 *
 * Two read-only, append-only audit tables behind a SegTabs switch:
 * Broadcast activity (`useModerationControllerGetBroadcastLogs`) and Staff
 * audit (`useModerationControllerGetAudit`). Both endpoints share the same
 * shape — `{ from?, to?, action?, page?, pageSize? }` in, `{ items, total }`
 * out — so the page holds one filter/pagination state machine and swaps
 * which query + which table component reads it based on the active tab.
 *
 * No mutations here: this is purely a read surface over an append-only log,
 * so there's no edit/delete affordance to wire up (unlike attendance's
 * `AttendanceEditDialog`).
 *
 * FE#51: added a search box to both tabs. Neither log endpoint takes a
 * free-text `q` param (see `src/lib/mod/log-search.ts`'s header note), so
 * this is a client-side quick-filter over the already-fetched page — the
 * Prev/Next footer keeps paginating the server's real page/total.
 */
import { useState } from "react";
import { Filter } from "lucide-react";
import {
  useModerationControllerGetAudit,
  useModerationControllerGetBroadcastLogs,
} from "@/lib/api/endpoints/moderation/moderation";
import type { BroadcastActivityPageDto, StaffAuditPageDto } from "@/lib/api/model";
import { SegTabs } from "@/components/mod/seg-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableToolbar } from "@/components/mod/table-toolbar";
import { BroadcastActivityTable } from "@/components/mod/logs/broadcast-activity-table";
import { StaffAuditTable } from "@/components/mod/logs/staff-audit-table";
import { BROADCAST_TYPE_OPTIONS, AUDIT_TYPE_OPTIONS } from "@/components/mod/logs/log-meta";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { stationLocalToUtcISO } from "@/lib/time/station";
import { matchesLogSearch } from "@/lib/mod/log-search";

const ALL_TYPES = "all";
const PAGE_SIZE = 20;

type LogTab = "broadcast" | "audit";

/** station-local 'YYYY-MM-DD' -> ISO instant at the *start* of that day, for the `from` param. */
function fromParam(date: string): string {
  return stationLocalToUtcISO(date, "00:00");
}

/** station-local 'YYYY-MM-DD' -> ISO instant at the *end* of that day, for the inclusive-end `to` param. */
function toParam(date: string): string {
  return stationLocalToUtcISO(date, "23:59");
}

export default function LogsPage() {
  const [tab, setTab] = useState<LogTab>("broadcast");

  // Draft date inputs vs. the committed filters the queries actually use —
  // From/To only refetch when "Apply" is clicked (typing a date shouldn't
  // fire a request per keystroke).
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [committedFrom, setCommittedFrom] = useState("");
  const [committedTo, setCommittedTo] = useState("");

  const [type, setType] = useState(ALL_TYPES);
  const [page, setPage] = useState(1);

  // Client-side quick-filter over the currently loaded page — see the
  // file-header note on why this isn't a server-side `q` param.
  const [search, setSearch] = useState("");

  function handleTabChange(next: string) {
    setTab(next as LogTab);
    setType(ALL_TYPES);
    setPage(1);
    setSearch("");
  }

  function handleApply() {
    setCommittedFrom(fromDraft);
    setCommittedTo(toDraft);
    setPage(1);
  }

  function handleTypeChange(next: string) {
    setType(next);
    setPage(1);
  }

  const action = type === ALL_TYPES ? undefined : type;
  const from = committedFrom ? fromParam(committedFrom) : undefined;
  const to = committedTo ? toParam(committedTo) : undefined;

  const broadcastQuery = useModerationControllerGetBroadcastLogs<BroadcastActivityPageDto>(
    { from, to, action, page, pageSize: PAGE_SIZE },
    { query: { enabled: tab === "broadcast" } },
  );
  const auditQuery = useModerationControllerGetAudit<StaffAuditPageDto>(
    { from, to, action, page, pageSize: PAGE_SIZE },
    { query: { enabled: tab === "audit" } },
  );

  const activeQuery = tab === "broadcast" ? broadcastQuery : auditQuery;
  const typeOptions = tab === "broadcast" ? BROADCAST_TYPE_OPTIONS : AUDIT_TYPE_OPTIONS;

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold">Logs</h1>
        <p className="wc-muted">
          Append-only &amp; peer-visible — entries can&apos;t be edited or deleted, and every mod can see every other
          mod&apos;s actions.
        </p>
      </header>

      <SegTabs
        className="mb-4 flex-wrap"
        testid="mod-logs-tabs"
        value={tab}
        onValueChange={handleTabChange}
        tabs={[
          { key: "broadcast", label: "Broadcast activity" },
          { key: "audit", label: "Staff audit" },
        ]}
      />

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <Label htmlFor="logs-from">From</Label>
          <Input
            id="logs-from"
            type="date"
            className="tnum max-w-[12rem]"
            data-testid="mod-logs-from"
            value={fromDraft}
            onChange={(e) => setFromDraft(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="logs-to">To</Label>
          <Input
            id="logs-to"
            type="date"
            className="tnum max-w-[12rem]"
            data-testid="mod-logs-to"
            value={toDraft}
            onChange={(e) => setToDraft(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="logs-type">Type</Label>
          <Select value={type} onValueChange={handleTypeChange}>
            <SelectTrigger id="logs-type" className="max-w-[14rem]" data-testid="mod-logs-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" data-testid="mod-logs-apply" onClick={handleApply}>
          <Filter className="w-4 h-4" aria-hidden="true" />
          Apply
        </Button>
      </div>

      {activeQuery.isError && (
        <div role="alert" className="mb-4 text-sm font-semibold text-destructive">
          {getApiErrorMessage(activeQuery.error)}
        </div>
      )}

      <div className="wc-card overflow-hidden mb-4">
        <TableToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={tab === "broadcast" ? "Search broadcast activity…" : "Search staff audit…"}
          searchTestId="mod-logs-search"
        />
      </div>

      {tab === "broadcast" ? (
        <BroadcastActivityTable
          rows={(broadcastQuery.data?.items ?? []).filter((r) => matchesLogSearch(r, search))}
          total={broadcastQuery.data?.total ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          isLoading={broadcastQuery.isLoading}
        />
      ) : (
        <StaffAuditTable
          rows={(auditQuery.data?.items ?? []).filter((r) => matchesLogSearch(r, search))}
          total={auditQuery.data?.total ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          isLoading={auditQuery.isLoading}
        />
      )}
    </div>
  );
}
